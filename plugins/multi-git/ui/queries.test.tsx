// @vitest-environment jsdom

import { act, cleanup, screen, waitFor } from "@testing-library/react";
import { useSyncExternalStore } from "react";
import { afterEach, expect, it } from "vitest";
import {
  renderSlot,
  type PluginRpcTestHandlers,
} from "@get-bb/plugin-sdk/testing/app";
import { gitRpcContract } from "../rpc-contract.js";
import { useGitBranches, useWorkspacePath } from "./queries.js";

afterEach(cleanup);

let typed = "";
const listeners = new Set<() => void>();

function type(query: string) {
  typed = query;
  for (const listener of listeners) listener();
}

function Branches() {
  const query = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => typed,
  );
  const branches = useGitBranches({
    environmentId: "env_1",
    query,
    selectedBranch: undefined,
    enabled: true,
  });
  return <output>{branches.data?.branches.join(",")}</output>;
}

it("only requests the branch search a typist settles on", async () => {
  const rpc: Partial<PluginRpcTestHandlers<typeof gitRpcContract>> = {
    branches: () => ({
      branches: ["main"],
      branchesTruncated: false,
      remoteBranches: [],
      remoteBranchesTruncated: false,
      selectedBranch: null,
    }),
  };
  const rendered = renderSlot(
    { component: Branches },
    {},
    {
      rpc: rpc as PluginRpcTestHandlers<typeof gitRpcContract>,
      experimental_rpcContract: gitRpcContract,
      pluginId: "bb--git",
    },
  );
  const branchCalls = () =>
    rendered.rpcCalls.filter((call) => call.method === "branches");
  await waitFor(() => expect(branchCalls()).toHaveLength(1));
  for (const query of ["m", "ma", "mai", "main"]) {
    await act(async () => {
      type(query);
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
  }
  await waitFor(() => expect(branchCalls()).toHaveLength(2));
  expect(branchCalls()[1]?.input).toMatchObject({ query: "main" });
});

function WorkspacePath() {
  return <output>{useWorkspacePath("env-1/pricing") ?? "none"}</output>;
}

it("resolves a scope's workspace path to its repo inside the environment", async () => {
  const get = async ({ environmentId }: { environmentId: string }) => ({
    path: `/work/${environmentId}/`,
  });
  renderSlot({ component: WorkspacePath }, {}, {
    sdk: { environments: { get } } as never,
  });
  await waitFor(() =>
    expect(screen.getByRole("status").textContent).toBe(
      "/work/env-1/pricing",
    ),
  );
});
