import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Section, INBOX_ID } from "@/lib/notes";

interface Props {
  sections: Section[];
  counts: Record<string, number>;
  activeId: string;
  onSelect: (id: string) => void;
  onAdd: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
  onCopyAsList: (id: string) => void;
  onClearDone: (id: string) => void;
  /** Externally triggered "new section" (⌘⇧N). */
  addRequest: number;
}

export function SectionTabs({
  sections,
  counts,
  activeId,
  onSelect,
  onAdd,
  onRename,
  onRemove,
  onCopyAsList,
  onClearDone,
  addRequest,
}: Props) {
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (addRequest > 0) {
      setAdding(true);
      setDraft("");
    }
  }, [addRequest]);

  useEffect(() => {
    if (adding || renaming) inputRef.current?.focus();
  }, [adding, renaming]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ inline: "nearest", block: "nearest" });
  }, [activeId]);

  const commit = () => {
    const name = draft.trim();
    if (renaming) {
      if (name) onRename(renaming, name);
      setRenaming(null);
    } else if (adding) {
      if (name) onAdd(name);
      setAdding(false);
    }
    setDraft("");
  };
  const cancel = () => {
    setAdding(false);
    setRenaming(null);
    setDraft("");
  };

  const editor = (
    <input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      placeholder="Section name"
      aria-label={renaming ? "Rename section" : "New section name"}
      className="h-6 w-28 rounded-md border border-input bg-background/60 px-2 text-xs outline-none focus-visible:border-ring/60"
    />
  );

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {sections.map((s, i) =>
        renaming === s.id ? (
          <span key={s.id}>{editor}</span>
        ) : (
          <DropdownMenu key={s.id} open={menuFor === s.id} onOpenChange={(o) => setMenuFor(o ? s.id : null)}>
            <DropdownMenuTrigger asChild>
              <button
                ref={s.id === activeId ? activeRef : undefined}
                role="tab"
                aria-selected={s.id === activeId}
                title={i < 9 ? `⌘${i + 1} · right-click for options` : "right-click for options"}
                // Left click selects, double-click renames, right-click opens the menu.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => onSelect(s.id)}
                onDoubleClick={() => {
                  setRenaming(s.id);
                  setDraft(s.name);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuFor(s.id);
                }}
                className={cn(
                  "flex h-6 shrink-0 items-center gap-1.5 rounded-md px-2 text-xs transition-colors select-none",
                  s.id === activeId
                    ? "bg-foreground/[0.08] text-foreground dark:bg-foreground/[0.12]"
                    : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                )}
              >
                {s.name}
                {counts[s.id] > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground/70">{counts[s.id]}</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="min-w-44">
              <DropdownMenuItem
                onSelect={() => {
                  setRenaming(s.id);
                  setDraft(s.name);
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onCopyAsList(s.id)}>Copy as list</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onClearDone(s.id)}>Clear done</DropdownMenuItem>
              {s.id !== INBOX_ID && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => onRemove(s.id)}>
                    Delete section
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      )}
      {adding ? (
        editor
      ) : (
        <button
          type="button"
          onClick={() => {
            setAdding(true);
            setDraft("");
          }}
          aria-label="New section (⇧⌘N)"
          title="New section  ⇧⌘N"
          className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Plus className="size-3.5" />
        </button>
      )}
    </div>
  );
}
