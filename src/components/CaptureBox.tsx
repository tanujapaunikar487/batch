import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { CornerDownLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  placeholder: string;
  /** Return true when the text was accepted (clears the box). */
  onSubmit: (text: string) => boolean;
  /** Esc when empty. */
  onEscapeEmpty: () => void;
  /** ↓ on the last line — hand focus to the list. */
  onArrowDownOut: () => void;
}

export interface CaptureBoxHandle {
  focus: () => void;
  isEmpty: () => boolean;
  clear: () => void;
}

const MAX_ROWS = 6;

export const CaptureBox = forwardRef<CaptureBoxHandle, Props>(function CaptureBox(
  { placeholder, onSubmit, onEscapeEmpty, onArrowDownOut },
  ref,
) {
  const [value, setValue] = useState("");
  const ta = useRef<HTMLTextAreaElement>(null);

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    isEmpty: () => value.trim().length === 0,
    clear: () => setValue(""),
  }));

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    const line = 20;
    const max = MAX_ROWS * line + 16;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const submit = () => {
    if (onSubmit(value)) setValue("");
  };

  return (
    <div className="px-3 pb-2">
      <div className="relative">
        <textarea
          ref={ta}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") {
              if (value) {
                e.preventDefault();
                e.stopPropagation();
                setValue("");
              } else {
                onEscapeEmpty();
              }
            } else if (e.key === "ArrowDown" && !e.metaKey && !e.altKey) {
              const el = e.currentTarget;
              const afterCaret = el.value.slice(el.selectionEnd);
              if (!afterCaret.includes("\n")) {
                e.preventDefault();
                onArrowDownOut();
              }
            }
          }}
          rows={1}
          placeholder={placeholder}
          aria-label="Capture"
          autoComplete="off"
          spellCheck
          className={cn(
            "block w-full resize-none rounded-lg border border-input bg-background/60 px-2.5 py-2 pr-8 text-sm leading-5",
            "outline-none transition-colors placeholder:text-muted-foreground",
            "focus-visible:border-ring/50 focus-visible:ring-[3px] focus-visible:ring-ring/10 dark:bg-input/40",
          )}
        />
        <button
          type="button"
          onClick={submit}
          disabled={!value.trim()}
          aria-label="Add note"
          className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-40"
        >
          <CornerDownLeft className="size-3.5" />
        </button>
      </div>
    </div>
  );
});
