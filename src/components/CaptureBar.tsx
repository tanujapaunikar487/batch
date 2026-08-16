import { forwardRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { PRIORITIES, type Priority } from "@/lib/todos";
import { PRIORITY_UI } from "@/lib/priority-ui";

interface Props {
  priority: Priority;
  onPriorityChange: (p: Priority) => void;
  /** Return true if something was added (clears the input). */
  onSubmit: (raw: string) => boolean;
  /** Called on Esc when the input is already empty. */
  onEscapeEmpty: () => void;
}

export const CaptureBar = forwardRef<HTMLInputElement, Props>(function CaptureBar(
  { priority, onPriorityChange, onSubmit, onEscapeEmpty },
  ref,
) {
  const [value, setValue] = useState("");

  const submit = () => {
    if (onSubmit(value)) setValue("");
  };

  return (
    <div className="px-3 pb-2">
      <div className="relative">
        <Input
          ref={ref}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              if (value) {
                e.preventDefault();
                setValue("");
              } else {
                onEscapeEmpty();
              }
            }
          }}
          onPaste={(e) => {
            // Multi-line paste → several items at once.
            const text = e.clipboardData.getData("text");
            if (text.includes("\n")) {
              e.preventDefault();
              if (onSubmit(value ? `${value}\n${text}` : text)) setValue("");
            }
          }}
          placeholder="What needs doing?"
          aria-label="New item"
          autoComplete="off"
          autoCorrect="on"
          spellCheck
          className="h-9 pr-8 text-sm bg-background/60 dark:bg-input/40 focus-visible:ring-2 focus-visible:ring-ring/20 focus-visible:border-ring/60"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="Add item"
          className={cn(
            "absolute right-1.5 top-1/2 -translate-y-1/2 grid size-6 place-items-center rounded-md",
            "text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-40",
          )}
        >
          <CornerDownLeft className="size-3.5" />
        </button>
      </div>

      <div className="mt-2 flex items-center justify-between">
        <ToggleGroup
          type="single"
          value={priority}
          onValueChange={(v) => v && onPriorityChange(v as Priority)}
          size="sm"
          spacing={0}
          variant="outline"
          aria-label="Priority for the next item"
          className="bg-background/40 dark:bg-input/20"
        >
          {PRIORITIES.map((p) => {
            const ui = PRIORITY_UI[p];
            return (
              <ToggleGroupItem
                key={p}
                value={p}
                aria-label={`${ui.label} priority (${ui.shortcut})`}
                className="h-6 gap-1.5 px-2 text-[11px] data-[state=on]:bg-foreground/[0.06] dark:data-[state=on]:bg-foreground/[0.1]"
              >
                <span className={cn("size-1.5 rounded-full", ui.dot)} aria-hidden />
                {ui.label}
              </ToggleGroupItem>
            );
          })}
        </ToggleGroup>
        <span className="text-[10px] text-muted-foreground/60 select-none" aria-hidden>
          ⌘1 · ⌘2 · ⌘3
        </span>
      </div>
    </div>
  );
});
