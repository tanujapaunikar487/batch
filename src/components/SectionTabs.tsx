import { useEffect, useRef, useState } from "react";
import { Plus } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { cn } from "@/lib/utils";
import { formatBinding } from "@/lib/shortcuts";
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
  onShipFolder: (id: string) => void;
  onEditInstructions: (id: string) => void;
  /** Shortcut hints shown in the menu. */
  bindings: { ship: string; copyList: string; clearDone: string };
  onReorder: (id: string, afterId: string | null) => void;
  /** A search query is active — no tab reads as "active" (results span every folder);
   * clicking one jumps there and exits search. */
  searching?: boolean;
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
  onShipFolder,
  onEditInstructions,
  bindings,
  onReorder,
  searching,
  addRequest,
  renameRequest,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string; side: "left" | "right" } | null>(null);
  const [adding, setAdding] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
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
    <div className="flex shrink-0 items-center gap-1 overflow-x-auto px-5 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist">
      {sections.map((s, i) => {
        const isActive = !searching && s.id === activeId;
        return renaming === s.id ? (
          <span key={s.id}>{editor}</span>
        ) : (
          <ContextMenu key={s.id}>
            <ContextMenuTrigger asChild>
              <button
                ref={isActive ? activeRef : undefined}
                role="tab"
                aria-selected={isActive}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/x-batch-folder", s.id);
                  e.dataTransfer.effectAllowed = "move";
                  setDragId(s.id);
                }}
                onDragOver={(e) => {
                  if (!e.dataTransfer.types.includes("application/x-batch-folder")) return;
                  e.preventDefault();
                  const r = e.currentTarget.getBoundingClientRect();
                  const side = e.clientX < r.left + r.width / 2 ? "left" : "right";
                  setOver((o) => (o?.id === s.id && o.side === side ? o : { id: s.id, side }));
                }}
                onDrop={(e) => {
                  if (!e.dataTransfer.types.includes("application/x-batch-folder")) return;
                  e.preventDefault();
                  const from = dragId;
                  const r = e.currentTarget.getBoundingClientRect();
                  const side = e.clientX < r.left + r.width / 2 ? "left" : "right";
                  setDragId(null);
                  setOver(null);
                  if (!from || from === s.id) return;
                  const ids = sections.map((x) => x.id).filter((x) => x !== from);
                  const ti = ids.indexOf(s.id);
                  const at = side === "left" ? ti : ti + 1;
                  onReorder(from, at === 0 ? null : ids[at - 1]);
                }}
                onDragEnd={() => {
                  setDragId(null);
                  setOver(null);
                }}
                title={
                  isActive
                    ? "Click to rename · right-click for options"
                    : searching
                      ? "Jump here · exits search"
                      : i < 9
                        ? `⌘${i + 1} · right-click for options`
                        : "right-click for options"
                }
                // Click selects; clicking the active folder's name renames it; right-click opens the menu.
                // While searching, no tab is "active" — every click jumps there and exits search.
                onClick={() => {
                  if (isActive) {
                    setRenaming(s.id);
                    setDraft(s.name);
                  } else {
                    onSelect(s.id);
                  }
                }}
                className={cn(
                  "relative flex h-7 shrink-0 items-center gap-1.5 rounded-md px-2.5 text-[13px] transition-colors select-none",
                  dragId && over?.id === s.id && dragId !== s.id && over.side === "left" &&
                    "before:absolute before:-left-1 before:top-1 before:bottom-1 before:w-0.5 before:rounded-full before:bg-ring",
                  dragId && over?.id === s.id && dragId !== s.id && over.side === "right" &&
                    "after:absolute after:-right-1 after:top-1 after:bottom-1 after:w-0.5 after:rounded-full after:bg-ring",
                  isActive
                    ? "bg-foreground/[0.08] text-foreground dark:bg-foreground/[0.12]"
                    : "text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
                )}
              >
                {s.name}
                {counts[s.id] > 0 && (
                  <span className="text-xs tabular-nums text-muted-foreground">{counts[s.id]}</span>
                )}
              </button>
            </ContextMenuTrigger>
            <ContextMenuContent className="min-w-44">
              <ContextMenuItem
                onSelect={() => {
                  setRenaming(s.id);
                  setDraft(s.name);
                }}
              >
                Rename
              </ContextMenuItem>
              <ContextMenuSeparator />
              <ContextMenuItem onSelect={() => onShipFolder(s.id)}>
                Ship folder to your agent
                <ContextMenuShortcut>{formatBinding(bindings.ship)}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onEditInstructions(s.id)}>Agent instructions for this folder…</ContextMenuItem>
              <ContextMenuItem onSelect={() => onCopyAsList(s.id)}>
                Copy folder as list
                <ContextMenuShortcut>{formatBinding(bindings.copyList)}</ContextMenuShortcut>
              </ContextMenuItem>
              <ContextMenuItem onSelect={() => onClearDone(s.id)}>
                Clear done in folder
                <ContextMenuShortcut>{formatBinding(bindings.clearDone)}</ContextMenuShortcut>
              </ContextMenuItem>
              {s.id !== INBOX_ID && (
                <>
                  <ContextMenuSeparator />
                  <ContextMenuItem variant="destructive" onSelect={() => onRemove(s.id)}>
                    Delete folder
                  </ContextMenuItem>
                </>
              )}
            </ContextMenuContent>
          </ContextMenu>
        );
      })}
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
          className="grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      )}
    </div>
  );
}
