import { forwardRef, useState } from "react";
import { Plus } from "lucide-react";
import { type Note, type Section, isHeading } from "@/lib/notes";
import { NoteRow, type NoteRowProps } from "./NoteRow";

type RowHandlers = Omit<
  NoteRowProps,
  | "note"
  | "sections"
  | "showSection"
  | "isCursor"
  | "isSelected"
  | "isEditing"
  | "reorderable"
  | "dropEdge"
  | "onRowDragStart"
  | "onRowDragOver"
  | "onRowDrop"
  | "onRowDragEnd"
  | "dropTargetRow"
>;

interface Props extends RowHandlers {
  /** Enable drag-to-reorder (off in search results). */
  reorderable?: boolean;
  /** Called with the dragged id and the id it should follow (null = top). */
  onReorder?: (id: string, afterId: string | null) => void;
  /** Dragging a note that's part of a multi-selection moves the whole selection. */
  onReorderMany?: (ids: string[], afterId: string | null) => void;
  /** Ids to move together when the dragged note is selected. */
  selectionForDrag?: (id: string) => string[];
  /** Row currently hovered by an external image drag. */
  imageDropRowId?: string | null;
  /** Shows a "+ Add section" row at the end of the folder list. */
  onAddSection?: () => void;
  open: Note[];
  done: Note[];
  sections: Section[];
  showSection?: boolean;
  cursorId: string | null;
  selected: Set<string>;
  editingId: string | null;
  emptyMessage: React.ReactNode;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/** Flat list: open notes, a hairline, then done notes. */
export const NoteList = forwardRef<HTMLDivElement, Props>(function NoteList(
 {
    open,
    done,
    sections,
    showSection,
    cursorId,
    selected,
    editingId,
    emptyMessage,
    onKeyDown,
    reorderable,
    onReorder,
    onReorderMany,
    selectionForDrag,
    imageDropRowId,
    onAddSection,
    ...handlers
  },
  ref,
) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; edge: "top" | "bottom" } | null>(null);

  const finishDrop = (targetId: string, edge: "top" | "bottom") => {
    const from = dragId;
    setDragId(null);
    setOver(null);
    if (!from || from === targetId || !onReorder) return;
    const group = selectionForDrag?.(from) ?? [from];
    const moving = new Set(group.length > 1 ? group : [from]);
    if (moving.has(targetId)) return;
    // Position in the list without the moving notes; "after" = the note that precedes the slot.
    const ids = open.map((n) => n.id).filter((id) => !moving.has(id));
    const ti = ids.indexOf(targetId);
    if (ti === -1) return;
    const insertAt = edge === "top" ? ti : ti + 1;
    const afterId = insertAt === 0 ? null : ids[insertAt - 1];
    if (moving.size > 1 && onReorderMany) onReorderMany([...moving], afterId);
    else onReorder(from, afterId);
  };

  // Hide notes under collapsed headings.
  const visible: Note[] = [];
  let hiddenUnder: string | null = null;
  for (const n of open) {
    if (isHeading(n)) {
      hiddenUnder = n.collapsed ? n.id : null;
      visible.push(n);
    } else if (!hiddenUnder) visible.push(n);
  }

  // Open notes under each heading (until the next heading).
  const headingCounts = new Map<string, number>();
  let currentHeading: string | null = null;
  for (const n of open) {
    if (isHeading(n)) {
      currentHeading = n.id;
      headingCounts.set(n.id, 0);
    } else if (currentHeading) headingCounts.set(currentHeading, (headingCounts.get(currentHeading) ?? 0) + 1);
  }

  const row = (n: Note, canDrag: boolean) => (
    <NoteRow
      key={n.id}
      note={n}
      sectionCount={isHeading(n) ? headingCounts.get(n.id) : undefined}
      sections={sections}
      showSection={showSection}
      isCursor={cursorId === n.id}
      isSelected={selected.has(n.id)}
      isEditing={editingId === n.id}
      reorderable={canDrag}
      dropTargetRow={imageDropRowId === n.id}
      dropEdge={dragId && over?.id === n.id && dragId !== n.id ? over.edge : null}
      onRowDragStart={(id) => setDragId(id)}
      onRowDragOver={(id, edge) => setOver((o) => (o?.id === id && o.edge === edge ? o : { id, edge }))}
      onRowDrop={finishDrop}
      onRowDragEnd={() => {
        setDragId(null);
        setOver(null);
      }}
      {...handlers}
    />
  );
  const empty = open.length === 0 && done.length === 0;
  const dragging = dragId !== null;
  return (
    <div
      ref={ref}
      tabIndex={0}
      aria-label="Notes"
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3 outline-none"
    >
      {empty ? (
        <div className="px-2 pt-12 text-center text-sm leading-6 text-muted-foreground select-none">{emptyMessage}</div>
      ) : (
        <>
          {visible.length > 0 && (
            <ul role="listbox" aria-multiselectable aria-label="Notes" className="flex flex-col">
              {visible.map((n) => row(n, !!reorderable))}
            </ul>
          )}
          {done.length > 0 && (
            <ul role="listbox" aria-multiselectable aria-label="Search results — done" className="flex flex-col">
              {done.map((n) => row(n, false))}
            </ul>
          )}
          {onAddSection && !dragging && (
            <button
              type="button"
              onClick={onAddSection}
              className="mt-2 flex h-7 w-full items-center gap-1.5 rounded-lg px-2 text-xs font-medium uppercase tracking-wide text-muted-foreground/70 transition-colors hover:bg-foreground/[0.04] hover:text-foreground"
            >
              <Plus className="size-3" /> Add section
            </button>
          )}
        </>
      )}
    </div>
  );
});
