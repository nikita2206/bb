# Repos (multi-git)

A fork of `plugins/git` (bb--git) for environments whose workspace root is not
a git repository but holds several repositories as direct child directories
(e.g. a Picnic VM's copy of the Picnic repos). bb core marks such environments
`isGitRepo: false`, so bb--git hides its Diff tab and segments there; this
plugin shows the same views per repository instead. It returns
`not_applicable` for git-root environments, so the two never both show.

Not bundled: install it from this directory (`bb plugin install <path>`).
Keep the diff against `plugins/git` small so upstream changes merge easily.

- A scope is one repository: `<environmentId>/<repo>` (`scope.ts`). Every
  RPC field, status key, patch key, cache key and tag that bb--git names
  `environmentId` carries a scope id here; field names are unchanged on
  purpose, to keep the fork's diff small.
- `host.ts` is bb--git's host plus `repos`, which lists child directories
  holding a `.git` entry (symlinks skipped). Status can resolve the repo's
  default branch as the merge base itself, without an extra round trip.
- `server.ts` resolves a scope to its environment and repo path. Merge-base
  choices live in the plugin's kv storage (`merge-base/<scopeId>`), not on the
  environment. Viewed marks stay in core's `diff_viewed_files` table under the
  real environment id with `<repo>/`-prefixed paths. Environment events and
  thread turn ends fan out to every watched scope of that environment; bb's
  watcher ignores `<repo>/.git`, so a commit with no file change refreshes on
  the next turn end or `refresh`.
- `app.tsx` registers the Diff tab, Info rows (including Repository) and
  sections, and the changed-files segment. `ui/repo-selection.ts` holds the
  selected repo per environment (shared by every slot; default: first repo
  with changes); `ui/RepoPicker.tsx` switches it.
- Removed from bb--git: the Commit action and dialog (core's commit only
  works on git-root environments) and the `Mod+D` shortcut (bb--git owns it).
