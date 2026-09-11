import { useEffect, useRef, useState } from "react";
import { SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
 * Modal over a dimmed backdrop. Click the image to drop a numbered pin; drag to
 * mark an area. A comment popover opens at the marker (Add / Cancel); clicking
 * a marker reopens it to edit or delete. Esc / Done / outside saves and closes.
 */
export function PinEditor({ attachment, dir, onSave, onClose, onOpenFile }: Props) {
  const [pins, setPins] = useState<Pin[]>(attachment.pins ?? []);
  const initial = useRef(JSON.stringify(attachment.pins ?? []));
  const rootRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  /** Open popover: which pin it edits, its draft text, and whether the pin is brand-new. */
  const [pop, setPop] = useState<{ i: number; draft: string; isNew: boolean } | null>(null);
  const [drag, setDrag] = useState<{ x: number; y: number; x2: number; y2: number } | null>(null);

  useEffect(() => {
    if (!pop) rootRef.current?.focus();
  }, [pop]);

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

  const closePopover = (commit: boolean) => {
    if (!pop) return;
    setPins((cur) => {
      if (!commit && pop.isNew) return cur.filter((_, j) => j !== pop.i); // Cancel on a fresh marker removes it
      return cur.map((q, j) => (j === pop.i ? { ...q, text: commit ? pop.draft : q.text } : q));
    });
    setPop(null);
  };

  const startDrag = (e: React.MouseEvent) => {
    if (pop) return void closePopover(true);
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
    setPop({ i: pins.length, draft: "", isNew: true });
  };

  const marker = (p: Pin, i: number) => {
    const isArea = !!(p.w && p.h);
    const open = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (pop?.i === i) return;
      if (pop) closePopover(true);
      setPop({ i, draft: p.text, isNew: false });
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
            className="absolute rounded-sm border-2 border-emerald-500 bg-emerald-500/15 hover:bg-emerald-500/25"
          />
        )}
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={open}
          aria-label={`${isArea ? "Area" : "Pin"} ${i + 1}`}
          style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
          className={cn(
            "absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full text-[11px] font-bold text-white shadow ring-1 ring-white/70",
            isArea ? "bg-emerald-600" : "bg-orange-600",
          )}
        >
          {i + 1}
        </button>
      </span>
    );
  };

  const popPin = pop ? pins[pop.i] : null;

  return (
    <div
      ref={rootRef}
      tabIndex={-1}
      role="dialog"
      aria-label={`Pins on ${attachment.name}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 outline-none backdrop-blur-[2px]"
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") {
          e.preventDefault();
          if (pop) closePopover(false);
          else finish();
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className="flex max-h-[85vh] w-full min-h-0 max-w-[560px] flex-col rounded-xl border border-border bg-background shadow-2xl">
        <div className="flex items-center gap-2 px-4 pb-1 pt-3">
          <span className="min-w-0 truncate text-sm font-medium">{attachment.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">
            {pins.length === 0
              ? "click to pin · drag to mark an area"
              : `${pins.length} marker${pins.length === 1 ? "" : "s"}`}
          </span>
          <div className="flex-1" />
          {onOpenFile && (
            <button
              type="button"
              onClick={onOpenFile}
              title="Open image file"
              aria-label="Open image file"
              className="grid size-6 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              <SquareArrowOutUpRight className="size-3.5" />
            </button>
          )}
          <Button size="sm" variant="secondary" className="h-6 px-2.5 text-xs" onClick={finish}>
            Done
          </Button>
        </div>

        <div className="flex min-h-0 flex-1 items-center justify-center px-4 py-2">
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
              className="block max-h-[48vh] max-w-full cursor-crosshair rounded-md border border-border/60"
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
                className="pointer-events-none absolute rounded-sm border-2 border-dashed border-emerald-500 bg-emerald-500/10"
              />
            )}

            {pop && popPin && (
              <div
                style={{
                  left: `${Math.min(78, Math.max(8, (popPin.x + (popPin.w ?? 0) / 2) * 100))}%`,
                  top: `${Math.min(96, (popPin.y + (popPin.h ?? 0)) * 100 + 3)}%`,
                }}
                className="absolute z-10 w-56 -translate-x-1/2 rounded-lg border border-border bg-background p-2 shadow-xl"
                onMouseDown={(e) => e.stopPropagation()}
              >
                <input
                  autoFocus
                  value={pop.draft}
                  placeholder={popPin.w ? "What about this area?" : "What about this spot?"}
                  onChange={(e) => setPop({ ...pop, draft: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      closePopover(true);
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      e.stopPropagation();
                      closePopover(false);
                    }
                  }}
                  className="h-6 w-full rounded-md border border-input bg-background px-2 text-xs outline-none focus:border-ring/50"
                />
                <div className="mt-1.5 flex items-center gap-1">
                  <Button size="sm" className="h-5 px-2 text-[11px]" onClick={() => closePopover(true)}>
                    {pop.isNew ? "Add" : "Save"}
                  </Button>
                  <Button size="sm" variant="ghost" className="h-5 px-2 text-[11px]" onClick={() => closePopover(false)}>
                    Cancel
                  </Button>
                  <div className="flex-1" />
                  <button
                    type="button"
                    aria-label="Delete marker"
                    onClick={() => {
                      const i = pop.i;
                      setPop(null);
                      setPins((cur) => cur.filter((_, j) => j !== i));
                    }}
                    className="grid size-5 place-items-center rounded-md text-muted-foreground hover:text-red-500"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {pins.some((p) => p.text) && (
          <div className="max-h-[18vh] shrink-0 overflow-y-auto px-4 pb-1 text-xs text-muted-foreground">
            {pins.map(
              (p, i) =>
                p.text && (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (pop) closePopover(true);
                      setPop({ i, draft: p.text, isNew: false });
                    }}
                    className="mr-3 inline-flex items-center gap-1.5 py-0.5 hover:text-foreground"
                  >
                    <span
                      className={cn(
                        "grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white",
                        p.w ? "bg-emerald-600" : "bg-orange-600",
                      )}
                    >
                      {i + 1}
                    </span>
                    <span className="max-w-56 truncate">{p.text}</span>
                  </button>
                ),
            )}
          </div>
        )}

        <div className="px-4 pb-3 pt-1 text-center text-[10px] text-muted-foreground">
          Markers ride along when this ships to your agent · Esc saves
        </div>
      </div>
    </div>
  );
}
