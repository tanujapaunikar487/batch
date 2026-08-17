import { Kbd } from "@/components/ui/kbd";
import { formatBinding } from "@/lib/shortcuts";

interface Props {
  selectedCount: number;
  toast: string | null;
  mergeBinding: string;
  /** Progress for what's on screen (current folder, or search results). */
  done: number;
  total: number;
}

function Ring({ done, total }: { done: number; total: number }) {
  const r = 5.5;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? done / total : 0;
  return (
    <svg viewBox="0 0 14 14" className="size-3.5 shrink-0" aria-hidden>
      <circle cx="7" cy="7" r={r} fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <circle
        cx="7"
        cy="7"
        r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${c * frac} ${c}`}
        transform="rotate(-90 7 7)"
        className="transition-[stroke-dasharray] duration-300"
      />
    </svg>
  );
}

export function Footer({ selectedCount, toast, mergeBinding, done, total }: Props) {
  const left = total - done;
  return (
    <footer className="flex h-8 shrink-0 items-center gap-2 border-t border-border/60 px-5 text-xs text-muted-foreground select-none">
      {toast ? (
        <span role="status" aria-live="polite" className="text-foreground">{toast}</span>
      ) : selectedCount > 0 ? (
        <>
          <span className="tabular-nums text-foreground">{selectedCount} selected</span>
          <span className="flex items-center gap-1">
            <Kbd>⌘C</Kbd> copy{selectedCount > 1 ? " as list" : ""}
          </span>
          {selectedCount > 1 && (
            <span className="flex items-center gap-1">
              <Kbd>{formatBinding(mergeBinding)}</Kbd> merge
            </span>
          )}
          <span className="flex items-center gap-1">
            <Kbd>⌫</Kbd> delete
          </span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5 tabular-nums" title={total ? `${left} left in this folder` : undefined}>
            <Ring done={done} total={total} />
            {total === 0 ? (
              <span>Nothing here yet</span>
            ) : left === 0 ? (
              <span className="text-foreground">All done ✓</span>
            ) : (
              <>
                <span className="text-foreground">
                  {done}/{total}
                </span>
                <span>done · {left} left</span>
              </>
            )}
          </span>
          <span className="ml-auto flex items-center gap-1 opacity-70">
            <Kbd>↑</Kbd> browse · <Kbd>⌘/</Kbd> shortcuts
          </span>
        </>
      )}
    </footer>
  );
}
