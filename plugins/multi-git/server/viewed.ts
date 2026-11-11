import type { BbPluginApi } from "@get-bb/plugin-sdk";
import type { WorkspaceDiffTarget } from "../contract.js";
import type { DiffViewedFile } from "@bb/server-contract";
import { requireScope } from "./reads.js";

export interface GitViewed {
  list(
    environmentId: string,
    target: WorkspaceDiffTarget,
    paths: string[] | undefined,
  ): Promise<{ files: DiffViewedFile[] }>;
  mark(
    environmentId: string,
    target: WorkspaceDiffTarget,
    path: string,
    revision: string,
  ): Promise<{ ok: true }>;
  clear(
    environmentId: string,
    target: WorkspaceDiffTarget,
    path: string | undefined,
  ): Promise<{ ok: true }>;
}

function diffQuery(target: WorkspaceDiffTarget) {
  switch (target.type) {
    case "uncommitted":
      return { target: "uncommitted" as const };
    case "branch_committed":
    case "all":
      return { target: target.type, mergeBaseBranch: target.mergeBaseBranch };
    case "commit":
      return { target: "commit" as const, sha: target.sha };
  }
}

export function createGitViewed(bb: BbPluginApi): GitViewed {
  const environments = bb.sdk.environments;
  function scoped(scopeId: string) {
    const { environmentId, repo } = requireScope(scopeId);
    return { environmentId, prefix: `${repo}/` };
  }
  async function list(
    scopeId: string,
    target: WorkspaceDiffTarget,
    paths: string[] | undefined,
  ): Promise<{ files: DiffViewedFile[] }> {
    const { environmentId, prefix } = scoped(scopeId);
    const { files } = await environments.experimental_diffViewed({
      environmentId,
      ...diffQuery(target),
      ...(paths === undefined
        ? {}
        : { paths: paths.map((path) => `${prefix}${path}`) }),
    });
    return {
      files: files
        .filter((file) => file.path.startsWith(prefix))
        .map((file) => ({
          path: file.path.slice(prefix.length),
          revision: file.revision,
        })),
    };
  }
  return {
    list,
    mark: (scopeId, target, path, revision) => {
      const { environmentId, prefix } = scoped(scopeId);
      return environments.experimental_markDiffViewed({
        environmentId,
        target,
        path: `${prefix}${path}`,
        revision,
      });
    },
    async clear(scopeId, target, path) {
      const { environmentId, prefix } = scoped(scopeId);
      const paths =
        path === undefined
          ? (await list(scopeId, target, undefined)).files.map(
              (file) => file.path,
            )
          : [path];
      await Promise.all(
        paths.map((repoPath) =>
          environments.experimental_clearDiffViewed({
            environmentId,
            target,
            path: `${prefix}${repoPath}`,
          }),
        ),
      );
      return { ok: true };
    },
  };
}
