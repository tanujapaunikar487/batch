import { forwardRef } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Filter, EMPTY_FILTER, isFilterActive } from "@/lib/filters";
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
    <div className="flex flex-col gap-2 px-5 pb-3">
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
            placeholder="Search all folders…"
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
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterSelect
            label="Status"
            value={filter.status}
            options={[
              ["all", "All"],
              ["open", "Open"],
              ["done", "Done"],
            ]}
            onChange={(v) => onFilter({ ...filter, status: v as Filter["status"] })}
          />
          <FilterSelect
            label="Priority"
            value={filter.priority ?? "any"}
            options={[["any", "Any"], ...PRIORITIES.map((p) => [p, PRIORITY_UI[p].label] as [string, string])]}
            dots={Object.fromEntries(PRIORITIES.map((p) => [p, PRIORITY_UI[p].dot]))}
            onChange={(v) => onFilter({ ...filter, priority: v === "any" ? undefined : (v as Priority) })}
          />
          <FilterSelect
            label="Type"
            value={filter.kind ?? "any"}
            options={[
              ["any", "Any"],
              ["image", "Images"],
              ["link", "Links"],
              ["code", "Code"],
              ["text", "Text"],
            ]}
            onChange={(v) => onFilter({ ...filter, kind: v === "any" ? undefined : (v as Filter["kind"]) })}
          />
          <FilterSelect
            label="When"
            value={filter.when ?? "any"}
            options={[
              ["any", "Any"],
              ["today", "Today"],
              ["week", "7 days"],
            ]}
            onChange={(v) => onFilter({ ...filter, when: v === "any" ? undefined : (v as Filter["when"]) })}
          />
          {isFilterActive(filter) && (
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

function FilterSelect({
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
  const current = options.find(([v]) => v === value)?.[1] ?? value;
  const active = value !== options[0][0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${current}`}
          className={cn(
            "flex h-7 items-center gap-1 rounded-md border px-2 text-xs transition-colors",
            active
              ? "border-foreground/25 bg-foreground/[0.06] text-foreground"
              : "border-input bg-background/60 text-muted-foreground hover:text-foreground dark:bg-input/40",
          )}
        >
          <span className="text-[10px] uppercase tracking-wider opacity-70">{label}</span>
          {dots?.[value] && <span className={cn("size-1.5 rounded-full", dots[value])} />}
          <span className={cn(active && "font-medium")}>{current}</span>
          <ChevronDown className="size-3 opacity-60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-36">
        <DropdownMenuRadioGroup value={value} onValueChange={onChange}>
          {options.map(([v, text]) => (
            <DropdownMenuRadioItem key={v} value={v}>
              {dots?.[v] && <span className={cn("mr-1 size-1.5 rounded-full", dots[v])} />}
              {text}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
