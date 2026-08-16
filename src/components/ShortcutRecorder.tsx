import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/utils";
import { bindingFromEvent, formatBinding } from "@/lib/shortcuts";

interface Props {
  value: string;
  defaultValue?: string;
  /** Return an error string to reject (e.g. duplicate), or null to accept. */
  onChange: (binding: string) => string | null | Promise<string | null>;
  onReset?: () => void;
  /** Require at least one modifier (for system-wide hotkeys). */
  requireModifier?: boolean;
}

export function ShortcutRecorder({ value, defaultValue, onChange, onReset, requireModifier }: Props) {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!recording) return;
    const onKey = async (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setRecording(false);
        return;
      }
      const b = bindingFromEvent(e);
      if (!b) return; // bare modifier — keep waiting
      if (requireModifier && !/^(mod|ctrl|alt)\+/.test(b) && !/^F\d+$/.test(b.split("+").pop()!)) {
        setError("Add ⌘, ⌥ or ⌃");
        return;
      }
      const err = await onChange(b);
      if (err) {
        setError(err);
        return;
      }
      setError(null);
      setRecording(false);
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [recording, onChange, requireModifier]);

  useEffect(() => {
    if (!recording) return;
    const stop = () => setRecording(false);
    // Clicking anywhere else cancels.
    const onDown = (e: MouseEvent) => {
      if (!btn.current?.contains(e.target as Node)) stop();
    };
    window.addEventListener("mousedown", onDown, true);
    return () => window.removeEventListener("mousedown", onDown, true);
  }, [recording]);

  return (
    <div className="flex items-center gap-1.5">
      <button
        ref={btn}
        type="button"
        onClick={() => {
          setError(null);
          setRecording((r) => !r);
        }}
        aria-label={recording ? "Recording — press keys" : `Shortcut ${formatBinding(value)}; click to change`}
        className={cn(
          "flex h-6 min-w-16 items-center justify-center rounded-md border px-2 text-xs transition-colors",
          recording
            ? "border-ring bg-ring/10 text-foreground ring-2 ring-ring/30"
            : "border-input bg-background/60 hover:bg-foreground/[0.05] dark:bg-input/40",
        )}
      >
        {recording ? (
          <span className="animate-pulse text-muted-foreground">{error ?? "Press keys…"}</span>
        ) : (
          <Kbd className="bg-transparent px-0 text-foreground">{formatBinding(value)}</Kbd>
        )}
      </button>
      {onReset && defaultValue && value !== defaultValue && (
        <button
          type="button"
          onClick={onReset}
          aria-label="Reset to default"
          title={`Reset to ${formatBinding(defaultValue)}`}
          className="grid size-5 place-items-center rounded text-muted-foreground hover:text-foreground"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </div>
  );
}
