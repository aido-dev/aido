/**
 * Aido composite-action entrypoint.
 *
 * Lets Aido run as a step in someone else's workflow:
 *
 *   - uses: aido-dev/aido@v1
 *     with:
 *       command: review
 *       pr_number: ${{ github.event.pull_request.number }}
 *     env:
 *       GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
 *       GEMINI_API_KEY: ${{ secrets.GEMINI_API_KEY }}
 *
 * Reads inputs from the environment (set by action.yml), builds a synthetic
 * event for the target command, and runs the matching command script — the
 * same scripts used by the reusable workflows.
 *
 * Env in:
 *   AIDO_COMMAND       one of review|summarize|explain|docs|suggest|test|triage
 *   AIDO_PR_NUMBER     PR number (required for PR commands)
 *   AIDO_ISSUE_NUMBER  issue number (required for triage)
 *   (plus GITHUB_TOKEN and provider API keys, passed through to the script)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

// command -> which GitHub surface it acts on
const COMMAND_SURFACE = {
  review: 'pr',
  summarize: 'pr',
  explain: 'pr',
  docs: 'pr',
  suggest: 'pr',
  test: 'pr',
  triage: 'issue',
};

/** Resolve a command to its surface and script path. Throws on unknown command. */
function resolveCommand(command) {
  const surface = COMMAND_SURFACE[command];
  if (!surface) {
    throw new Error(
      `Unknown Aido command: '${command}'. Expected one of: ${Object.keys(COMMAND_SURFACE).join(', ')}.`,
    );
  }
  // Scripts live at .github/scripts/<command>/aido-<command>.js; this file is
  // at .github/scripts/action/aido-action.js, so go up one level.
  const script = path.join(__dirname, '..', command, `aido-${command}.js`);
  return { surface, script };
}

/** Validate a PR/issue number string is a positive integer. Returns the Number. */
function parseNumber(value, label) {
  if (!/^[0-9]+$/.test(String(value || ''))) {
    throw new Error(`${label} must be a positive integer (got '${value ?? ''}').`);
  }
  return Number(value);
}

/** Build the synthetic event object for a command + number. */
function buildEvent(surface, number) {
  return surface === 'issue' ? { issue: { number } } : { pull_request: { number } };
}

function main() {
  const command = (process.env.AIDO_COMMAND || '').trim();
  const { surface, script } = resolveCommand(command);

  const number =
    surface === 'issue'
      ? parseNumber(process.env.AIDO_ISSUE_NUMBER, 'issue_number')
      : parseNumber(process.env.AIDO_PR_NUMBER, 'pr_number');

  const eventFile = path.join(process.env.RUNNER_TEMP || os.tmpdir(), 'aido_action_event.json');
  fs.writeFileSync(eventFile, JSON.stringify(buildEvent(surface, number)));

  console.log(`[Aido Action] command=${command} surface=${surface} number=${number}`);

  const res = spawnSync('node', [script], {
    stdio: 'inherit',
    env: { ...process.env, GITHUB_EVENT_PATH: eventFile },
  });
  process.exit(res.status === null ? 1 : res.status);
}

if (require.main === module) main();

module.exports = { resolveCommand, parseNumber, buildEvent, COMMAND_SURFACE };
