import { forwardRef } from "react";
import { Search, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
    <div className="flex shrink-0 flex-col gap-2 px-5 pb-3">
      {searchOpen && (
        <InputGroup className="h-8 bg-background/60 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15 dark:bg-input/40">
          <InputGroupAddon>
            <Search />
          </InputGroupAddon>
          <InputGroupInput
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
            className="text-sm"
          />
          <InputGroupAddon align="inline-end">
            <InputGroupButton size="icon-xs" onClick={onCloseSearch} aria-label="Close search">
              <X />
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      )}
      {filtersOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          <FilterSelect
            value={filter.status}
            options={[
              ["all", "All Status"],
              ["open", "Open"],
              ["done", "Done"],
            ]}
            onChange={(v) => onFilter({ ...filter, status: v as Filter["status"] })}
          />
          <FilterSelect
            value={filter.priority ?? "any"}
            options={[["any", "Any Priority"], ...PRIORITIES.map((p) => [p, PRIORITY_UI[p].label] as [string, string])]}
            dots={Object.fromEntries(PRIORITIES.map((p) => [p, PRIORITY_UI[p].dot]))}
            onChange={(v) => onFilter({ ...filter, priority: v === "any" ? undefined : (v as Priority) })}
          />
          <FilterSelect
            value={filter.kind ?? "any"}
            options={[
              ["any", "Any Type"],
              ["image", "Images"],
              ["link", "Links"],
              ["code", "Code"],
              ["text", "Text"],
            ]}
            onChange={(v) => onFilter({ ...filter, kind: v === "any" ? undefined : (v as Filter["kind"]) })}
          />
          <FilterSelect
            value={filter.when ?? "any"}
            options={[
              ["any", "Any Time"],
              ["today", "Today"],
              ["week", "Last 7 days"],
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
  value,
  options,
  dots,
  onChange,
}: {
  value: string;
  options: [string, string][];
  dots?: Record<string, string>;
  onChange: (v: string) => void;
}) {
  const active = value !== options[0][0];
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger
        size="sm"
        aria-label={options[0][1]}
        className={cn(
          "h-7 w-auto gap-1 bg-background/60 px-2 text-xs dark:bg-input/40",
          active && "border-foreground/25 bg-foreground/[0.06] font-medium text-foreground",
        )}
      >
        {dots?.[value] && <span className={cn("size-1.5 rounded-full", dots[value])} />}
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="start" className="min-w-36">
        {options.map(([v, text]) => (
          <SelectItem key={v} value={v}>
            {dots?.[v] && <span className={cn("mr-1 inline-block size-1.5 rounded-full", dots[v])} />}
            {text}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
