/**
 * Shared GitHub helpers for Aido scripts.
 *
 * Requires GITHUB_TOKEN in the environment. Event helpers read the (possibly
 * synthetic) event file pointed to by GITHUB_EVENT_PATH.
 */

const fs = require('fs');
const { Octokit } = require('@octokit/rest');

if (!process.env.GITHUB_TOKEN) {
  console.warn('[Aido] GITHUB_TOKEN is not set — GitHub API calls will fail or be rate-limited.');
}
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

/** Parse owner/repo from GITHUB_REPOSITORY. */
function getRepo() {
  const repoFull = process.env.GITHUB_REPOSITORY;
  if (!repoFull) throw new Error('GITHUB_REPOSITORY is not set.');
  const [owner, repo] = repoFull.split('/');
  return { owner, repo };
}

function readEvent() {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(eventPath, 'utf8'));
  } catch {
    return null;
  }
}

/** PR number from a pull_request event or an issue_comment event on a PR. */
function getPrNumberFromEvent() {
  const event = readEvent();
  if (!event) return null;
  if (event.pull_request && event.pull_request.number) return event.pull_request.number;
  if (event.issue && event.issue.pull_request) {
    return Number(event.issue.pull_request.url.split('/').pop());
  }
  return null;
}

/** Issue number from an issues / issue_comment event. */
function getIssueNumberFromEvent() {
  const event = readEvent();
  return (event && event.issue && event.issue.number) || null;
}

async function getPr(owner, repo, prNumber) {
  const { data } = await octokit.pulls.get({ owner, repo, pull_number: prNumber });
  return data;
}

/** All changed files in a PR (paginated). */
async function getPrFiles(owner, repo, prNumber) {
  return octokit.paginate(octokit.pulls.listFiles, {
    owner,
    repo,
    pull_number: prNumber,
    per_page: 100,
  });
}

/** Unified diff of the entire PR. */
async function getPrDiff(owner, repo, prNumber) {
  const { data } = await octokit.request('GET /repos/{owner}/{repo}/pulls/{pull_number}', {
    owner,
    repo,
    pull_number: prNumber,
    mediaType: { format: 'diff' },
  });
  return data;
}

/** Title/body of the issue linked via "Fixes/Closes/Resolves #N" in the PR body. */
async function getLinkedIssue(owner, repo, prBody) {
  const match = prBody && prBody.match(/(?:Fixes|Closes|Resolves) #(\d+)/i);
  if (!match) return { issueTitle: '', issueBody: '' };
  try {
    const { data: issue } = await octokit.issues.get({
      owner,
      repo,
      issue_number: Number(match[1]),
    });
    return { issueTitle: issue.title || '', issueBody: issue.body || '' };
  } catch (e) {
    // A missing issue (404) is expected — the PR body may reference a deleted
    // or cross-repo issue. Anything else is a real API problem worth surfacing.
    if (e.status !== 404) {
      console.warn(`[Aido] Failed to fetch linked issue #${match[1]}:`, e.message || e);
    }
    return { issueTitle: '', issueBody: '' };
  }
}

/** Post a comment on a PR or issue. */
async function postComment(owner, repo, issueNumber, body) {
  await octokit.issues.createComment({ owner, repo, issue_number: issueNumber, body });
}

module.exports = {
  octokit,
  getRepo,
  readEvent,
  getPrNumberFromEvent,
  getIssueNumberFromEvent,
  getPr,
  getPrFiles,
  getPrDiff,
  getLinkedIssue,
  postComment,
};
