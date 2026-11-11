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

it("names the selected repo and counts the other repos with changes", async () => {
  const Summary = changedFilesSegmentPart("summary");
  renderSlot(
    { component: Summary },
    {
      threadId: "thr-1",
      projectId: "prj-1",
      environment: { id: "env-1" },
      segments: [],
      isExpanded: false,
      onToggle: () => undefined,
    },
    {
      rpc: {
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
  await waitFor(() =>
    expect(
      screen.getByRole("button", { name: /^Changed files:/ }).getAttribute(
        "aria-label",
      ),
    ).toBe("Changed files: api, Uncommitted, 1 file, +2 -1, +2 repos"),
  );
});
