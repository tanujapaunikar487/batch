import { Kbd } from "@/components/ui/kbd";
import { formatBinding } from "@/lib/shortcuts";

interface Props {
  selectedCount: number;
  toast: string | null;
  mergeBinding: string;
  totalOpen: number;
}

export function Footer({ selectedCount, toast, mergeBinding, totalOpen }: Props) {
  return (
    <footer className="flex h-7 shrink-0 items-center gap-2 border-t border-border/60 px-5 text-[11px] text-muted-foreground select-none">
      {toast ? (
        <span className="text-foreground">{toast}</span>
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
          <span className="tabular-nums">{totalOpen === 0 ? "All clear" : `${totalOpen} open`}</span>
          <span className="ml-auto flex items-center gap-1 opacity-70">
            <Kbd>↑</Kbd> browse · <Kbd>⌘/</Kbd> shortcuts
          </span>
        </>
      )}
    </footer>
  );
}
