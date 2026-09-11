import { useState } from "react";
import { Bot, Check, CheckCircle2, Circle, MessageSquarePlus, MoreHorizontal, RotateCcw, Star, X } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Attachment, type Note, noteState, sortKey } from "@/lib/notes";
import { Markdown } from "./Markdown";
import { AttachmentStrip } from "./AttachmentStrip";

interface Props {
  /** The active folder's notes (no headings) — same scope as the List view. */
  notes: Note[];
  folderName: string;
  attachmentsDir: string;
  /** Search mode: results span folders — label each card, show handled openly. */
  searching?: boolean;
  folderOf?: (n: Note) => string | undefined;
  /** Multi-select (⌘-click), owned by App so Esc can clear it. */
  selected: Set<string>;
  onToggleSelect: (id: string) => void;
  onClearSelection: () => void;
  onHandOff: (ids: string[]) => void;
  onSetDone: (ids: string[], done: boolean) => void;
  onBackToMe: (id: string) => void;
  onDelete: (ids: string[]) => void;
  onToggleStar: (ids: string[]) => void;
  onMerge: (ids: string[]) => void;
  onEditText: (id: string, text: string) => void;
  onAddAnswer: (id: string, text: string) => void;
  onAttachImages: (id: string) => void;
  /** Note currently under an image drag, for the drop highlight. */
  imageDropRowId?: string | null;
  onOpenAttachment: (noteId: string, a: Attachment) => void;
}

/**
 * The Focus view: the active folder's notes grouped by where they stand —
 * on your mind / with your agent / handled — with two verbs per card and a
 * headline that counts down. Star = important (same star as the List view).
 */
export function ClearView(p: Props) {
  const [showHandled, setShowHandled] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [answering, setAnswering] = useState<string | null>(null);

  const open = p.notes.filter((n) => noteState(n) === "open");
  const withClaude = p.notes.filter((n) => noteState(n) === "claude");
  const handled = p.notes.filter((n) => noteState(n) === "done");
  const byStarThenOrder = (a: Note, z: Note) =>
    Number(z.priority === "high") - Number(a.priority === "high") || sortKey(a) - sortKey(z);
  const sel = [...p.selected];

  const act = (
    label: string,
    icon: React.ReactNode,
    onClick: () => void,
    kind: "primary" | "plain" = "plain",
    extraClassName?: string,
  ) => (
    <Tooltip key={label}>
      <TooltipTrigger asChild>
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "grid size-7 place-items-center rounded-full transition-colors",
            kind === "primary"
              ? "bg-primary/10 text-primary hover:bg-primary/20"
              : "text-muted-foreground hover:bg-foreground/[0.06] hover:text-foreground",
            extraClassName,
          )}
        >
          {icon}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  const verb = (label: string, onClick: () => void, kind: "claude" | "done" | "quiet" = "quiet") => (
    <button
      key={label}
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-xs font-medium transition-colors",
        kind === "claude" && "bg-primary/10 text-primary hover:bg-primary/15",
        kind === "done" && "bg-foreground/[0.05] text-muted-foreground hover:bg-foreground/[0.09] hover:text-foreground",
        kind === "quiet" && "px-1.5 text-muted-foreground/70 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );

  const more = (items: [string, () => void][]) => (
    <DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              aria-label="More actions"
              className="grid size-7 place-items-center rounded-full text-muted-foreground/70 transition-colors hover:bg-foreground/[0.06] hover:text-foreground aria-expanded:bg-foreground/[0.06]"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">More actions</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="start" className="min-w-40">
        {items.map(([text, run]) => (
          <DropdownMenuItem key={text} onSelect={run}>
            {text}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  const card = (n: Note) => {
    const st = noteState(n);
    const isSel = p.selected.has(n.id);
    return (
      <div
        key={n.id}
        onClickCapture={(e) => {
          if (!e.metaKey) return;
          e.preventDefault();
          e.stopPropagation();
          p.onToggleSelect(n.id);
        }}
        data-note-id={n.id}
        className={cn(
          "relative rounded-xl border border-border/60 bg-background/60 px-4 py-3 dark:bg-input/30",
          isSel && "border-primary/50 ring-2 ring-primary/25",
          p.imageDropRowId === n.id && "border-primary ring-2 ring-primary/40",
        )}
      >
        {editing === n.id ? (
          <textarea
            autoFocus
            defaultValue={n.text}
            rows={Math.min(5, n.text.split("\n").length + 1)}
            onBlur={(e) => {
              p.onEditText(n.id, e.target.value);
              setEditing(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setEditing(null);
              } else if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                (e.target as HTMLTextAreaElement).blur();
              }
            }}
            className="w-full resize-none rounded-md border border-input bg-background/60 px-2 py-1 text-sm outline-none"
          />
        ) : (
          <div
            onDoubleClick={st === "done" ? undefined : () => setEditing(n.id)}
            className={cn("text-sm leading-6", st === "done" && "text-muted-foreground line-through decoration-muted-foreground/60")}
          >
            <Markdown text={n.text || "(images only)"} />
          </div>
        )}

        {(n.source || (p.searching && p.folderOf?.(n))) && (
          <div className="mt-0.5 text-[11px] text-muted-foreground/80">
            {[n.source && `from ${[n.source.app, n.source.title].filter(Boolean).join(" · ")}`, p.searching ? p.folderOf?.(n) : null]
              .filter(Boolean)
              .join(" · ")}
          </div>
        )}

        {(n.attachments?.length ?? 0) > 0 && (
          <AttachmentStrip
            attachments={n.attachments!}
            dir={p.attachmentsDir}
            size="md"
            onOpen={(a) => p.onOpenAttachment(n.id, a)}
            className={cn("mt-2", st === "done" && "opacity-70")}
          />
        )}

        {n.outcome && (
          <div className="mt-2 rounded-lg border border-border/60 bg-foreground/[0.03] px-3 py-2">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              {n.outcome.by === "agent" ? "Agent" : "You"}
            </div>
            <Markdown text={n.outcome.text} className="text-xs leading-5 text-muted-foreground" />
          </div>
        )}
        {answering === n.id && (
          <textarea
            autoFocus
            rows={3}
            placeholder="Paste the answer here, then click away"
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v) p.onAddAnswer(n.id, v);
              setAnswering(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                setAnswering(null);
              }
            }}
            className="mt-2 w-full resize-y rounded-lg border border-input bg-background/60 px-3 py-2 text-xs outline-none"
          />
        )}

        <div className="mt-2 flex flex-wrap items-center gap-0.5">
          {act(
            isSel ? "Deselect" : "Select (⌘-click the card)",
            isSel ? <CheckCircle2 className="size-4" /> : <Circle className="size-4" />,
            () => p.onToggleSelect(n.id),
            isSel ? "primary" : "plain",
          )}
          {st === "open" && (
            <>
              {act("Let your agent handle it", <Bot className="size-4" />, () => p.onHandOff([n.id]), "primary")}
              {act("Done with it", <Check className="size-4" />, () => p.onSetDone([n.id], true))}
              {more([
                ["Attach an image…", () => p.onAttachImages(n.id)],
                ["Delete this note", () => p.onDelete([n.id])],
              ])}
            </>
          )}
          {st === "claude" && (
            <>
              {!n.outcome &&
                answering !== n.id &&
                act("Add the answer", <MessageSquarePlus className="size-4" />, () => setAnswering(n.id), "primary")}
              {act(n.outcome ? "Great — done with it" : "Done with it", <Check className="size-4" />, () =>
                p.onSetDone([n.id], true),
              )}
              {more([
                ["Copy the block again", () => p.onHandOff([n.id])],
                ["Back to me", () => p.onBackToMe(n.id)],
                ["Attach an image…", () => p.onAttachImages(n.id)],
                ["Delete this note", () => p.onDelete([n.id])],
              ])}
            </>
          )}
          {st === "done" && act("Bring it back", <RotateCcw className="size-4" />, () => p.onSetDone([n.id], false))}
          {st !== "done" && (
            <div className="ml-auto">
              {act(
                n.priority === "high" ? "Unstar" : "Star — this one matters",
                <Star className="size-4" fill={n.priority === "high" ? "currentColor" : "none"} />,
                () => p.onToggleStar([n.id]),
                n.priority === "high" ? "primary" : "plain",
                n.priority === "high" ? "!text-amber-500 !bg-amber-500/10 hover:!bg-amber-500/15" : "hover:!text-amber-500",
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  const label = (text: string, hint?: string) => (
    <div className="mb-2 mt-5 px-1">
      <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">{text}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground/80">{hint}</div>}
    </div>
  );

  return (
    <div className="relative min-h-0 flex-1 overflow-y-auto px-5 pb-2">
      <div className="pt-3 text-center">
        <div className="text-[13px] text-muted-foreground">
          {open.length === 0 && withClaude.length === 0 ? (
            p.searching ? (handled.length ? "Only handled notes match." : "Nothing matches.") : "Nothing on your mind here."
          ) : (
            <>
              {open.length > 0 && (
                <>
                  <span className="font-medium text-foreground">
                    {open.length} thing{open.length === 1 ? "" : "s"}
                  </span>{" "}
                  on your mind
                </>
              )}
              {open.length > 0 && withClaude.length > 0 && " · "}
              {withClaude.length > 0 && (
                <span className="font-medium text-primary">{withClaude.length} with your agent</span>
              )}
            </>
          )}
        </div>
      </div>

      {open.length === 0 && withClaude.length === 0 && !p.searching && (
        <div className="pt-8 text-center text-xs text-muted-foreground/70">That's the whole point.</div>
      )}

      {open.length > 0 && (
        <>
          {label("On your mind")}
          <div className="flex flex-col gap-2">{[...open].sort(byStarThenOrder).map(card)}</div>
          {open.length > 1 && !p.searching && (
            <div className="mt-3 text-center">
              <button
                type="button"
                onClick={() => p.onHandOff(open.map((n) => n.id))}
                className="text-xs text-primary underline decoration-primary/30 underline-offset-2 hover:decoration-primary"
              >
                hand all of {p.folderName} to your agent
              </button>
            </div>
          )}
        </>
      )}

      {withClaude.length > 0 && (
        <>
          {label(
            "With your agent",
            withClaude.some((n) => !n.outcome)
              ? "Paste the block into your AI chat and bring the answer back — or let an agent on MCP answer here itself."
              : undefined,
          )}
          <div className="flex flex-col gap-2">{[...withClaude].sort((a, z) => sortKey(a) - sortKey(z)).map(card)}</div>
        </>
      )}

      {handled.length > 0 && (
        <div className="mt-6 pb-2 text-center">
          {!p.searching && (
            <button
              type="button"
              onClick={() => setShowHandled((v) => !v)}
              className="text-xs text-muted-foreground/70 hover:text-muted-foreground"
            >
              {showHandled ? "hide" : "show"} what's been handled ({handled.length})
            </button>
          )}
          {p.searching && handled.length > 0 && (
            <div className="mb-2 px-1 text-left text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">Handled</div>
          )}
          {(showHandled || p.searching) && (
            <div className="mt-3 flex flex-col gap-2 text-left opacity-80">
              {[...handled].sort((a, z) => (z.completedAt ?? 0) - (a.completedAt ?? 0)).slice(0, 30).map(card)}
            </div>
          )}
        </div>
      )}

      {sel.length > 0 && (
        <div className="sticky bottom-2 z-10 mx-auto mt-3 flex w-fit max-w-full flex-wrap items-center justify-center gap-1 rounded-full border border-border bg-background/95 px-3 py-1.5 shadow-lg backdrop-blur">
          <span className="pr-1 text-xs text-muted-foreground">{sel.length} selected</span>
          {verb("Hand to agent", () => p.onHandOff(sel), "claude")}
          {verb("Done", () => p.onSetDone(sel, true), "done")}
          {verb("Star", () => p.onToggleStar(sel))}
          {sel.length > 1 && verb("Merge", () => p.onMerge(sel))}
          {verb("clear", () => p.onDelete(sel))}
          <button
            type="button"
            aria-label="Deselect"
            onClick={p.onClearSelection}
            className="grid size-5 place-items-center rounded-full text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
    </div>
  );
}
