import { Bot } from "lucide-react";
import { Button } from "@/components/ui/button";

/** One-time, dismissible nudge shown after a person's first hand-off, pointing at MCP setup. */
export function AgentNudgeBanner({ onOpenSettings, onDismiss }: { onOpenSettings: () => void; onDismiss: () => void }) {
  return (
    <div className="mx-5 mb-2 flex items-center gap-2 rounded-md border border-sky-500/30 bg-sky-500/10 px-2 py-1.5 text-xs text-foreground">
      <Bot className="size-3.5 shrink-0 text-sky-600 dark:text-sky-400" />
      <span className="min-w-0 flex-1">Want Claude Code, Cursor, or Codex to do this automatically? Connect it in Settings.</span>
      <Button size="xs" variant="outline" className="h-6 px-2 text-xs" onClick={onOpenSettings}>
        Open Settings
      </Button>
      <button type="button" onClick={onDismiss} className="text-muted-foreground hover:text-foreground" aria-label="Dismiss">
        ×
      </button>
    </div>
  );
}
