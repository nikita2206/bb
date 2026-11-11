import { useEffect, useMemo, useRef, type ReactNode } from "react";
import {
  experimental_useThreadContextKind,
  type ExperimentalThreadContextSegmentInput,
  type ExperimentalThreadContextSegmentProps,
} from "@get-bb/plugin-sdk/app";
import { BranchPicker } from "@bb/shared-ui/branch-picker";
import { Icon } from "@bb/shared-ui/icon";
import {
  getMergeBaseBranchCandidateGroups,
} from "../merge-base-branch-candidates";
import { BannerActionSlot } from "@bb/shared-ui/prompt-banner-actions";
import {
  AnimatedDisclosureBody,
  SectionToggleButton,
} from "@bb/shared-ui/prompt-stack-disclosure";
import {
  CHANGED_FILES_KIND_PREFIX,
  formatChangeSummary,
  renderChangeSummary,
  selectWorkspaceChangedFilesSection,
  toChangeTally,
  type WorkspaceChangedFilesSection,
} from "@bb/shared-ui/workspace-change-summary";
import { WorkspaceChangesList } from "@bb/shared-ui/workspace-changes-list";
import { useChangedFileActions } from "../changed-files.js";
import { useMergeBase, type MergeBaseState } from "../merge-base.js";
import { useGitStatus, useShowGitChanges } from "../queries.js";
import {
  useSegmentEnvironmentId,
  useSelectedScope,
  type RepoEntry,
} from "../repo-selection.js";
import { RepoChangeCounts, RepoPicker } from "../RepoPicker.js";
import type { WorkspaceFileStatus, WorkspaceStatus } from "../../contract.js";

const TOGGLE_ID = "thread-prompt-banner-git-toggle";
const BODY_ID = "thread-prompt-banner-git-body";

type FocusTarget = "trigger" | "collapse";

const pendingFocus = new Map<string, FocusTarget>();

type SegmentPart = "summary" | "action" | "details";

function useFocusHandoff(
  threadId: string,
  target: FocusTarget,
  isExpanded: boolean,
) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pendingFocus.get(threadId) !== target) return;
    pendingFocus.delete(threadId);
    ref.current?.focus();
  }, [isExpanded, target, threadId]);
  return ref;
}

export function useChangedFilesSegmentVisible({
  threadId,
  environment,
}: ExperimentalThreadContextSegmentInput): boolean {
  const show = useShowGitChanges();
  const kind = experimental_useThreadContextKind();
  const environmentId = useSegmentEnvironmentId(
    threadId,
    environment,
    show && kind === "banner",
  );
  const { repos } = useSelectedScope(environmentId);
  return (
    environmentId !== null &&
    repos.some(
      (entry) => selectWorkspaceChangedFilesSection(entry.workspace) !== null,
    )
  );
}

export function selectOtherChangedRepos(
  repos: readonly RepoEntry[],
  selectedScopeId: string,
): RepoEntry[] {
  return repos.filter(
    (entry) => entry.hasChanges && entry.scopeId !== selectedScopeId,
  );
}

export function formatOtherReposLabel(count: number): string | null {
  return count === 0 ? null : `+${count} repo${count === 1 ? "" : "s"}`;
}

export function MergeBaseActionView({
  mergeBase,
}: {
  mergeBase: MergeBaseState;
}) {
  const branch = mergeBase.effectiveMergeBaseBranch;
  const candidates = useMemo(
    () =>
      getMergeBaseBranchCandidateGroups({
        mergeBaseBranch: branch,
        mergeBaseBranchRef: mergeBase.selectedBranchRef,
        mergeBaseBranchOptions: mergeBase.options,
        remoteMergeBaseBranchOptions: mergeBase.remoteOptions,
      }),
    [
      branch,
      mergeBase.options,
      mergeBase.remoteOptions,
      mergeBase.selectedBranchRef,
    ],
  );
  if (!mergeBase.showMergeBase || !branch) return null;
  return (
    <BannerActionSlot hideInCompact>
      <Icon name="GitMerge" className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="shrink-0">Merge base</span>
      <BranchPicker
        value={branch}
        options={candidates.options}
        remoteOptions={candidates.remoteOptions}
        variant="minimal"
        emphasizeTriggerValue={false}
        loading={mergeBase.optionsLoading}
        onChange={mergeBase.onChange}
        onOpenChange={mergeBase.onPickerOpenChange}
        onSearchQueryChange={mergeBase.onSearchQueryChange}
        className="max-w-[10rem]"
        muted
        popoverAlign="end"
      />
    </BannerActionSlot>
  );
}

function MergeBaseAction({
  environmentId,
  workspace,
}: {
  environmentId: string;
  workspace: WorkspaceStatus;
}) {
  return (
    <MergeBaseActionView mergeBase={useMergeBase(environmentId, workspace)} />
  );
}

export function ChangedFilesSegmentView({
  threadId,
  part,
  segments,
  isExpanded,
  onToggle,
  repo,
  section,
  otherChangedRepos,
  action,
  onFileClick,
  onSelectRepo,
}: Pick<
  ExperimentalThreadContextSegmentProps,
  "threadId" | "segments" | "isExpanded" | "onToggle"
> & {
  part: SegmentPart;
  repo: string;
  section: WorkspaceChangedFilesSection<WorkspaceFileStatus> | null;
  otherChangedRepos: readonly RepoEntry[];
  action: ReactNode;
  onFileClick: (file: WorkspaceFileStatus) => void;
  onSelectRepo: (repo: string) => void;
}) {
  const focusTarget = part === "summary" ? "trigger" : "collapse";
  const focusRef = useFocusHandoff(threadId, focusTarget, isExpanded);
  if (part === "summary") {
    const tally = section === null ? null : toChangeTally(section.stats);
    const prefix =
      section === null ? null : CHANGED_FILES_KIND_PREFIX[section.kind];
    const others = formatOtherReposLabel(otherChangedRepos.length);
    const summary = tally === null ? "No changes" : renderChangeSummary(tally);
    return (
      <SectionToggleButton
        buttonRef={focusRef}
        fillRow
        id={TOGGLE_ID}
        controlsId={BODY_ID}
        icon={
          <Icon
            name="FileDiff"
            className="size-3.5 shrink-0"
            aria-hidden="true"
          />
        }
        label={
          <>
            {repo} · {prefix === null ? null : <>{prefix} · </>}
            {summary}
            {others === null ? null : <> · {others}</>}
          </>
        }
        compactLabel={
          <>
            {summary}
            {others === null ? null : <> {others}</>}
          </>
        }
        hideLabelInCompact={segments.length > 2}
        ariaLabel={`Changed files: ${[
          repo,
          prefix,
          tally === null ? "No changes" : formatChangeSummary(tally),
          others,
        ]
          .filter((value) => value !== null)
          .join(", ")}`}
        isExpanded={isExpanded}
        onToggle={() => {
          if (!isExpanded) pendingFocus.set(threadId, "collapse");
          onToggle();
        }}
      />
    );
  }
  if (part === "action") return segments.length === 1 ? action : null;
  return (
    <AnimatedDisclosureBody
      collapsedBorder="reserve"
      id={BODY_ID}
      labelledBy={TOGGLE_ID}
      isExpanded={isExpanded}
      collapseLabel="Collapse changed files"
      collapseRef={focusRef}
      onCollapse={() => {
        pendingFocus.set(threadId, "trigger");
        onToggle();
      }}
    >
      {otherChangedRepos.length > 0 ? (
        <ul className="m-0 max-h-24 list-none overflow-y-auto px-3 pt-1">
          {otherChangedRepos.map((entry) => (
            <li key={entry.repo}>
              <button
                type="button"
                className="flex w-full min-w-0 items-center gap-2 rounded-sm px-1 py-0.5 text-left text-xs text-muted-foreground hover:bg-state-hover hover:text-foreground"
                title={`Show ${entry.repo}`}
                onClick={() => onSelectRepo(entry.repo)}
              >
                <Icon
                  name="FolderGit"
                  className="size-3 shrink-0"
                  aria-hidden="true"
                />
                <span className="min-w-0 flex-1 truncate">{entry.repo}</span>
                <RepoChangeCounts entry={entry} />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {section === null ? null : (
        <WorkspaceChangesList
          files={section.files}
          fileCount={section.stats.fileCount}
          className="max-h-32 px-3 pb-2 pt-1"
          onFileClick={onFileClick}
        />
      )}
    </AnimatedDisclosureBody>
  );
}

function SegmentContent({
  environmentId,
  selected,
  repos,
  onSelectRepo,
  ...props
}: ExperimentalThreadContextSegmentProps & {
  environmentId: string;
  selected: RepoEntry;
  repos: readonly RepoEntry[];
  onSelectRepo: (repo: string) => void;
  part: SegmentPart;
}) {
  const { workspace } = useGitStatus(environmentId);
  const actions = useChangedFileActions(environmentId);
  const section = selectWorkspaceChangedFilesSection(workspace);
  if (workspace === undefined) return null;
  return (
    <ChangedFilesSegmentView
      {...props}
      repo={selected.repo}
      section={section}
      otherChangedRepos={selectOtherChangedRepos(repos, environmentId)}
      action={
        props.part === "action" ? (
          <div className="ml-auto flex min-w-0 items-center">
            <BannerActionSlot>
              <Icon
                name="FolderGit"
                className="size-3.5 shrink-0"
                aria-hidden="true"
              />
              <RepoPicker
                repos={repos}
                selected={selected}
                onSelect={onSelectRepo}
                popoverAlign="end"
                muted
                className="max-w-[10rem]"
              />
            </BannerActionSlot>
            <MergeBaseAction environmentId={environmentId} workspace={workspace} />
          </div>
        ) : null
      }
      onFileClick={(file) => {
        if (section !== null) actions.onChangedFileClick({ file, section });
      }}
      onSelectRepo={onSelectRepo}
    />
  );
}

export function changedFilesSegmentPart(part: SegmentPart) {
  return function ChangedFilesSegmentPart(
    props: ExperimentalThreadContextSegmentProps,
  ) {
    const { selected, repos, select } = useSelectedScope(
      useSegmentEnvironmentId(props.threadId, props.environment, true),
    );
    return selected === null ? null : (
      <SegmentContent
        {...props}
        part={part}
        environmentId={selected.scopeId}
        selected={selected}
        repos={repos}
        onSelectRepo={select}
      />
    );
  };
}
