import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
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
  /** Externally triggered "new folder" (⌘⇧N). */
  addRequest: number;
  /** Externally triggered "rename active folder". */
  renameRequest: number;
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
  renameRequest,
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
    if (renameRequest > 0) {
      const active = sections.find((s) => s.id === activeId);
      if (active) {
        setRenaming(active.id);
        setDraft(active.name);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renameRequest]);

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
    <Input
      ref={inputRef}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") commit();
        else if (e.key === "Escape") cancel();
      }}
      placeholder="Folder name"
      aria-label={renaming ? "Rename folder" : "New folder name"}
      className="h-7 w-32 bg-background/60 px-2 text-[13px] md:text-[13px] focus-visible:ring-ring/15 dark:bg-input/40"
    />
  );

  return (
    <div className="flex items-center gap-1 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
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
                title={
                  s.id === activeId
                    ? "Click to rename · right-click for options"
                    : i < 9
                      ? `⌘${i + 1} · right-click for options`
                      : "right-click for options"
                }
                // Click selects; clicking the active folder's name renames it; right-click opens the menu.
                onPointerDown={(e) => e.preventDefault()}
                onClick={() => {
                  if (s.id === activeId) {
                    setRenaming(s.id);
                    setDraft(s.name);
                  } else {
                    onSelect(s.id);
                  }
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setMenuFor(s.id);
                }}
                className={cn(
                  "flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors select-none",
                  s.id === activeId
                    ? "bg-foreground/[0.08] text-foreground dark:bg-foreground/[0.12]"
                    : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                )}
              >
                {s.name}
                {counts[s.id] > 0 && (
                  <span className="text-[11px] tabular-nums text-muted-foreground/70">{counts[s.id]}</span>
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
                    Delete folder
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
          aria-label="New folder (⇧⌘N)"
          title="New folder  ⇧⌘N"
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground/70 hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      )}
    </div>
  );
}
