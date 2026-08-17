import { forwardRef, useState } from "react";
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
>;

interface Props extends RowHandlers {
  /** Enable drag-to-reorder of open notes (off in search results). */
  reorderable?: boolean;
  /** Called with the dragged id and the id it should follow (null = top). */
  onReorder?: (id: string, afterId: string | null) => void;
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
    // Position in the list without the dragged note; "after" = the note that precedes the slot.
    const ids = open.map((n) => n.id).filter((id) => id !== from);
    const ti = ids.indexOf(targetId);
    if (ti === -1) return;
    const insertAt = edge === "top" ? ti : ti + 1;
    onReorder(from, insertAt === 0 ? null : ids[insertAt - 1]);
  };

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
  return (
    <div
      ref={ref}
      tabIndex={0}
      role="listbox"
      aria-multiselectable
      aria-label="Notes"
      onKeyDown={onKeyDown}
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-3 pt-3 outline-none"
    >
      {empty ? (
        <div className="px-2 pt-12 text-center text-sm text-muted-foreground select-none">{emptyMessage}</div>
      ) : (
        <>
          {open.length > 0 && <ul className="flex flex-col">{open.map((n) => row(n, !!reorderable))}</ul>}
          {open.length > 0 && done.length > 0 && <div className="my-1.5 border-t border-border/60" />}
          {done.length > 0 && <ul className="flex flex-col">{done.map((n) => row(n, false))}</ul>}
        </>
      )}
    </div>
  );
});
