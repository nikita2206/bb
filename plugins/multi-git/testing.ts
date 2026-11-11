import type {
  GitReposResult,
  WorkspaceMergeBase,
  WorkspaceStatus,
  WorkspaceWorkingTree,
} from "./contract.js";
import { formatScopeId } from "./scope.js";

export function makeWorkspaceWorkingTree(
  overrides: Partial<WorkspaceWorkingTree> = {},
): WorkspaceWorkingTree {
  return {
    hasUncommittedChanges: false,
    state: "clean",
    insertions: 0,
    deletions: 0,
    lineStatsComplete: true,
    files: [],
    fileCount: overrides.files?.length ?? 0,
    ...overrides,
  };
}

export function makeWorkspaceMergeBase(
  overrides: Partial<WorkspaceMergeBase> = {},
): WorkspaceMergeBase {
  return {
    mergeBaseBranch: "main",
    baseRef: "main",
    aheadCount: 0,
    behindCount: 0,
    squashMergeCheckComplete: true,
    hasCommittedUnmergedChanges: false,
    commits: [],
    files: [],
    fileCount: overrides.files?.length ?? 0,
    insertions: 0,
    deletions: 0,
    lineStatsComplete: true,
    ...overrides,
  };
}

export function makeWorkspaceStatus(
  overrides: Partial<WorkspaceStatus> = {},
): WorkspaceStatus {
  return {
    workingTree: makeWorkspaceWorkingTree(),
    checkout: { kind: "branch", branchName: "main", headSha: null },
    branch: { currentBranch: "main", defaultBranch: "main" },
    mergeBase: null,
    ...overrides,
  };
}

export function makeGitRepos(
  environmentId: string,
  repos: readonly string[],
): GitReposResult {
  return {
    outcome: "available",
    repos: repos.map((repo) => ({
      repo,
      scopeId: formatScopeId(environmentId, repo),
    })),
  };
}
