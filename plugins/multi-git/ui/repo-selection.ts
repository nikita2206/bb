import { experimental_useRpcQuery as useRpcQuery } from "@get-bb/plugin-sdk/app";
import { useCallback, useMemo, useSyncExternalStore } from "react";
import { GIT_STATUS_MAX_KEYS, type WorkspaceStatus } from "../contract.js";
import { gitRpcContract } from "../rpc-contract.js";
import { parseScopeId } from "../scope.js";
import { useGitWorkspaces } from "./queries.js";

export interface RepoEntry {
  repo: string;
  scopeId: string;
  workspace: WorkspaceStatus | undefined;
  hasChanges: boolean;
}

export interface SelectedScope {
  scopeId: string | null;
  selected: RepoEntry | null;
  repos: readonly RepoEntry[];
  select(repo: string): void;
}

const EMPTY_REPOS: readonly { repo: string; scopeId: string }[] = [];

const pickedRepos = new Map<string, string>();
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function pickRepo(environmentId: string, repo: string): void {
  pickedRepos.set(environmentId, repo);
  for (const listener of listeners) listener();
}

export function useRepos(environmentId: string | null) {
  return useRpcQuery({
    contract: gitRpcContract,
    method: "repos",
    input: { environmentId: environmentId ?? "" },
    enabled: environmentId !== null,
  });
}

export function useReposAvailable(environmentId: string | null): boolean {
  return useRepos(environmentId).data?.outcome === "available";
}

export function useSegmentEnvironmentId(
  threadId: string,
  environment: { id: string } | null | undefined,
  enabled: boolean,
): string | null {
  const lookup = useRpcQuery({
    contract: gitRpcContract,
    method: "threadEnvironment",
    input: { threadId },
    enabled: enabled && !environment,
  });
  if (!enabled) return null;
  return environment?.id ?? lookup.data?.environmentId ?? null;
}

export function workspaceHasChanges(
  workspace: WorkspaceStatus | undefined,
): boolean {
  return (
    workspace !== undefined &&
    (workspace.workingTree.hasUncommittedChanges ||
      workspace.mergeBase?.hasCommittedUnmergedChanges === true)
  );
}

export function resolveSelectedRepo(
  repos: readonly RepoEntry[],
  pickedRepo: string | undefined,
): RepoEntry | null {
  return (
    repos.find((entry) => entry.repo === pickedRepo) ??
    repos.find((entry) => entry.hasChanges) ??
    repos[0] ??
    null
  );
}

export function useSelectedScope(environmentId: string | null): SelectedScope {
  const reposQuery = useRepos(environmentId);
  const available =
    reposQuery.data?.outcome === "available" ? reposQuery.data.repos : EMPTY_REPOS;
  const scopeIds = useMemo(
    () =>
      available.slice(0, GIT_STATUS_MAX_KEYS).map((entry) => entry.scopeId),
    [available],
  );
  const workspaces = useGitWorkspaces(scopeIds);
  const repos = useMemo(
    () =>
      available.map((entry): RepoEntry => {
        const workspace = workspaces.get(entry.scopeId);
        return {
          repo: entry.repo,
          scopeId: entry.scopeId,
          workspace,
          hasChanges: workspaceHasChanges(workspace),
        };
      }),
    [available, workspaces],
  );
  const pickedRepo = useSyncExternalStore(subscribe, () =>
    environmentId === null ? undefined : pickedRepos.get(environmentId),
  );
  const selected = resolveSelectedRepo(repos, pickedRepo);
  const select = useCallback(
    (repo: string) => {
      if (environmentId !== null) pickRepo(environmentId, repo);
    },
    [environmentId],
  );
  return { scopeId: selected?.scopeId ?? null, selected, repos, select };
}

export function workspaceFileTarget(
  scopeId: string,
  path: string,
): { kind: "workspace"; environmentId: string; path: string } {
  const scope = parseScopeId(scopeId);
  return scope === null
    ? { kind: "workspace", environmentId: scopeId, path }
    : {
        kind: "workspace",
        environmentId: scope.environmentId,
        path: `${scope.repo}/${path}`,
      };
}
