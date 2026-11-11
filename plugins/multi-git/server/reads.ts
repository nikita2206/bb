import {
  experimental_PluginRpcRefusal,
  type BbPluginApi,
} from "@get-bb/plugin-sdk";
import {
  GIT_DIFF_MAX_DIFF_BYTES,
  GIT_DIFF_MAX_FILE_LIST_BYTES,
  gitHostContract,
  type DiffPatchEntry,
  type GitDiffResult,
  type GitFileSideResult,
  type GitFileSideQuery,
  type GitFilesResult,
  type GitReadFreshness,
  type GitReposResult,
  type GitStatusResult,
  type WorkspaceDiffTarget,
} from "../contract.js";
import { formatScopeId, parseScopeId, type Scope } from "../scope.js";
import type { ScopeMergeBases } from "./merge-bases.js";
import {
  joinHostPath,
  type GitBranchOptions,
} from "@bb/domain";
import { createAsyncTtlMemo } from "@bb/async-cache";

const READ_CACHE_TTL_MS = 3_000;
const READ_CACHE_MAX_ENTRIES = 1_024;
const HOST_CALL_TIMEOUT_MS = 30_000;

type Environment = Awaited<
  ReturnType<BbPluginApi["sdk"]["environments"]["get"]>
>;

interface ReadyGitEnvironment {
  environment: Environment;
  hostId: string;
  path: string;
}

function workspaceUnavailableMessage(environment: Environment): string {
  switch (environment.status) {
    case "creating":
    case "provisioning":
      return "Workspace is still starting.";
    case "error":
      return "Workspace setup failed.";
    case "destroyed":
      return "Workspace no longer exists.";
    case "ready":
      return "Workspace is unavailable.";
  }
}

function requireWorkspacePath(environment: Environment): string {
  if (environment.status !== "ready" || environment.path === null) {
    throw new experimental_PluginRpcRefusal({
      code: "conflict",
      message: workspaceUnavailableMessage(environment),
    });
  }
  return environment.path;
}

export function requireScope(scopeId: string): Scope {
  const scope = parseScopeId(scopeId);
  if (scope === null) {
    throw new experimental_PluginRpcRefusal({
      code: "invalid",
      message: `Not a repository scope: ${scopeId}. Use <environment-id>/<repo>.`,
    });
  }
  return scope;
}

const FILE_READ_FAILURE_CODES = ["ENOENT", "invalid_path", "file_too_large"] as const;

function fileReadFailure(error: unknown): {
  code: (typeof FILE_READ_FAILURE_CODES)[number];
  message: string;
} | null {
  if (typeof error !== "object" || error === null) return null;
  const code = FILE_READ_FAILURE_CODES.find(
    (known) => "code" in error && known === error.code,
  );
  if (code === undefined) return null;
  const body = "body" in error ? error.body : null;
  const message =
    typeof body === "object" &&
    body !== null &&
    "message" in body &&
    typeof body.message === "string"
      ? body.message
      : error instanceof Error
        ? error.message
        : code;
  return { code, message };
}

function httpStatusOf(error: unknown): number | null {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : null;
}

const KEY_SEPARATOR = "\u0000";

function createReadMemo<T extends { outcome: string }>() {
  const memo = createAsyncTtlMemo<string, T>({
    ttlMs: (value) => (value.outcome === "available" ? READ_CACHE_TTL_MS : 0),
    maxEntries: READ_CACHE_MAX_ENTRIES,
  });
  return {
    read(
      target: { environmentId: string; hostId: string },
      parts: readonly unknown[],
      cache: ReadCacheUse,
      load: () => Promise<T>,
    ): Promise<T> {
      if (cache === "bypass") return load();
      const key = [
        target.environmentId,
        target.hostId,
        JSON.stringify(parts),
      ].join(KEY_SEPARATOR);
      return memo.run(key, load);
    },
    clear(environmentId: string): void {
      memo.invalidateWhere((key) =>
        key.startsWith(`${environmentId}${KEY_SEPARATOR}`),
      );
    },
    clearHost(hostId: string): void {
      memo.invalidateWhere((key) => key.split(KEY_SEPARATOR)[1] === hostId);
    },
  };
}

export type ReadCacheUse = "shared" | "bypass";

export interface GitReads {
  repos(environmentId: string): Promise<GitReposResult>;
  status(
    environmentId: string,
    mergeBase: { kind: "environment" } | { kind: "explicit"; branch?: string },
    cache: ReadCacheUse,
  ): Promise<GitStatusResult>;
  diff(
    environmentId: string,
    target: WorkspaceDiffTarget,
    limits?: { maxDiffBytes?: number; maxFileListBytes?: number },
  ): Promise<GitDiffResult>;
  files(
    environmentId: string,
    target: WorkspaceDiffTarget,
    ignoreWhitespace: boolean,
    cache: ReadCacheUse,
  ): Promise<GitFilesResult>;
  patches(
    environmentId: string,
    target: WorkspaceDiffTarget,
    ignoreWhitespace: boolean,
    paths: string[],
    cache: ReadCacheUse,
  ): Promise<
    | { outcome: "available"; patches: DiffPatchEntry[] }
    | Exclude<GitFilesResult, { outcome: "available" }>
  >;
  fileSide(
    environmentId: string,
    query: GitFileSideQuery,
  ): Promise<GitFileSideResult>;
  branches(args: {
    environmentId: string;
    query?: string;
    limit: number;
    selectedBranch?: string;
  }): Promise<GitBranchOptions>;
  clearCaches(environmentId: string): void;
  clearHostCaches(hostId: string): void;
}

function createHostClient(bb: BbPluginApi) {
  const host = bb.hosts.experimental_client({ contract: gitHostContract });
  return {
    call<Method extends keyof typeof gitHostContract & string>(
      method: Method,
      input: Parameters<typeof host.call<Method>>[1],
      hostId: string,
    ) {
      return host.call(method, input, {
        hostId,
        timeoutMs: HOST_CALL_TIMEOUT_MS,
      });
    },
  };
}

function resolveFileSideRef(query: GitFileSideQuery): string | null {
  switch (query.target) {
    case "uncommitted":
      return query.side === "old" ? "HEAD" : null;
    case "branch_committed":
      return query.side === "old" ? query.mergeBaseRef : "HEAD";
    case "all":
      return query.side === "old" ? query.mergeBaseRef : null;
    case "commit":
      return query.side === "old" ? `${query.sha}^` : query.sha;
  }
}

export function createGitReads(
  bb: BbPluginApi,
  freshness: (environmentId: string, shared: boolean) => GitReadFreshness,
  mergeBases: ScopeMergeBases,
): GitReads {
  const host = createHostClient(bb);
  const reposCache = createReadMemo<GitReposResult>();
  const statusCache = createReadMemo<GitStatusResult>();
  const filesCache = createReadMemo<GitFilesResult>();

  async function requireEnvironment(
    environmentId: string,
  ): Promise<Environment> {
    try {
      return await bb.sdk.environments.get({ environmentId });
    } catch (error) {
      if (httpStatusOf(error) === 404) {
        throw new experimental_PluginRpcRefusal({
          code: "not_found",
          message: `Environment not found: ${environmentId}`,
        });
      }
      throw error;
    }
  }

  async function requireReady(scopeId: string): Promise<ReadyGitEnvironment> {
    const { environmentId, repo } = requireScope(scopeId);
    const environment = await requireEnvironment(environmentId);
    const path = joinHostPath({
      rootPath: requireWorkspacePath(environment),
      relativePath: repo,
    });
    if (path === null) {
      throw new experimental_PluginRpcRefusal({
        code: "conflict",
        message: workspaceUnavailableMessage(environment),
      });
    }
    return { environment, hostId: environment.hostId, path };
  }

  return {
    async repos(environmentId) {
      const environment = await requireEnvironment(environmentId);
      const path = requireWorkspacePath(environment);
      if (environment.isGitRepo) {
        return {
          outcome: "not_applicable",
          reason: "git_environment",
          message: "The workspace is a git repository; the Git plugin shows it.",
        };
      }
      return reposCache.read(
        { environmentId, hostId: environment.hostId },
        [path],
        "shared",
        async () => {
          const result = await host.call("repos", { path }, environment.hostId);
          if (result.outcome !== "available") {
            throw new experimental_PluginRpcRefusal({
              code: "conflict",
              message: result.failure.message,
            });
          }
          if (result.value.repos.length === 0) {
            return {
              outcome: "not_applicable",
              reason: "no_repositories",
              message: "No git repositories in the workspace.",
            };
          }
          return {
            outcome: "available",
            repos: result.value.repos.map((repo) => ({
              repo,
              scopeId: formatScopeId(environmentId, repo),
            })),
          };
        },
      );
    },
    async status(environmentId, mergeBase, cache) {
      const ready = await requireReady(environmentId);
      const mergeBaseBranch =
        mergeBase.kind === "environment"
          ? ((await mergeBases.get(environmentId)) ?? undefined)
          : mergeBase.branch;
      const defaultMergeBase =
        mergeBase.kind === "environment" && mergeBaseBranch === undefined;
      return statusCache.read(
        { environmentId, hostId: ready.hostId },
        [ready.path, mergeBaseBranch ?? null, defaultMergeBase],
        cache,
        async () => {
          const result = await host.call(
            "status",
            {
              path: ready.path,
              freshness: freshness(environmentId, cache === "shared"),
              ...(mergeBaseBranch === undefined ? {} : { mergeBaseBranch }),
              ...(defaultMergeBase ? { defaultMergeBase } : {}),
            },
            ready.hostId,
          );
          return result.outcome === "available"
            ? { outcome: "available", workspace: result.value }
            : result;
        },
      );
    },
    async diff(environmentId, target, limits = {}) {
      const ready = await requireReady(environmentId);
      const result = await host.call(
        "diff",
        {
          path: ready.path,
          freshness: freshness(environmentId, false),
          target,
          maxDiffBytes: limits.maxDiffBytes ?? GIT_DIFF_MAX_DIFF_BYTES,
          maxFileListBytes:
            limits.maxFileListBytes ?? GIT_DIFF_MAX_FILE_LIST_BYTES,
        },
        ready.hostId,
      );
      return result.outcome === "available"
        ? { outcome: "available", diff: result.value }
        : result;
    },
    async files(environmentId, target, ignoreWhitespace, cache) {
      const ready = await requireReady(environmentId);
      return filesCache.read(
        { environmentId, hostId: ready.hostId },
        [ready.path, target, ignoreWhitespace],
        cache,
        async () => {
          const result = await host.call(
            "files",
            {
              path: ready.path,
              freshness: freshness(environmentId, cache === "shared"),
              target,
              ignoreWhitespace,
            },
            ready.hostId,
          );
          return result.outcome === "available"
            ? { outcome: "available", ...result.value }
            : result;
        },
      );
    },
    async patches(environmentId, target, ignoreWhitespace, paths, cache) {
      const ready = await requireReady(environmentId);
      const readFreshness = freshness(environmentId, cache === "shared");
      const patches: DiffPatchEntry[] = [];
      let pending = paths;
      while (pending.length > 0) {
        const result = await host.call(
          "patches",
          {
            path: ready.path,
            freshness: readFreshness,
            target,
            ignoreWhitespace,
            paths: pending,
          },
          ready.hostId,
        );
        if (result.outcome !== "available") return result;
        if (result.value.patches.length === 0) break;
        patches.push(...result.value.patches);
        pending = result.value.deferred;
      }
      return { outcome: "available", patches };
    },
    async fileSide(environmentId, query) {
      const { environment, path: rootPath } = await requireReady(environmentId);
      const relativePath = query.path.replace(/^\/+/u, "");
      const path =
        relativePath.length === 0 || relativePath.split("/").includes("..")
          ? null
          : joinHostPath({ rootPath, relativePath });
      if (path === null) {
        return {
          outcome: "unavailable",
          code: "invalid_path",
          message: "Invalid path",
        };
      }
      const ref = resolveFileSideRef(query);
      try {
        const file = await bb.sdk.files.read({
          hostId: environment.hostId,
          path,
          rootPath,
          ...(ref === null ? {} : { ref }),
        });
        return {
          outcome: "available",
          file: {
            path: file.path,
            content: file.content,
            contentEncoding: file.contentEncoding,
            ...(file.mimeType ? { mimeType: file.mimeType } : {}),
            sizeBytes: file.sizeBytes,
          },
        };
      } catch (error) {
        const failure = fileReadFailure(error);
        if (failure === null) throw error;
        return { outcome: "unavailable", ...failure };
      }
    },
    async branches({ environmentId, query, limit, selectedBranch }) {
      const { environment, path } = await requireReady(environmentId);
      return host.call(
        "branches",
        {
          path,
          limit,
          ...(query === undefined ? {} : { query }),
          ...(selectedBranch === undefined ? {} : { selectedBranch }),
        },
        environment.hostId,
      );
    },
    clearCaches(environmentId) {
      reposCache.clear(environmentId);
      statusCache.clear(environmentId);
      filesCache.clear(environmentId);
    },
    clearHostCaches(hostId) {
      reposCache.clearHost(hostId);
      statusCache.clearHost(hostId);
      filesCache.clearHost(hostId);
    },
  };
}
