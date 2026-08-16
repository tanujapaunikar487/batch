import { forwardRef } from "react";
import { type Note, type Section } from "@/lib/notes";
import { NoteRow, type NoteRowProps } from "./NoteRow";

type RowHandlers = Omit<
  NoteRowProps,
  "note" | "sections" | "showSection" | "isCursor" | "isSelected" | "isEditing"
>;

interface Props extends RowHandlers {
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
  { open, done, sections, showSection, cursorId, selected, editingId, emptyMessage, onKeyDown, ...handlers },
  ref,
) {
  const row = (n: Note) => (
    <NoteRow
      key={n.id}
      note={n}
      sections={sections}
      showSection={showSection}
      isCursor={cursorId === n.id}
      isSelected={selected.has(n.id)}
      isEditing={editingId === n.id}
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
      className="min-h-0 flex-1 overflow-y-auto px-5 pb-2 pt-1 outline-none"
    >
      {empty ? (
        <div className="px-2 pt-12 text-center text-sm text-muted-foreground select-none">{emptyMessage}</div>
      ) : (
        <>
          {open.length > 0 && <ul className="flex flex-col">{open.map(row)}</ul>}
          {open.length > 0 && done.length > 0 && <div className="my-1.5 border-t border-border/60" />}
          {done.length > 0 && <ul className="flex flex-col">{done.map(row)}</ul>}
        </>
      )}
    </div>
  );
});
