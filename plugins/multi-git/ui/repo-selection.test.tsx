// @vitest-environment jsdom

import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import {
  renderSlot,
  type PluginRpcTestHandlers,
} from "@get-bb/plugin-sdk/testing/app";
import {
  gitReposTag,
  gitStatusTag,
  type WorkspaceStatus,
} from "../contract.js";
import { gitRpcContract } from "../rpc-contract.js";
import { parseScopeId } from "../scope.js";
import {
  makeGitRepos,
  makeWorkspaceMergeBase,
  makeWorkspaceStatus,
  makeWorkspaceWorkingTree,
} from "../testing.js";
import { useSelectedScope } from "./repo-selection.js";

afterEach(cleanup);

function Selection({ environmentId }: { environmentId: string }) {
  const selection = useSelectedScope(environmentId);
  const changed = selection.repos
    .filter((entry) => entry.hasChanges)
    .map((entry) => entry.repo);
  return (
    <>
      <output aria-label="scope">
        {selection.scopeId ?? "none"}|{changed.join(",")}
      </output>
      <button type="button" onClick={() => selection.select("web")}>
        pick web
      </button>
    </>
  );
}

const DIRTY = makeWorkspaceStatus({
  workingTree: makeWorkspaceWorkingTree({
    hasUncommittedChanges: true,
    state: "dirty_uncommitted",
  }),
});
const COMMITTED = makeWorkspaceStatus({
  mergeBase: makeWorkspaceMergeBase({ hasCommittedUnmergedChanges: true }),
});

interface SelectionState {
  repos: string[];
  changed: Record<string, WorkspaceStatus>;
}

function renderSelection(environmentId: string, state: SelectionState) {
  const rpc: Partial<PluginRpcTestHandlers<typeof gitRpcContract>> = {
    repos: ({ environmentId: id }) => makeGitRepos(id, state.repos),
    status: ({ keys }) =>
      Object.fromEntries(
        keys.map((key) => [
          key,
          {
            outcome: "available" as const,
            workspace:
              state.changed[parseScopeId(key)?.repo ?? ""] ??
              makeWorkspaceStatus(),
          },
        ]),
      ),
  };
  const rendered = renderSlot(
    { component: Selection },
    { environmentId },
    {
      rpc: rpc as PluginRpcTestHandlers<typeof gitRpcContract>,
      experimental_rpcContract: gitRpcContract,
      pluginId: "multi-git",
    },
  );
  const output = () =>
    screen.getByRole("status", { name: "scope" }).textContent ?? "";
  const scope = () => output().split("|")[0];
  const changed = () => output().split("|")[1];
  return { rendered, scope, changed };
}

it("defaults to the first repo with changes, else the first repo", async () => {
  const state: SelectionState = {
    repos: ["api", "pricing", "web"],
    changed: { web: COMMITTED },
  };
  const { rendered, scope } = renderSelection("env-default", state);
  await waitFor(() => expect(scope()).toBe("env-default/web"));

  state.changed = { pricing: DIRTY, web: COMMITTED };
  await rendered.experimental_invalidateRpc([
    gitStatusTag("env-default/pricing"),
  ]);
  await waitFor(() => expect(scope()).toBe("env-default/pricing"));

  state.changed = {};
  await rendered.experimental_invalidateRpc([
    gitStatusTag("env-default/pricing"),
    gitStatusTag("env-default/web"),
  ]);
  await waitFor(() => expect(scope()).toBe("env-default/api"));
});

it("keeps an explicit pick across status refreshes until the repo disappears", async () => {
  const state: SelectionState = {
    repos: ["api", "pricing", "web"],
    changed: { pricing: DIRTY },
  };
  const { rendered, scope, changed } = renderSelection("env-pick", state);
  await waitFor(() => expect(scope()).toBe("env-pick/pricing"));

  act(() => {
    fireEvent.click(screen.getByRole("button", { name: "pick web" }));
  });
  expect(scope()).toBe("env-pick/web");

  state.changed = { api: DIRTY, pricing: DIRTY };
  await rendered.experimental_invalidateRpc([
    gitStatusTag("env-pick/api"),
    gitStatusTag("env-pick/web"),
  ]);
  await waitFor(() => expect(changed()).toBe("api,pricing"));
  expect(scope()).toBe("env-pick/web");

  state.repos = ["api", "pricing"];
  await rendered.experimental_invalidateRpc([gitReposTag("env-pick")]);
  await waitFor(() => expect(scope()).toBe("env-pick/api"));
});
