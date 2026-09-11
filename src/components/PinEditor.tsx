import { useEffect, useRef, useState } from "react";
import { SquareArrowOutUpRight, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { MAX_PINS, type Attachment, type Pin } from "@/lib/notes";
import { attachmentSrc } from "@/store/attachments";

interface Props {
  attachment: Attachment;
  dir: string;
  /** Called once on close with the final pins (only if they changed). */
  onSave: (pins: Pin[]) => void;
  onClose: () => void;
  /** Open the image file itself (Preview / new tab). */
  onOpenFile?: () => void;
}

const DRAG_THRESHOLD = 0.012; // fraction of the image; below this a drag is a click

/**
 * Modal markup editor: the image on the left, a scrollable comments panel on
 * the right (Figma-style). Click the image to drop a numbered marker; drag to
 * mark an area. Each marker gets one comment, edited in the panel.
 * Esc / Done / clicking outside saves and closes.
 */
export function PinEditor({ attachment, dir, onSave, onClose, onOpenFile }: Props) {
  const [pins, setPins] = useState<Pin[]>(attachment.pins ?? []);
  const initial = useRef(JSON.stringify(attachment.pins ?? []));
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  /** The comment being edited in the panel; isNew = marker just placed. */
  const [active, setActive] = useState<{ i: number; draft: string; isNew: boolean } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    if (!active) rootRef.current?.focus();
    else rowRefs.current[active.i]?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const finish = () => {
    const cleaned = pins.map((p) => ({ ...p, text: p.text.trim() }));
    if (JSON.stringify(cleaned) !== initial.current) onSave(cleaned);
    onClose();
  };

  const clamp = (v: number) => Math.min(1, Math.max(0, v));
  const frac = (e: { clientX: number; clientY: number }) => {
    const r = imgRef.current!.getBoundingClientRect();
    return { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) };
  };

  const closeEditor = (commit: boolean) => {
    if (!active) return;
    setPins((cur) => {
      if (!commit && active.isNew) return cur.filter((_, j) => j !== active.i);
      return cur.map((q, j) => (j === active.i ? { ...q, text: commit ? active.draft : q.text } : q));
    });
    setActive(null);
  };

  const startDrag = (e: React.MouseEvent) => {
    if (active) closeEditor(true);
    if (pins.length >= MAX_PINS) return;
    const p = frac(e);
    setDrag({ ...p, x2: p.x, y2: p.y });
  };
  const moveDrag = (e: React.MouseEvent) => {
    if (!drag) return;
    const p = frac(e);
    setDrag({ ...drag, x2: p.x, y2: p.y });
  };
  const endDrag = () => {
    if (!drag) return;
    const w = Math.abs(drag.x2 - drag.x);
    const h = Math.abs(drag.y2 - drag.y);
    const pin: Pin =
      w > DRAG_THRESHOLD || h > DRAG_THRESHOLD
        ? { x: Math.min(drag.x, drag.x2), y: Math.min(drag.y, drag.y2), w, h, text: "" }
        : { x: drag.x, y: drag.y, text: "" };
    setDrag(null);
    setPins((cur) => [...cur, pin]);
    setActive({ i: pins.length, draft: "", isNew: true });
  };

  const activate = (i: number) => {
    if (active?.i === i) return;
    if (active) closeEditor(true);
    setActive({ i, draft: pins[i].text, isNew: false });
  };

  const badge = (i: number, extra?: string) => (
    <span
      className={cn(
        "grid size-5 shrink-0 place-items-center rounded-full bg-orange-600 text-[11px] font-bold text-white",
        extra,
      )}
    >
      {i + 1}
    </span>
  );

  const marker = (p: Pin, i: number) => {
    const isArea = !!(p.w && p.h);
    const open = (e: React.MouseEvent) => {
      e.stopPropagation();
      activate(i);
    };
    return (
      <span key={i}>
        {isArea && (
          <button
            type="button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={open}
            aria-label={`Area ${i + 1}`}
            style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%`, width: `${p.w! * 100}%`, height: `${p.h! * 100}%` }}
            className={cn(
              "absolute rounded-sm border-2 border-orange-500 bg-orange-500/10 hover:bg-orange-500/20",
              active?.i === i && "bg-orange-500/20",
            )}
          />
        )}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={open}
          aria-label={`Marker ${i + 1}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          className={cn(
            "absolute -translate-x-1/2 -translate-y-1/2 shadow ring-1 ring-white/70 rounded-full",
            active?.i === i && "ring-2 ring-white",
          )}
        >
          {badge(i)}
        </button>
      </span>
    );
  };

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Markers on ${attachment.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 outline-none backdrop-blur-[2px]"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          if (active) closeEditor(false);
          else finish();
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className="flex max-h-[85vh] w-full min-h-0 max-w-3xl flex-col rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-border/60 px-4 py-2.5">
          <span className="min-w-0 truncate text-sm font-medium">{attachment.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {pins.length === 0 ? "" : `${pins.length} marker${pins.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex-1" />
          {onOpenFile && (
            <Button size="icon-xs" variant="ghost" onClick={onOpenFile} title="Open image file" aria-label="Open image file">
              <SquareArrowOutUpRight />
            </Button>
          )}
          <Button size="sm" onClick={finish}>
            Save
          </Button>
          <Button
            size="icon-xs"
            variant="ghost"
            title="Close without saving"
            aria-label="Close without saving"
            onClick={onClose}
          >
            <X />
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
          <div className="flex min-h-0 min-w-0 flex-1 items-center justify-center p-4">
            <div
              className="relative max-h-full max-w-full select-none"
              onMouseDown={startDrag}
              onMouseMove={moveDrag}
              onMouseUp={endDrag}
              onMouseLeave={() => drag && endDrag()}
            >
              <img
                ref={imgRef}
                src={attachmentSrc(attachment, dir, true)}
                alt={attachment.name}
                draggable={false}
                className="block max-h-[62vh] max-w-full cursor-crosshair rounded-md border border-border/60"
              />
              {pins.map(marker)}
              {drag && (
                <span
                  aria-hidden
                  style={{
                    left: `${Math.min(drag.x, drag.x2) * 100}%`,
                    top: `${Math.min(drag.y, drag.y2) * 100}%`,
                    width: `${Math.abs(drag.x2 - drag.x) * 100}%`,
                    height: `${Math.abs(drag.y2 - drag.y) * 100}%`,
                  }}
                  className="pointer-events-none absolute rounded-sm border-2 border-dashed border-orange-500 bg-orange-500/10"
                />
              )}
            </div>
          </div>

          <div className="flex min-h-0 w-full shrink-0 flex-col border-t border-border/60 sm:w-72 sm:border-l sm:border-t-0">
            <div className="shrink-0 px-4 pb-1 pt-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Comments
            </div>
            <ScrollArea className="min-h-0 flex-1">
              <div className="flex flex-col gap-1 px-3 pb-3">
                {pins.length === 0 && (
                  <p className="px-1 pt-1 text-xs leading-5 text-muted-foreground">
                    Click the image to drop a marker, or drag to mark an area — the comment goes here.
                  </p>
                )}
                {pins.map((p, i) => (
                  <div
                    key={i}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    className={cn(
                      "rounded-lg border border-transparent",
                      active?.i === i ? "border-border bg-foreground/[0.03] p-2.5" : "px-2 py-1.5 hover:bg-foreground/[0.03]",
                    )}
                  >
                    {active?.i === i ? (
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2">
                          {badge(i)}
                          <span className="text-xs text-muted-foreground">{p.w ? "area" : "pin"}</span>
                          <div className="flex-1" />
                          <Button
                            size="icon-xs"
                            variant="ghost"
                            aria-label="Delete marker"
                            onClick={() => {
                              const i2 = active.i;
                              setActive(null);
                              setPins((cur) => cur.filter((_, j) => j !== i2));
                            }}
                          >
                            <Trash2 />
                          </Button>
                        </div>
                        <Input
                          autoFocus
                          className="text-sm"
                          value={active.draft}
                          placeholder={p.w ? "What about this area?" : "What about this spot?"}
                          onChange={(e) => setActive({ ...active, draft: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              closeEditor(true);
                            } else if (e.key === "Escape") {
                              e.preventDefault();
                              e.stopPropagation();
                              closeEditor(false);
                            }
                          }}
                        />
                        <div className="flex items-center gap-2">
                          <Button size="xs" onClick={() => closeEditor(true)}>
                            {active.isNew ? "Add" : "Save"}
                          </Button>
                          <Button size="xs" variant="ghost" onClick={() => closeEditor(false)}>
                            Cancel
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <button type="button" onClick={() => activate(i)} className="flex w-full items-start gap-2 text-left">
                        {badge(i, "mt-px")}
                        <span className={cn("min-w-0 flex-1 text-xs leading-5", p.text ? "" : "italic text-muted-foreground")}>
                          {p.text || "No comment yet"}
                        </span>
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="shrink-0 border-t border-border/60 px-4 py-2 text-center text-[10px] text-muted-foreground">
              Markers ride along when this ships to your agent · Esc saves
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
