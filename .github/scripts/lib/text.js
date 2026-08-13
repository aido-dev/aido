/**
 * Shared text/prompt utilities for Aido scripts.
 */

const ELLIPSIS_MARKER = '\n...\n[truncated]\n...\n';

/** Truncate keeping head (70%) and tail, with an ellipsis marker in the middle. */
function truncate(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  const head = Math.floor(max * 0.7);
  const tail = max - head - ELLIPSIS_MARKER.length;
  return `${str.slice(0, head)}${ELLIPSIS_MARKER}${str.slice(-tail)}`;
}

/** Truncate keeping only the head, with a trailing marker. */
function truncateTail(str, max) {
  if (!str) return '';
  if (str.length <= max) return str;
  return `${str.slice(0, max)}\n...\n[truncated]`;
}

/**
 * Resolve the max diff length (chars) from a command config's `maxDiffChars`.
 * - a positive number → that many characters
 * - `0`, `false`, or `"none"`/`"off"` → Infinity (no truncation; the full diff
 *   is sent, at the cost of tokens and provider request-size limits on huge PRs)
 * - unset or invalid → `defaultMax`
 * Pass the result straight to `truncate()` (Infinity leaves the diff untouched).
 */
function resolveDiffLimit(config, defaultMax) {
  const v = config?.maxDiffChars;
  if (v === 0 || v === false) return Infinity;
  if (typeof v === 'string' && ['none', 'off', 'full', '0'].includes(v.trim().toLowerCase())) {
    return Infinity;
  }
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : defaultMax;
}

/** Compact "- file (+a/-d, status)" summary of PR files. */
function buildFilesSummary(files) {
  if (!files || files.length === 0) return 'No files changed.';
  const lines = files.map((f) => {
    const parts = [];
    if (typeof f.additions === 'number' && typeof f.deletions === 'number') {
      parts.push(`+${f.additions}/-${f.deletions}`);
    }
    if (f.status) parts.push(f.status);
    return `- ${f.filename} (${parts.join(', ')})`;
  });
  return lines.join('\n');
}

/**
 * Replace {{key}} placeholders with values from ctx.
 * Keys present in ctx are replaced (null/undefined become ''); unknown
 * placeholders are left untouched.
 */
function fillTemplate(template, ctx) {
  return String(template || '').replace(/{{(\w+)}}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(ctx || {}, key) ? String(ctx[key] ?? '') : match,
  );
}

/** Standard "_Response generated using <model>_" comment footer. */
function modelFooter(model) {
  return `\n\n---\n_Response generated using ${model}_`;
}

module.exports = {
  ELLIPSIS_MARKER,
  truncate,
  truncateTail,
  resolveDiffLimit,
  buildFilesSummary,
  fillTemplate,
  modelFooter,
};
