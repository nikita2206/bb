// @vitest-environment jsdom

import { cleanup, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  renderSlot,
  type PluginRpcTestHandlers,
} from "@get-bb/plugin-sdk/testing/app";
import type { WorkspaceStatus } from "../../contract.js";
import { gitRpcContract } from "../../rpc-contract.js";
import { parseScopeId } from "../../scope.js";
import {
  makeGitRepos,
  makeWorkspaceMergeBase,
  makeWorkspaceStatus,
  makeWorkspaceWorkingTree,
} from "../../testing.js";
import { changedFilesSegmentPart } from "./ChangedFilesSegment.js";

afterEach(cleanup);

const FILE = { path: "a.ts", status: "M" as const, insertions: 2, deletions: 1 };

const STATUS_BY_REPO: Record<string, WorkspaceStatus> = {
  api: makeWorkspaceStatus({
    workingTree: makeWorkspaceWorkingTree({
      hasUncommittedChanges: true,
      state: "dirty_uncommitted",
      files: [FILE],
      insertions: 2,
      deletions: 1,
    }),
  }),
  pricing: makeWorkspaceStatus({
    mergeBase: makeWorkspaceMergeBase({
      hasCommittedUnmergedChanges: true,
      files: [FILE],
    }),
  }),
  search: makeWorkspaceStatus({
    workingTree: makeWorkspaceWorkingTree({
      hasUncommittedChanges: true,
      state: "untracked",
      files: [{ ...FILE, status: "??" }],
    }),
  }),
};

const SUMMARY_LABEL = "Changed files: api, Uncommitted, 1 file, +2 -1, +2 repos";

function renderSummary(environment: { id: string } | null) {
  const Summary = changedFilesSegmentPart("summary");
  renderSlot(
    { component: Summary },
    {
      threadId: "thr-1",
      projectId: "prj-1",
      environment,
      segments: [],
      isExpanded: false,
      onToggle: () => undefined,
    },
    {
      rpc: {
        threadEnvironment: ({ threadId }) => ({
          environmentId: threadId === "thr-1" ? "env-1" : null,
        }),
        repos: ({ environmentId }) =>
          makeGitRepos(environmentId, ["api", "pricing", "search", "web"]),
        status: ({ keys }) =>
          Object.fromEntries(
            keys.map((key) => [
              key,
              {
                outcome: "available" as const,
                workspace:
                  STATUS_BY_REPO[parseScopeId(key)?.repo ?? ""] ??
                  makeWorkspaceStatus(),
              },
            ]),
          ),
      } as PluginRpcTestHandlers<typeof gitRpcContract>,
      experimental_rpcContract: gitRpcContract,
      pluginId: "multi-git",
    },
  );
}

function summaryLabel(): string | null {
  return screen
    .getByRole("button", { name: /^Changed files:/ })
    .getAttribute("aria-label");
}

it("names the selected repo and counts the other repos with changes", async () => {
  renderSummary({ id: "env-1" });
  await waitFor(() => expect(summaryLabel()).toBe(SUMMARY_LABEL));
});

it("resolves the environment from the thread when the composer passes none", async () => {
  renderSummary(null);
  await waitFor(() => expect(summaryLabel()).toBe(SUMMARY_LABEL));
});
