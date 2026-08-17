import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  kind: "corrupt" | "save-error";
  detail: string;
  onReveal: () => void;
  onStartFresh?: () => void;
  onRetry?: () => void;
}

/** Shown when notes.json can't be read (saving paused) or a save failed. */
export function DataBanner({ kind, detail, onReveal, onStartFresh, onRetry }: Props) {
  return (
    <div className="mx-5 mb-2 flex items-start gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-1.5 text-[11px] text-foreground">
      <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-red-600 dark:text-red-400" />
      <div className="min-w-0 flex-1">
        {kind === "corrupt" ? (
          <>
            <div className="font-medium">notes.json couldn't be read — saving is paused.</div>
            <div className="text-muted-foreground">
              {detail}. Your file is untouched. Fix it, or start fresh (the old file is kept as notes.corrupt-….json).
            </div>
          </>
        ) : (
          <>
            <div className="font-medium">Couldn't save your notes.</div>
            <div className="text-muted-foreground">{detail}</div>
          </>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {kind === "save-error" && onRetry && (
          <Button size="xs" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={onRetry}>
            Retry
          </Button>
        )}
        <Button size="xs" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={onReveal}>
          Reveal
        </Button>
        {kind === "corrupt" && onStartFresh && (
          <Button size="xs" variant="destructive" className="h-5 px-1.5 text-[11px]" onClick={onStartFresh}>
            Start fresh
          </Button>
        )}
      </div>
    </div>
  );
}
