import fs from "node:fs/promises";
import path from "node:path";
import {
  experimental_createHostEntryHarness,
} from "@get-bb/plugin-sdk/testing/host";
import { initRepo, makeTempDir } from "@bb/test-helpers";
import { describe, expect, it } from "vitest";
import hostEntry from "./host.js";

const FILE_COUNT = 20;
const LINE = "x".repeat(4_000);

describe("Git plugin host patches", () => {
  it("keeps a batch of large patches under the worker's result cap and defers the rest", async () => {
    const repo = await initRepo(await makeTempDir("bb-environment-provider-host-"));
    const tempDir = await makeTempDir("bb-environment-provider-host-temp-");
    const paths: string[] = [];
    for (let index = 0; index < FILE_COUNT; index += 1) {
      const name = `generated-${index}.txt`;
      paths.push(name);
      await fs.writeFile(
        path.join(repo, name),
        Array.from({ length: 120 }, () => LINE).join("\n"),
      );
    }
    const harness = experimental_createHostEntryHarness(hostEntry, {
      experimental_paths: { dataDir: tempDir, tempDir },
    });
    try {
      const result = await harness.experimental_call("patches", {
        path: repo,
        freshness: { work: "w", refs: "r" },
        target: { type: "uncommitted" },
        ignoreWhitespace: false,
        paths,
      });
      expect(result.outcome).toBe("available");
      if (result.outcome !== "available") return;
      expect(result.value.deferred.length).toBeGreaterThan(0);
      expect(
        [
          ...result.value.patches.map((patch) => patch.path),
          ...result.value.deferred,
        ].sort(),
      ).toEqual([...paths].sort());
    } finally {
      await harness.experimental_dispose();
    }
  });
});

describe("Git plugin host repos", () => {
  it("lists child directories with a .git directory or file, skipping symlinks and plain directories", async () => {
    const root = await makeTempDir("bb-multi-git-root-");
    const tempDir = await makeTempDir("bb-multi-git-temp-");
    await fs.mkdir(path.join(root, "web"));
    await initRepo(path.join(root, "web"));
    await fs.mkdir(path.join(root, "api", ".git"), { recursive: true });
    await fs.mkdir(path.join(root, "worktree"));
    await fs.writeFile(
      path.join(root, "worktree", ".git"),
      "gitdir: /elsewhere/.git/worktrees/worktree\n",
    );
    await fs.mkdir(path.join(root, "notes"));
    await fs.writeFile(path.join(root, "README.md"), "root\n");
    await fs.symlink(path.join(root, "web"), path.join(root, "linked"));
    await fs.mkdir(path.join(root, "bad\\name", ".git"), { recursive: true });
    const harness = experimental_createHostEntryHarness(hostEntry, {
      experimental_paths: { dataDir: tempDir, tempDir },
    });
    try {
      await expect(
        harness.experimental_call("repos", { path: root }),
      ).resolves.toEqual({
        outcome: "available",
        value: { repos: ["api", "web", "worktree"] },
      });
      await expect(
        harness.experimental_call("repos", { path: path.join(root, "gone") }),
      ).resolves.toMatchObject({
        outcome: "unavailable",
        failure: { code: "path_not_found" },
      });
    } finally {
      await harness.experimental_dispose();
    }
  });
});
