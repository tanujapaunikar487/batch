import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Copy, CornerDownRight, Flag, MoreHorizontal, Trash2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Note, type Priority, type Section, PRIORITIES } from "@/lib/notes";
import { PRIORITY_UI } from "@/lib/priority-ui";
import { Markdown } from "./Markdown";

export interface NoteRowProps {
  note: Note;
  sections: Section[];
  /** Section pill shown in search results. */
  showSection?: boolean;
  isCursor: boolean;
  isSelected: boolean;
  isEditing: boolean;
  onPointerSelect: (id: string, e: React.MouseEvent) => void;
  onToggle: (id: string) => void;
  onEdit: (id: string, text: string) => void;
  onStartEdit: (id: string) => void;
  onStopEdit: () => void;
  onRemove: (ids: string[]) => void;
  onSetPriority: (ids: string[], p: Priority) => void;
  onMove: (ids: string[], sectionId: string) => void;
  onCopy: (ids: string[]) => void;
}

export function NoteRow({
  note,
  sections,
  showSection,
  isCursor,
  isSelected,
  isEditing,
  onPointerSelect,
  onToggle,
  onEdit,
  onStartEdit,
  onStopEdit,
  onRemove,
  onSetPriority,
  onMove,
  onCopy,
}: NoteRowProps) {
  const ui = PRIORITY_UI[note.priority];
  const sectionName = sections.find((s) => s.id === note.sectionId)?.name;
  const rowRef = useRef<HTMLLIElement>(null);

  useEffect(() => {
    if (isCursor) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isCursor]);

  return (
    <li
      ref={rowRef}
      data-note-id={note.id}
      onMouseDown={(e) => {
        // Let checkbox / buttons / editor handle their own clicks.
        if ((e.target as HTMLElement).closest("button,input,textarea,a,[role=menuitem]")) return;
        onPointerSelect(note.id, e);
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button,input,a")) return;
        if (!note.done) onStartEdit(note.id);
      }}
      className={cn(
        "group relative flex items-start gap-2.5 rounded-lg px-2 py-1.5 -mx-0.5 outline-none",
        "hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06]",
        isSelected && "bg-foreground/[0.07] dark:bg-foreground/[0.1] hover:bg-foreground/[0.08]",
        isCursor && "ring-1 ring-ring/40",
        note.done && !isSelected && "opacity-60",
      )}
    >
      <Checkbox
        checked={note.done}
        onCheckedChange={() => onToggle(note.id)}
        aria-label={note.done ? "Mark as not done" : "Mark as done"}
        className="mt-1 shrink-0"
        tabIndex={-1}
      />

      <div className="min-w-0 flex-1">
        {isEditing ? (
          <InlineEditor
            initial={note.text}
            onCommit={(t) => {
              onStopEdit();
              onEdit(note.id, t);
            }}
            onCancel={onStopEdit}
          />
        ) : (
          <Markdown
            text={note.text}
            className={cn("text-sm leading-5", note.done && "line-through text-muted-foreground")}
          />
        )}
        {showSection && sectionName && (
          <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            <CornerDownRight className="size-2.5" /> {sectionName}
          </span>
        )}
      </div>

      {/* Reserved 24px column: priority dot at rest, ⋯ menu on hover — text never runs under it. */}
      <div className="relative mt-0.5 flex h-5 w-6 shrink-0 items-center justify-center">
        <span
          className={cn(
            "size-1.5 rounded-full transition-opacity group-hover:opacity-0 group-focus-within:opacity-0",
            ui.dot,
            note.done && "opacity-40",
          )}
          aria-label={`${ui.label} priority`}
        />
        <div className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" tabIndex={-1} aria-label="Note actions">
                <MoreHorizontal className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-40">
              <DropdownMenuItem onSelect={() => onCopy([note.id])}>
                <Copy /> Copy
              </DropdownMenuItem>
              {!note.done && (
                <DropdownMenuItem onSelect={() => onStartEdit(note.id)}>Edit</DropdownMenuItem>
              )}
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <Flag className={cn("size-3.5", ui.text)} /> Priority
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {PRIORITIES.map((p) => (
                    <DropdownMenuItem key={p} onSelect={() => onSetPriority([note.id], p)}>
                      <span className={cn("size-1.5 rounded-full", PRIORITY_UI[p].dot)} />
                      {PRIORITY_UI[p].label}
                      <DropdownMenuShortcut>{PRIORITIES.indexOf(p) + 1}</DropdownMenuShortcut>
                      {p === note.priority && <Check className="ml-1 size-3.5" />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              {sections.length > 1 && (
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Move to</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    {sections.map((s) => (
                      <DropdownMenuItem
                        key={s.id}
                        disabled={s.id === note.sectionId}
                        onSelect={() => onMove([note.id], s.id)}
                      >
                        {s.name}
                        {s.id === note.sectionId && <Check className="ml-auto size-3.5" />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onSelect={() => onRemove([note.id])}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </li>
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
