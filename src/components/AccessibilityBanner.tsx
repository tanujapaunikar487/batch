import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export function AccessibilityBanner({ onGrant, onDismiss }: { onGrant: () => void; onDismiss: () => void }) {
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[11px] text-foreground">
      <ShieldAlert className="size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <span className="min-w-0 flex-1">Double-Shift needs Accessibility access.</span>
      <Button size="xs" variant="outline" className="h-5 px-1.5 text-[11px]" onClick={onGrant}>
        Grant
      </Button>
      <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
