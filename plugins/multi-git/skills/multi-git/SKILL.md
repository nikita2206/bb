---
name: multi-git
description: "Read git status, changed files, diffs and branches of the repositories inside a multi-repo (non-git) environment, or mark files Viewed, from the bb CLI."
---

# Repos (multi-git)

For environments whose workspace root is not a git repository but holds
repositories as direct child directories. A scope id names one of them:
`<environment-id>/<repo>`. Environments whose root is a repository use the
built-in Git plugin (`bb git`) instead.

```sh
bb multi-git repos <environment-id> [--json]
bb multi-git status <scope-id> [--merge-base-branch <branch>] [--json]
bb multi-git branches <scope-id> [--query <text>] [--limit <n>] [--json]
bb multi-git diff <scope-id> --target <target> [--json]
bb multi-git files <scope-id> --target <target> [--ignore-whitespace] [--json]
bb multi-git file <scope-id> --target <target> --path <path> --side old|new [--json]
bb multi-git patch <scope-id> --target <target> --path <path>... [--json]
bb multi-git viewed list|mark|unmark|clear <scope-id> --target <target> ...
```

- `repos` prints one scope id per line.
- `<target>` is `uncommitted`, `branch_committed`, `all` or `commit`.
  Branch targets take `--merge-base-branch`; `commit` takes `--sha`. `file`
  takes `--merge-base-ref <sha>` for branch targets instead. Paths are
  relative to the repository.
- `status` shows ahead/behind and committed files only with
  `--merge-base-branch`; the UI compares with the merge base picked for that
  repository, else its default branch.
- Viewed marks are stored per repository and diff target; new edits un-view a
  file.

`showGitChanges` (default true) shows the composer's changed-files segment;
turn it off with `bb plugin config multi-git set showGitChanges false`.

`bb plugin rpc inspect multi-git` prints the RPC input and output schemas.
