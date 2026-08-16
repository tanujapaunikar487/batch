import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { type Filter, EMPTY_FILTER } from "@/lib/filters";
import { PRIORITIES, type Priority } from "@/lib/notes";
import { PRIORITY_UI } from "@/lib/priority-ui";

interface Props {
  searchOpen: boolean;
  query: string;
  onQuery: (q: string) => void;
  onCloseSearch: () => void;
  onArrowDownOut: () => void;
  filtersOpen: boolean;
  filter: Filter;
  onFilter: (f: Filter) => void;
}

export const SearchAndFilters = forwardRef<HTMLInputElement, Props>(function SearchAndFilters(
  { searchOpen, query, onQuery, onCloseSearch, onArrowDownOut, filtersOpen, filter, onFilter },
  ref,
) {
  if (!searchOpen && !filtersOpen) return null;
  return (
    <div className="flex flex-col gap-1.5 px-3 pb-2">
      {searchOpen && (
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={ref}
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                e.preventDefault();
                e.stopPropagation();
                if (query) onQuery("");
                else onCloseSearch();
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                onArrowDownOut();
              }
            }}
            placeholder="Search all sections…"
            aria-label="Search"
            autoComplete="off"
            className="h-7 w-full rounded-md border border-input bg-background/60 pl-8 pr-7 text-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring/60 dark:bg-input/40"
          />
          <button
            type="button"
            onClick={onCloseSearch}
            aria-label="Close search"
            className="absolute right-1 top-1/2 grid size-5 -translate-y-1/2 place-items-center rounded text-muted-foreground hover:text-foreground"
          >
            <X className="size-3" />
          </button>
        </div>
      )}
      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <ChipGroup
            label="Status"
            value={filter.status}
            options={[
              ["all", "All"],
              ["open", "Open"],
              ["done", "Done"],
            ]}
            onChange={(v) => onFilter({ ...filter, status: v as Filter["status"] })}
          />
          <ChipGroup
            label="Priority"
            value={filter.priority ?? "any"}
            options={[["any", "Any"], ...PRIORITIES.map((p) => [p, PRIORITY_UI[p].label] as [string, string])]}
            dots={Object.fromEntries(PRIORITIES.map((p) => [p, PRIORITY_UI[p].dot]))}
            onChange={(v) => onFilter({ ...filter, priority: v === "any" ? undefined : (v as Priority) })}
          />
          <ChipGroup
            label="Type"
            value={filter.kind ?? "any"}
            options={[
              ["any", "Any"],
              ["link", "Links"],
              ["code", "Code"],
              ["text", "Text"],
            ]}
            onChange={(v) => onFilter({ ...filter, kind: v === "any" ? undefined : (v as Filter["kind"]) })}
          />
          <ChipGroup
            label="When"
            value={filter.when ?? "any"}
            options={[
              ["any", "Any"],
              ["today", "Today"],
              ["week", "7 days"],
            ]}
            onChange={(v) => onFilter({ ...filter, when: v === "any" ? undefined : (v as Filter["when"]) })}
          />
          {(filter.status !== "all" || filter.priority || filter.kind || filter.when) && (
            <button
              type="button"
              onClick={() => onFilter(EMPTY_FILTER)}
              className="ml-auto text-[11px] text-muted-foreground underline-offset-2 hover:underline"
            >
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
});

function ChipGroup({
  label,
  value,
  options,
  dots,
  onChange,
}: {
  label: string;
  value: string;
  options: [string, string][];
  dots?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label={label}>
      <span className="mr-0.5 text-[10px] uppercase tracking-wider text-muted-foreground/70">{label}</span>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={value === v}
          onClick={() => onChange(v)}
          className={cn(
            "flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px] transition-colors",
            value === v
              ? "border-foreground/20 bg-foreground/[0.08] text-foreground"
              : "border-transparent text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground",
          )}
        >
          {dots?.[v] && <span className={cn("size-1.5 rounded-full", dots[v])} />}
          {text}
        </button>
      ))}
    </div>
  );
}
