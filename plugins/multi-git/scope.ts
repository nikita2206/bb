/**
 * A scope is one git repository inside an environment whose workspace root is
 * not itself a git repository (e.g. a Picnic VM copy holding many repos).
 *
 * Every RPC field, cache key, tag and patch key that the upstream git plugin
 * names `environmentId` carries a scope id here instead. Keeping the field
 * names keeps this fork's diff against plugins/git small, so upstream changes
 * merge with little effort.
 */

const SEPARATOR = "/";

/** A repository is a direct child directory of the workspace root. */
const REPO_NAME_PATTERN = /^[^/\\\u0000]+$/u;

export interface Scope {
  environmentId: string;
  repo: string;
}

export function isValidRepoName(repo: string): boolean {
  return REPO_NAME_PATTERN.test(repo) && repo !== "." && repo !== "..";
}

export function formatScopeId(environmentId: string, repo: string): string {
  if (environmentId.includes(SEPARATOR) || !isValidRepoName(repo)) {
    throw new Error(`Invalid scope: ${environmentId} ${repo}`);
  }
  return `${environmentId}${SEPARATOR}${repo}`;
}

/** Null when the id is not `<environmentId>/<repo>`. */
export function parseScopeId(scopeId: string): Scope | null {
  const index = scopeId.indexOf(SEPARATOR);
  if (index <= 0) return null;
  const environmentId = scopeId.slice(0, index);
  const repo = scopeId.slice(index + 1);
  return isValidRepoName(repo) ? { environmentId, repo } : null;
}
