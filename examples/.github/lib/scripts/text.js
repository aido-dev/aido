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
  buildFilesSummary,
  fillTemplate,
  modelFooter,
};
