import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Shown when a newer release is available (from the periodic or manual check). */
export function UpdateBanner({
  version,
  installing,
  onInstall,
  onDismiss,
}: {
  version: string;
  installing: boolean;
  onInstall: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="mx-5 mb-2 flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-xs text-foreground">
      {installing ? (
        <Loader2 className="size-3.5 shrink-0 animate-spin text-sky-600 dark:text-sky-400" />
      ) : (
        <Download className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
      )}
      <span className="min-w-0 flex-1">
        {installing ? "Installing the update — Batch will restart itself…" : `Batch ${version} is ready.`}
      </span>
      {!installing && (
        <>
          <Button size="xs" variant="outline" className="h-6 px-2 text-xs" onClick={onInstall}>
            Update & Restart
          </Button>
          <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
            ×
          </button>
        </>
      )}
    </div>
  );
}
