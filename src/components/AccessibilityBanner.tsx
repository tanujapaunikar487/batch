import { RefreshCw, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export type DoubleShiftState = "needs-permission" | "needs-relaunch";

export function AccessibilityBanner({
  state,
  onGrant,
  onRelaunch,
  onDismiss,
}: {
  state: DoubleShiftState;
  onGrant: () => void;
  onRelaunch: () => void;
  onDismiss: () => void;
}) {
  const needsRelaunch = state === "needs-relaunch";
  return (
    <div className="mx-5 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1.5 text-xs text-foreground">
      {needsRelaunch ? (
        <RefreshCw className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      ) : (
        <ShieldAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      )}
      <span className="min-w-0 flex-1">
        {needsRelaunch ? "Access granted — relaunch to enable Double-Shift." : "Double-Shift needs Input Monitoring access."}
      </span>
      <Button size="xs" variant="outline" className="h-6 px-2 text-xs" onClick={needsRelaunch ? onRelaunch : onGrant}>
        {needsRelaunch ? "Relaunch" : "Grant"}
      </Button>
      <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
