import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { type Filter, EMPTY_FILTER, isFilterActive } from "@/lib/filters";

interface Props {
  filtersOpen: boolean;
  filter: Filter;
  onFilter: (f: Filter) => void;
}

/** The filter chips row; the search input itself lives in the Header now. */
export function SearchAndFilters({ filtersOpen, filter, onFilter }: Props) {
  if (!filtersOpen) return null;
  return (
    <div className="flex shrink-0 flex-col gap-2 px-5 pb-3">
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
            value={filter.priority === "high" ? "high" : "any"}
            options={[
              ["any", "Any"],
              ["high", "★ Starred"],
            ]}
            onChange={(v) => onFilter({ ...filter, priority: v === "high" ? "high" : undefined })}
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
}

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
