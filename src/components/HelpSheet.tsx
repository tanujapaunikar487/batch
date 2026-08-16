import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { type ActionId, ACTIONS, formatBinding } from "@/lib/shortcuts";

interface Props {
  keymap: Record<ActionId, string>;
  toggleShortcut: string;
  doubleShift: boolean;
  onBack: () => void;
}

export function HelpSheet({ keymap, toggleShortcut, doubleShift, onBack }: Props) {
  const rows: [string, string][] = [
    ["Show / hide Batch", `${formatBinding(toggleShortcut)}${doubleShift ? "  ·  ⇧⇧" : ""}`],
    ["Add note (⇧↩ newline)", "↩"],
    ["Browse notes", "↓ ↑  ·  ⇧↓ ⇧↑ extend"],
    ["Select all", "⌘A"],
    ["Copy note / selection as list", "⌘C"],
    ["Toggle done", "Space"],
    ["Edit note", "↩  ·  double-click"],
    ["Delete", "⌫"],
    ["Priority", "1 · 2 · 3"],
    ["Switch section", "⌘1 … ⌘9"],
    ...(Object.keys(ACTIONS) as ActionId[]).map((a) => [ACTIONS[a].label, formatBinding(keymap[a])] as [string, string]),
    ["Hide window", "Esc · ⌘W"],
    ["Quit", "⌘Q"],
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-3 pb-1">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-sm font-semibold">Keyboard shortcuts</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">Esc to close</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <ul className="flex flex-col">
          {rows.map(([label, keys]) => (
            <li key={label} className="flex items-center gap-3 py-1 text-xs">
              <span className="min-w-0 flex-1 truncate">{label}</span>
              <Kbd className="shrink-0">{keys}</Kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
