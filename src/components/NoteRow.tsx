import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, CheckSquare, ChevronDown, ChevronRight, Copy, CornerDownRight, Flag, FolderInput, Heading, ImagePlus, ListOrdered, Merge, MoreHorizontal, Pencil, Square, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { type Attachment, type Note, type Priority, type Section, PRIORITIES, hasAttachments, isHeading } from "@/lib/notes";
import { PRIORITY_UI } from "@/lib/priority-ui";
import { formatBinding } from "@/lib/shortcuts";
import { Markdown } from "./Markdown";
import { AttachmentStrip } from "./AttachmentStrip";

export interface NoteRowProps {
  note: Note;
  sections: Section[];
  attachmentsDir: string;
  /** Section pill shown in search results. */
  showSection?: boolean;
  isCursor: boolean;
  isSelected: boolean;
  isEditing: boolean;
  /** Ids the menu acts on: the selection if this note is part of it, else just this note. */
  targetsFor: (id: string) => string[];
  allDoneFor: (ids: string[]) => boolean;
  bindings: { copyList: string; merge: string };
  onPointerSelect: (id: string, e: React.MouseEvent) => void;
  /** Right-click: make sure the note is selected before the menu opens. */
  onContextSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onToggleMany: (ids: string[]) => void;
  onEdit: (id: string, text: string) => void;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
  onRemove: (ids: string[]) => void;
  onSetPriority: (ids: string[], p: Priority) => void;
  onMove: (ids: string[], sectionId: string) => void;
  onCopy: (ids: string[]) => void;
  onCopyAsList: (ids: string[]) => void;
  onMerge: (ids: string[]) => void;
  onNudge?: (id: string, delta: -1 | 1) => void;
  onOpenAttachment: (a: Attachment) => void;
  onDragAttachments: (e: React.DragEvent, note: Note, a: Attachment) => void;
  /** Add images to this note (opens the picker). */
  onAttachImages: (id: string) => void;
  onRemoveAttachment: (id: string, attachmentId: string) => void;
  /** A file drag is hovering this row (App owns the drop). */
  dropTargetRow?: boolean;
  /** Heading: collapse / expand its notes. */
  onToggleCollapse?: (id: string) => void;
  /** Search results: jump to the note's folder. */
  onGoToFolder?: (id: string) => void;
  /** Ids that move together if this (selected) note is dragged. */
  dragGroup?: (id: string) => string[];
  /** Insert a new section heading right above this note. */
  onAddSectionAbove?: (id: string) => void;
  /** For heading rows: open notes under this heading. */
  sectionCount?: number;
  /** Manual reordering (disabled in search results). */
  reorderable?: boolean;
  dropEdge?: "top" | "bottom" | null;
  onRowDragStart?: (id: string) => void;
  onRowDragOver?: (id: string, edge: "top" | "bottom") => void;
  onRowDrop?: (id: string, edge: "top" | "bottom") => void;
  onRowDragEnd?: () => void;
}

export function NoteRow({
  note,
  sections,
  attachmentsDir,
  showSection,
  isCursor,
  isSelected,
  isEditing,
  targetsFor,
  allDoneFor,
  bindings,
  onPointerSelect,
  onContextSelect,
  onToggle,
  onToggleMany,
  onEdit,
  onStartEdit,
  onStopEdit,
  onRemove,
  onSetPriority,
  onMove,
  onCopy,
  onCopyAsList,
  onMerge,
  onNudge,
  onOpenAttachment,
  onDragAttachments,
  onAttachImages,
  onRemoveAttachment,
  dropTargetRow,
  onToggleCollapse,
  onGoToFolder,
  dragGroup,
  onAddSectionAbove,
  sectionCount,
  reorderable,
  dropEdge,
  onRowDragStart,
  onRowDragOver,
  onRowDrop,
  onRowDragEnd,
}: NoteRowProps) {
  const ui = PRIORITY_UI[note.priority];
  const heading = isHeading(note);
  const sectionName = sections.find((s) => s.id === note.sectionId)?.name;
  const rowRef = useRef<HTMLLIElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  // Snapshot of the targets when the menu opened (selection may change underneath).
  const [targets, setTargets] = useState<string[]>([note.id]);

  useEffect(() => {
    if (isCursor) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isCursor]);

  const openMenuAt = (clientX: number, clientY: number) => {
    // Reuse the right-click menu for the ⋯ button.
    rowRef.current?.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX, clientY }));
  };
  const many = targets.length > 1;
  const allDone = allDoneFor(targets);

  return (
    <ContextMenu
      onOpenChange={(o) => {
        setMenuOpen(o);
        if (o) {
          onContextSelect(note.id);
          setTargets(targetsFor(note.id));
        }
      }}
    >
      <ContextMenuTrigger asChild>
        <li
          ref={rowRef}
          data-note-id={note.id}
          draggable={!!reorderable && !isEditing}
          onDragStart={(e) => {
            if (!reorderable) return;
            if ((e.target as HTMLElement).closest("button,input,textarea,a,img")) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData("application/x-batch-note", note.id);
            e.dataTransfer.effectAllowed = "move";
            const group = dragGroup?.(note.id) ?? [note.id];
            if (group.length > 1) {
              // Badge-like drag image: "N notes"
              const ghost = document.createElement("div");
              ghost.textContent = `${group.length} notes`;
              ghost.style.cssText =
                "position:fixed;top:-100px;left:-100px;padding:4px 10px;border-radius:8px;background:#111;color:#fff;font:12px -apple-system,system-ui;";
              document.body.appendChild(ghost);
              e.dataTransfer.setDragImage(ghost, 12, 12);
              requestAnimationFrame(() => ghost.remove());
            }
            onRowDragStart?.(note.id);
          }}
          onDragOver={(e) => {
            if (!reorderable || !e.dataTransfer.types.includes("application/x-batch-note")) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            const r = e.currentTarget.getBoundingClientRect();
            onRowDragOver?.(note.id, e.clientY < r.top + r.height / 2 ? "top" : "bottom");
          }}
          onDrop={(e) => {
            if (!reorderable || !e.dataTransfer.types.includes("application/x-batch-note")) return;
            e.preventDefault();
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onRowDrop?.(note.id, e.clientY < r.top + r.height / 2 ? "top" : "bottom");
          }}
          onDragEnd={() => onRowDragEnd?.()}
          onMouseDown={(e) => {
            if (e.button !== 0) return;
            if ((e.target as HTMLElement).closest("button,input,textarea,a,[role=menuitem]")) return;
            onPointerSelect(note.id, e);
          }}
          onDoubleClick={(e) => {
            if ((e.target as HTMLElement).closest("button,input,a,img")) return;
            if (!note.done) onStartEdit(note.id);
          }}
          className={cn(
            "group relative flex items-start gap-2.5 rounded-lg p-2 outline-none",
            "hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06]",
            (isSelected || menuOpen) && "bg-foreground/[0.07] dark:bg-foreground/[0.1] hover:bg-foreground/[0.08]",
            isCursor && "ring-1 ring-ring/40",
            note.done && !isSelected && "opacity-60",
            dropTargetRow && "ring-2 ring-ring/50 bg-foreground/[0.05]",
            // Drop indicator line while reordering.
            dropEdge === "top" && "before:absolute before:inset-x-2 before:-top-0.5 before:h-0.5 before:rounded-full before:bg-ring",
            dropEdge === "bottom" && "after:absolute after:inset-x-2 after:-bottom-0.5 after:h-0.5 after:rounded-full after:bg-ring",
          )}
        >
          {!heading && (
            <Checkbox
              checked={note.done}
              onCheckedChange={() => onToggle(note.id)}
              aria-label={note.done ? "Mark as not done" : "Mark as done"}
              className="mt-1 shrink-0 border-muted-foreground/60 dark:border-muted-foreground/70"
              tabIndex={-1}
            />
          )}

          <div className={cn("min-w-0 flex-1", heading && "pt-0.5")}>
            {hasAttachments(note) && (
              <AttachmentStrip
                attachments={note.attachments!}
                dir={attachmentsDir}
                size="sm"
                onOpen={onOpenAttachment}
                onDragStart={(e, a) => onDragAttachments(e, note, a)}
                onRemove={note.done ? undefined : (aid) => onRemoveAttachment(note.id, aid)}
                className={cn("mb-1", note.done && "opacity-70")}
              />
            )}
            {isEditing ? (
              <InlineEditor
                initial={note.text}
                onCommit={(t) => {
                  onStopEdit();
                  onEdit(note.id, t);
                }}
                onCancel={onStopEdit}
              />
            ) : heading ? (
              <div className="flex items-baseline gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse?.(note.id);
                  }}
                  aria-label={note.collapsed ? "Expand section" : "Collapse section"}
                  aria-expanded={!note.collapsed}
                  className="-ml-0.5 grid size-4 shrink-0 place-items-center self-center rounded text-muted-foreground/70 hover:text-foreground"
                >
                  {note.collapsed ? <ChevronRight className="size-3" /> : <ChevronDown className="size-3" />}
                </button>
                <h3
                  className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    onStartEdit(note.id);
                  }}
                  title="Click to rename"
                >
                  {note.text}
                </h3>
                {sectionCount !== undefined && sectionCount > 0 && (
                  <span className="text-[11px] tabular-nums text-muted-foreground/60">{sectionCount}</span>
                )}
                <span className="ml-1 h-px flex-1 self-center bg-border/60" aria-hidden />
              </div>
            ) : note.text ? (
              <Markdown
                text={note.text}
                className={cn("text-sm leading-5", note.done && "line-through text-muted-foreground")}
              />
            ) : (
              <span className="text-xs text-muted-foreground/70 select-none">
                {note.attachments?.length === 1 ? "1 image" : `${note.attachments?.length ?? 0} images`}
              </span>
            )}
            {showSection && sectionName && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onGoToFolder?.(note.id);
                }}
                title="Go to folder"
                className="mt-0.5 inline-flex items-center gap-1 rounded text-[10px] uppercase tracking-wider text-muted-foreground/70 hover:text-foreground"
              >
                <CornerDownRight className="size-2.5" /> {sectionName}
              </button>
            )}
          </div>

          {/* Reserved 24px column: priority dot at rest, ⋯ on hover — text never runs under it. */}
          <div className="relative mt-0.5 flex h-5 w-6 shrink-0 items-center justify-center">
            {!heading && (
              <span
                className={cn(
                  "size-1.5 rounded-full transition-opacity group-hover:opacity-0 group-focus-within:opacity-0",
                  ui.dot,
                  note.done && "opacity-40",
                  menuOpen && "opacity-0",
                )}
                aria-label={`${ui.label} priority`}
              />
            )}
            <div
              className={cn(
                "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
                menuOpen && "opacity-100",
              )}
            >
              <Button
                variant="ghost"
                size="icon-xs"
                tabIndex={-1}
                aria-label="Note actions"
                aria-expanded={menuOpen}
                className={cn(menuOpen && "bg-foreground/[0.08] text-foreground")}
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  openMenuAt(r.left, r.bottom);
                }}
              >
                <MoreHorizontal className="size-3.5" />
              </Button>
            </div>
          </div>
        </li>
      </ContextMenuTrigger>

      <ContextMenuContent className="min-w-52">
        {heading ? (
          <>
            <ContextMenuItem onSelect={() => onToggleCollapse?.(note.id)}>
              {note.collapsed ? <ChevronDown /> : <ChevronRight />} {note.collapsed ? "Expand section" : "Collapse section"}
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onStartEdit(note.id)}>
              <Pencil /> Rename section
              <ContextMenuShortcut>↩</ContextMenuShortcut>
            </ContextMenuItem>
            {reorderable && onNudge && (
              <>
                <ContextMenuItem onSelect={() => onNudge(note.id, -1)}>
                  <ArrowUp /> Move up
                  <ContextMenuShortcut>⌥↑</ContextMenuShortcut>
                </ContextMenuItem>
                <ContextMenuItem onSelect={() => onNudge(note.id, 1)}>
                  <ArrowDown /> Move down
                  <ContextMenuShortcut>⌥↓</ContextMenuShortcut>
                </ContextMenuItem>
              </>
            )}
            <ContextMenuSeparator />
            <ContextMenuItem variant="destructive" onSelect={() => onRemove([note.id])}>
              <Trash2 /> Delete section (keeps its notes)
              <ContextMenuShortcut>⌫</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        ) : (
          <>
        {showSection && onGoToFolder && (
          <>
            <ContextMenuItem onSelect={() => onGoToFolder(note.id)}>
              <FolderInput /> Go to folder{sectionName ? ` “${sectionName}”` : ""}
              <ContextMenuShortcut>↩</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuSeparator />
          </>
        )}
        <ContextMenuItem onSelect={() => onCopy(targets)}>
          <Copy /> Copy
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem onSelect={() => onCopyAsList(targets)}>
          <ListOrdered /> Copy as List
          <ContextMenuShortcut>{formatBinding(bindings.copyList)}</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onSelect={() => onToggleMany(targets)}>
          {allDone ? <Square /> : <CheckSquare />} {allDone ? "Mark as Not Done" : "Mark as Done"}
          <ContextMenuShortcut>Space</ContextMenuShortcut>
        </ContextMenuItem>
        {!many && !note.done && (
          <ContextMenuItem onSelect={() => onStartEdit(note.id)}>
            <Pencil /> Edit
            <ContextMenuShortcut>↩</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {!many && !note.done && (
          <ContextMenuItem onSelect={() => onAttachImages(note.id)}>
            <ImagePlus /> Attach images…
          </ContextMenuItem>
        )}
        {!many && reorderable && onAddSectionAbove && (
          <ContextMenuItem onSelect={() => onAddSectionAbove(note.id)}>
            <Heading /> Add section above
          </ContextMenuItem>
        )}
        {many && (
          <ContextMenuItem onSelect={() => onMerge(targets)}>
            <Merge /> Merge Notes
            <ContextMenuShortcut>{formatBinding(bindings.merge)}</ContextMenuShortcut>
          </ContextMenuItem>
        )}
        {!many && !note.done && reorderable && onNudge && (
          <>
            <ContextMenuItem onSelect={() => onNudge(note.id, -1)}>
              <ArrowUp /> Move up
              <ContextMenuShortcut>⌥↑</ContextMenuShortcut>
            </ContextMenuItem>
            <ContextMenuItem onSelect={() => onNudge(note.id, 1)}>
              <ArrowDown /> Move down
              <ContextMenuShortcut>⌥↓</ContextMenuShortcut>
            </ContextMenuItem>
          </>
        )}
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <Flag className={cn("size-3.5", ui.text)} /> Priority
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            {PRIORITIES.map((p) => (
              <ContextMenuItem key={p} onSelect={() => onSetPriority(targets, p)}>
                <span className={cn("size-1.5 rounded-full", PRIORITY_UI[p].dot)} />
                {PRIORITY_UI[p].label}
                <ContextMenuShortcut>{PRIORITIES.indexOf(p) + 1}</ContextMenuShortcut>
                {!many && p === note.priority && <Check className="ml-1 size-3.5" />}
              </ContextMenuItem>
            ))}
          </ContextMenuSubContent>
        </ContextMenuSub>
        {sections.length > 1 && (
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <FolderInput className="size-3.5" /> Move to
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {sections.map((s) => (
                <ContextMenuItem
                  key={s.id}
                  disabled={!many && s.id === note.sectionId}
                  onSelect={() => onMove(targets, s.id)}
                >
                  {s.name}
                  {!many && s.id === note.sectionId && <Check className="ml-auto size-3.5" />}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onSelect={() => onRemove(targets)}>
          <Trash2 /> Delete{many ? ` ${targets.length} notes` : ""}
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
}

function InlineEditor({
  initial,
  onCommit,
  onCancel,
}: {
  initial: string;
  onCommit: (text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLTextAreaElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "0px";
    el.style.height = el.scrollHeight + "px";
  }, [value]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => onCommit(value)}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
          e.preventDefault();
          onCommit(value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          onCancel();
        }
      }}
      rows={1}
      className="block w-full resize-none bg-transparent text-sm leading-5 outline-none"
      aria-label="Edit note"
    />
  );
}
