import { useEffect, useRef, useState } from "react";
import { SquareArrowOutUpRight, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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

/**
 * Modal over a dimmed backdrop: the image with numbered pins. Click the
 * image to drop a pin, type a note per pin. Esc / Done / clicking outside saves and closes
 * (an empty overlay just closes). Pin coords are fractions of the image, so
 * they hold at any size; agents get them as percentages.
 */
export function PinEditor({ attachment, dir, onSave, onClose, onOpenFile }: Props) {
  const [pins, setPins] = useState<Pin[]>(attachment.pins ?? []);
  const initial = useRef(JSON.stringify(attachment.pins ?? []));
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

  useEffect(() => {
    if (focusIdx === null) rootRef.current?.focus();
    else inputs.current[focusIdx]?.focus();
  }, [focusIdx, pins.length]);

  const finish = () => {
    const cleaned = pins.map((p) => ({ ...p, text: p.text.trim() }));
    if (JSON.stringify(cleaned) !== initial.current) onSave(cleaned);
    onClose();
  };

  const addPinAt = (e: React.MouseEvent<HTMLImageElement>) => {
    if (pins.length >= MAX_PINS) return;
    const r = e.currentTarget.getBoundingClientRect();
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    setPins((cur) => [
      ...cur,
      { x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height), text: "" },
    ]);
    setFocusIdx(pins.length);
  };

  const removePin = (i: number) => {
    setPins((cur) => cur.filter((_, j) => j !== i));
    setFocusIdx(null);
  };

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
          finish();
        }
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) finish();
      }}
    >
      <div className="flex max-h-[85vh] w-full min-h-0 max-w-[520px] flex-col rounded-xl border border-border bg-background shadow-2xl">
      <div className="flex items-center gap-2 px-4 pb-1 pt-3">
        <span className="min-w-0 truncate text-sm font-medium">{attachment.name}</span>
        <span className="shrink-0 text-xs text-muted-foreground">
          {pins.length === 0 ? "click the image to add a pin" : `${pins.length} pin${pins.length === 1 ? "" : "s"}`}
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

      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden px-4 py-2">
        <div className="relative max-h-full max-w-full">
          <img
            src={attachmentSrc(attachment, dir, true)}
            alt={attachment.name}
            draggable={false}
            onClick={addPinAt}
            className="block max-h-[48vh] max-w-full cursor-crosshair select-none rounded-md border border-border/60"
          />
          {pins.map((p, i) => (
            <button
              key={i}
              type="button"
              style={{ left: `${p.x * 100}%`, top: `${p.y * 100}%` }}
              onClick={(e) => {
                e.stopPropagation();
                setFocusIdx(i);
              }}
              aria-label={`Pin ${i + 1}`}
              className="absolute grid size-5 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-orange-600 text-[11px] font-bold text-white shadow ring-1 ring-white/70"
            >
              {i + 1}
            </button>
          ))}
        </div>
      </div>

      {pins.length > 0 && (
        <div className="max-h-[30vh] overflow-y-auto px-4 pb-2">
          {pins.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <span className="grid size-4.5 shrink-0 place-items-center rounded-full bg-orange-600 text-[10px] font-bold text-white">
                {i + 1}
              </span>
              <input
                ref={(el) => {
                  inputs.current[i] = el;
                }}
                value={p.text}
                placeholder="What about this spot?"
                onChange={(e) => setPins((cur) => cur.map((q, j) => (j === i ? { ...q, text: e.target.value } : q)))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    setFocusIdx(null);
                  }
                }}
                className="h-6 min-w-0 flex-1 rounded-md border border-input bg-background/60 px-2 text-xs outline-none focus:border-ring/50"
              />
              <button
                type="button"
                onClick={() => removePin(i)}
                aria-label={`Remove pin ${i + 1}`}
                className="grid size-5 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-3 text-center text-[10px] text-muted-foreground">
        Pins ride along when this ships to Claude · Esc saves
      </div>
      </div>
    </div>
  );
}
