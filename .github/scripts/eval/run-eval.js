/**
 * Prompt-eval harness runner.
 *
 * Builds Aido's consolidated review prompt for each golden case, calls the
 * selected provider, and scores the output against the case's expected findings
 * and false-positive guards. Exits non-zero if any case fails — so a prompt
 * change can be validated with evidence instead of a hunch.
 *
 * Usage (needs a provider key in the environment):
 *   AIDO_PROVIDER=GEMINI GEMINI_API_KEY=... node .github/scripts/eval/run-eval.js
 *   AIDO_PROVIDER=CLAUDE AIDO_MODEL=claude-sonnet-4-6 CLAUDE_API_KEY=... node ...
 *
 * Note: LLM output is non-deterministic — treat results as a signal, not a unit
 * test. Re-run a borderline case a couple of times.
 */

const { makeConsolidatedPrompt } = require('../review/aido-review');
const { generate, resolveModel, defaultCallOpts } = require('../lib/providers');
const { cases, evalPersonas, toAddDiff } = require('./cases');
const { evaluateCase, summarize } = require('./evaluate');

function providerOpts(provider, model) {
  // fallbackModel:false — the eval must score the EXACT model requested. A 429
  // on the primary should fail (re-run it), not silently fall back to a sibling
  // and attribute its output to the requested model.
  //
  // maxTokens:1800 mirrors review's callProvider exactly — scoring Claude at a
  // different token budget (its SDK default is 2000) would measure a different
  // truncation point than production and make the eval unfaithful.
  return {
    model,
    fallbackModel: false,
    maxTokens: 1800,
    ...defaultCallOpts(provider, process.env.AIDO_BASE_URL),
  };
}

async function main() {
  const provider = (process.env.AIDO_PROVIDER || 'GEMINI').toUpperCase();
  const model = process.env.AIDO_MODEL || resolveModel({}, provider);
  // OPENAI (generic OpenAI-compatible) has no built-in default model, so an
  // unset AIDO_MODEL leaves it undefined — fail loudly instead of sending
  // `model: undefined` and attributing the result to "undefined".
  if (!model) {
    console.error(
      `No model for provider=${provider}. Set AIDO_MODEL (OPENAI has no default model).`,
    );
    process.exit(1);
  }
  console.log(`\n🧪 Aido prompt eval — provider=${provider} model=${model}\n`);

  const results = [];
  // Intentionally sequential: running cases concurrently would hammer one
  // provider/key and risk rate-limits (429), which would trigger the fallback
  // model mid-run and corrupt the eval (you'd be scoring the wrong model).
  // Case counts are small; accuracy beats speed here.
  for (const c of cases) {
    const context = {
      prTitle: c.prTitle,
      prBody: c.prBody,
      issueTitle: '',
      issueBody: '',
      diff: toAddDiff(c.filename, c.content),
    };
    const prompt = makeConsolidatedPrompt(evalPersonas, context);

    let output = '';
    try {
      output = await generate(provider, prompt, providerOpts(provider, model));
    } catch (e) {
      console.error(`  ✖ ${c.name}: provider call failed — ${e?.message || e}`);
      results.push({
        name: c.name,
        pass: false,
        score: 0,
        caught: 0,
        total: (c.expect || []).length,
        missed: ['<call-failed>'],
        violations: 0,
        violatedIds: [],
      });
      continue;
    }

    const r = evaluateCase(output, c);
    results.push(r);
    const mark = r.pass ? '✓' : '✖';
    const pct = Math.round(r.score * 100);
    let line = `  ${mark} ${c.name}: caught ${r.caught}/${r.total} (${pct}%, threshold ${Math.round(r.threshold * 100)}%)`;
    if (r.missed.length) line += ` · missed: ${r.missed.join(', ')}`;
    if (r.violations) line += ` · FALSE POSITIVES: ${r.violatedIds.join(', ')}`;
    console.log(line);
  }

  const s = summarize(results);
  console.log(
    `\n${s.pass ? '✅ PASS' : '❌ FAIL'} — ${s.passed}/${s.total} cases, avg score ${Math.round(s.avgScore * 100)}%\n`,
  );
  process.exit(s.pass ? 0 : 1);
}

if (require.main === module) {
  main().catch((e) => {
    console.error('Eval failed:', e?.message || e);
    process.exit(1);
  });
}

module.exports = { providerOpts };
