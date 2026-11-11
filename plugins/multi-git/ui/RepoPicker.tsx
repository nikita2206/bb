import { useDeferredValue, useMemo, useRef, useState } from "react";
import {
  BRANCH_PICKER_CONTENT_CLASS_NAME,
  BranchPickerNavigation,
  BranchPickerRow,
  BranchPickerSearch,
  BranchPickerSectionHeader,
} from "@bb/shared-ui/branch-picker-primitives";
import { Button } from "@bb/shared-ui/button";
import { COARSE_POINTER_TEXT_SM_CLASS } from "@bb/shared-ui/coarse-pointer-sizing";
import { DiffStatsTally } from "@bb/shared-ui/diff-stats-tally";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { LIST_HOVER_TRANSITION } from "@bb/shared-ui/motion";
import { blurActiveKeyboardInputWithin } from "@bb/shared-ui/overlay-trigger";
import { PICKER_MOBILE_CLASS_NAME } from "@bb/shared-ui/picker-layout";
import { searchPickerOptions } from "@bb/shared-ui/picker-search";
import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";
import { selectWorkspaceChangedFilesSection } from "@bb/shared-ui/workspace-change-summary";
import type { RepoEntry } from "./repo-selection.js";

export function orderReposForPicker(
  repos: readonly RepoEntry[],
): RepoEntry[] {
  return [
    ...repos.filter((entry) => entry.hasChanges),
    ...repos.filter((entry) => !entry.hasChanges),
  ];
}

export function RepoChangeCounts({ entry }: { entry: RepoEntry }) {
  const section = entry.hasChanges
    ? selectWorkspaceChangedFilesSection(entry.workspace)
    : null;
  if (section === null) return null;
  const { fileCount, insertions, deletions, lineStatsComplete } = section.stats;
  return (
    <span className="flex shrink-0 items-center gap-1.5 text-2xs tabular-nums text-muted-foreground">
      <span>
        {fileCount} file{fileCount === 1 ? "" : "s"}
      </span>
      {lineStatsComplete ? (
        <DiffStatsTally insertions={insertions} deletions={deletions} />
      ) : null}
    </span>
  );
}

export function RepoPicker({
  repos,
  selected,
  onSelect,
  variant = "minimal",
  muted = false,
  popoverAlign = "start",
  className,
}: {
  repos: readonly RepoEntry[];
  selected: RepoEntry | null;
  onSelect: (repo: string) => void;
  variant?: "default" | "minimal";
  muted?: boolean;
  popoverAlign?: "start" | "end";
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const ordered = useMemo(() => orderReposForPicker(repos), [repos]);
  const filtered = useMemo(
    () =>
      searchPickerOptions({
        options: ordered,
        query: deferredQuery,
        getLabel: (entry) => entry.repo,
      }),
    [deferredQuery, ordered],
  );
  const highlight =
    filtered.find((entry) => entry.repo === selected?.repo)?.repo ??
    filtered[0]?.repo;
  const updateOpen = (nextOpen: boolean) => {
    if (!nextOpen) {
      blurActiveKeyboardInputWithin(inputRef.current);
      setQuery("");
    }
    setOpen(nextOpen);
  };
  const label = selected?.repo ?? "Select repository";
  return (
    <Popover open={open} onOpenChange={updateOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={variant === "default" ? "outline" : "ghost"}
          size="sm"
          aria-label="Repository"
          role="combobox"
          aria-expanded={open}
          className={cn(
            LIST_HOVER_TRANSITION,
            variant === "default" &&
              cn(
                "h-8 w-full min-w-0 justify-between gap-2 rounded-lg border border-border bg-transparent px-2.5 font-normal max-md:pointer-coarse:h-10",
                COARSE_POINTER_TEXT_SM_CLASS,
              ),
            variant === "minimal" &&
              "-mx-1 h-5 w-auto min-w-0 justify-between gap-1 rounded-sm px-1 text-xs font-normal shadow-none hover:bg-state-hover data-[state=open]:bg-state-hover",
            muted && "text-muted-foreground hover:text-foreground",
            className,
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5" title={label}>
            {variant === "default" ? (
              <Icon
                name="FolderGit"
                className="size-3.5 shrink-0 text-muted-foreground"
                aria-hidden
              />
            ) : null}
            <span className="truncate">{label}</span>
          </span>
          <Icon
            name="ChevronDown"
            className={cn(
              "shrink-0 text-muted-foreground",
              variant === "default" ? "size-4" : "size-3",
            )}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        mobileClassName={PICKER_MOBILE_CLASS_NAME}
        align={popoverAlign}
        sideOffset={6}
        collisionPadding={16}
        mobileTitle="Repository"
        autoFocusRef={inputRef}
        className={cn(
          BRANCH_PICKER_CONTENT_CLASS_NAME,
          "max-md:min-h-0 max-md:flex-1 md:min-w-56",
        )}
      >
        <BranchPickerNavigation highlight={highlight} query={deferredQuery}>
          <BranchPickerSearch
            inputRef={inputRef}
            query={query}
            onQueryChange={setQuery}
            ariaLabel="Search repositories"
            placeholder="Search repositories"
          />
          <div
            className="min-h-0 max-h-[60vh] overflow-y-auto overscroll-contain px-1 pb-1 pt-0 max-md:max-h-none max-md:flex-1 md:max-h-80"
            onWheel={(event) => {
              event.stopPropagation();
            }}
          >
            <BranchPickerSectionHeader label="Repositories" />
            {filtered.map((entry) => (
              <BranchPickerRow
                key={entry.repo}
                value={entry.repo}
                icon="FolderGit"
                selected={entry.repo === selected?.repo}
                title={entry.repo}
                onSelect={() => {
                  onSelect(entry.repo);
                  updateOpen(false);
                }}
              >
                <span className="min-w-0 flex-1 truncate">{entry.repo}</span>
                <RepoChangeCounts entry={entry} />
              </BranchPickerRow>
            ))}
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                No repositories found.
              </p>
            ) : null}
          </div>
        </BranchPickerNavigation>
      </PopoverContent>
    </Popover>
  );
}
