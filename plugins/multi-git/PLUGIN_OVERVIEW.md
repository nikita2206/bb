Git status and diffs for environments that hold several git repositories in one workspace (the workspace itself is not a repository). Pick a repository, then use the Diff tab, the changed-files segment above the composer and the Info tab as you would with the built-in Git plugin.

## What you get

- A repository picker in the Diff tab toolbar, the changed-files segment and the Info tab's Repository row. Repositories with changes are listed first with their counts; by default the first changed one is selected.
- The Diff tab, with uncommitted, branch, all-changes and per-commit views, Viewed marks, whitespace and file filters, and Add to chat on selected lines, for the selected repository.
- A changed-files segment above the composer showing the selected repository and how many other repositories have changes.
- Branch, merge base, ahead/behind status, commits and uncommitted files in the Info tab. The merge base defaults to each repository's default branch and is chosen per repository.

## How it works

The plugin runs git in each repository on the environment's own machine. Views refresh after the environment's files change and when an agent turn ends. A commit made outside an agent turn, with no file change, shows after the next turn or a refresh.

Use the CLI from any thread:

- `bb multi-git repos <environment-id>` lists the repositories as `<environment-id>/<repo>` scope ids.
- `bb multi-git status <scope-id>` prints a repository's status.
- `bb multi-git diff <scope-id> --target all` prints its diff.

Environments whose workspace is itself a git repository are left to the built-in Git plugin.
