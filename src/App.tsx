import { useCallback, useEffect, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Header } from "@/components/Header";
import { CaptureBar } from "@/components/CaptureBar";
import { PrioritySection } from "@/components/PrioritySection";
import { DoneSection } from "@/components/DoneSection";
import { useTodos } from "@/store/useTodos";
import { isTauri } from "@/store/persistence";
import { native, onShown } from "@/lib/native";
import { useSystemTheme } from "@/hooks/useSystemTheme";
import { PRIORITIES, type Priority, doneTodos, groupByPriority } from "@/lib/todos";

const inTauri = isTauri();

export default function App() {
  useSystemTheme();
  const t = useTodos();
  const { flush, clearDone } = t;
  const [priority, setPriority] = useState<Priority>("medium");
  const [pinned, setPinned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const focusInput = useCallback(() => {
    // Defer so it wins over whatever the OS just focused.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  // Focus the input whenever the popover is shown / the window regains focus.
  useEffect(() => {
    focusInput();
    window.addEventListener("focus", focusInput);
    let off: (() => void) | undefined;
    onShown(focusInput).then((fn) => (off = fn));
    return () => {
      window.removeEventListener("focus", focusInput);
      off?.();
    };
  }, [focusInput]);

  // Save immediately when the window is hidden / closed.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [flush]);

  const hide = useCallback(async () => {
    await flush();
    void native.hide();
  }, [flush]);

  const quit = useCallback(async () => {
    await flush();
    void native.quit();
  }, [flush]);

  const togglePin = useCallback(() => {
    setPinned((p) => {
      void native.setPinned(!p);
      return !p;
    });
  }, []);

  // Global keys inside the window.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const meta = e.metaKey && !e.ctrlKey && !e.altKey;
      if (meta && (e.key === "1" || e.key === "2" || e.key === "3")) {
        e.preventDefault();
        setPriority(PRIORITIES[Number(e.key) - 1]);
        focusInput();
      } else if (meta && e.key.toLowerCase() === "q") {
        e.preventDefault();
        void quit();
      } else if (meta && e.key.toLowerCase() === "w") {
        e.preventDefault();
        void hide();
      } else if (meta && e.shiftKey && e.key === "Backspace") {
        e.preventDefault();
        clearDone();
      } else if (
        e.key === "Escape" &&
        !(document.activeElement instanceof HTMLInputElement) &&
        !(document.activeElement instanceof HTMLTextAreaElement)
      ) {
        void hide();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusInput, hide, quit, clearDone]);

  const groups = groupByPriority(t.todos);
  const done = doneTodos(t.todos);
  const openCount = t.todos.length - done.length;

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={
          "flex h-dvh w-dvw flex-col overflow-hidden rounded-xl text-foreground " +
          (inTauri ? "bg-background/70 dark:bg-background/55" : "bg-background")
        }
      >
        <Header
          openCount={openCount}
          doneCount={done.length}
          pinned={pinned}
          onTogglePin={togglePin}
          onClearDone={t.clearDone}
          onQuit={quit}
          isTauri={inTauri}
        />

        <CaptureBar
          ref={inputRef}
          priority={priority}
          onPriorityChange={(p) => {
            setPriority(p);
            focusInput();
          }}
          onSubmit={(raw) => t.add(raw, priority) > 0}
          onEscapeEmpty={hide}
        />

        <ScrollArea className="min-h-0 flex-1 border-t border-border/60">
          <div className="px-2 pb-3 pt-1">
            {t.loaded && t.todos.length === 0 ? (
              <EmptyState />
            ) : (
              <>
                {PRIORITIES.map((p) => (
                  <PrioritySection
                    key={p}
                    priority={p}
                    todos={groups[p]}
                    onToggle={t.toggle}
                    onCyclePriority={t.cyclePriority}
                    onUpdateText={t.updateText}
                    onRemove={t.remove}
                  />
                ))}
                <DoneSection
                  todos={done}
                  onToggle={t.toggle}
                  onCyclePriority={t.cyclePriority}
                  onUpdateText={t.updateText}
                  onRemove={t.remove}
                  onClear={t.clearDone}
                />
              </>
            )}
          </div>
        </ScrollArea>
      </div>
    </TooltipProvider>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center gap-1 px-6 pt-14 text-center select-none">
      <p className="text-sm text-muted-foreground">Nothing yet.</p>
      <p className="text-xs text-muted-foreground/70">
        Type or dictate a task above and press&nbsp;↵. Paste several lines to add them all at once.
      </p>
    </div>
  );
}
