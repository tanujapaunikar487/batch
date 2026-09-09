import { MapPin, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Attachment } from "@/lib/notes";
import { attachmentSrc } from "@/store/attachments";

interface Props {
  attachments: Attachment[];
  dir: string;
  size?: "sm" | "md";
  onRemove?: (id: string) => void;
  onOpen?: (a: Attachment) => void;
  onDragStart?: (e: React.DragEvent, a: Attachment) => void;
  className?: string;
}

/** Row of image thumbnails, used both in the capture box (removable) and on notes. */
export function AttachmentStrip({ attachments, dir, size = "md", onRemove, onOpen, onDragStart, className }: Props) {
  if (attachments.length === 0) return null;
  const box = size === "sm" ? "size-12" : "size-16";
  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {attachments.map((a) => (
        <div
          key={a.id}
          className={cn("group/att relative shrink-0 overflow-hidden rounded-md border border-border/60 bg-foreground/[0.04]", box)}
          title={a.name}
        >
          <img
            src={attachmentSrc(a, dir)}
            alt={a.name}
            draggable={!!onDragStart}
            onDragStart={onDragStart ? (e) => onDragStart(e, a) : undefined}
            onClick={onOpen ? () => onOpen(a) : undefined}
            className={cn("size-full object-cover", onOpen && "cursor-zoom-in")}
            loading="lazy"
          />
          {(a.pins?.length ?? 0) > 0 && (
            <span
              aria-label={`${a.pins!.length} pins`}
              className="absolute bottom-0.5 left-0.5 flex h-3.5 items-center gap-px rounded-full bg-orange-600/95 pl-0.5 pr-1 text-[9px] font-semibold text-white shadow-sm"
            >
              <MapPin className="size-2" />
              {a.pins!.length}
            </span>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={() => onRemove(a.id)}
              aria-label={`Remove ${a.name}`}
              className="absolute right-0.5 top-0.5 grid size-4 place-items-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity group-hover/att:opacity-100"
            >
              <X className="size-2.5" />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
