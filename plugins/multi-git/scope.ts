const SEPARATOR = "/";

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

export function parseScopeId(scopeId: string): Scope | null {
  const index = scopeId.indexOf(SEPARATOR);
  if (index <= 0) return null;
  const environmentId = scopeId.slice(0, index);
  const repo = scopeId.slice(index + 1);
  return isValidRepoName(repo) ? { environmentId, repo } : null;
}
