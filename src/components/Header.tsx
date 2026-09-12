import { Filter, Pin, Search, Settings, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type ActionId, formatBinding } from "@/lib/shortcuts";

interface Props {
  searchOpen: boolean;
  query: string;
  onQuery: (q: string) => void;
  onCloseSearch: () => void;
  onArrowDownOut: () => void;
  searchRef: React.Ref<HTMLInputElement>;
  onToggleExpand: () => void;
  onToggleSearch: () => void;
  filtersOpen: boolean;
  activeFilters: number;
  onToggleFilters: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  isTauri: boolean;
  keymap: Record<ActionId, string>;
  onOpenSettings: () => void;
}

export function Header(p: Props) {
  const iconBtn = (
    label: string,
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    badge?: number,
  ) => (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onClick}
          aria-pressed={active}
          aria-label={label}
          className={cn("relative", active && "bg-foreground/[0.06] text-foreground")}
        >
          {icon}
          {badge ? (
            <span className="absolute -right-0.5 -top-0.5 grid size-3.5 place-items-center rounded-full bg-foreground text-[9px] font-semibold text-background">
              {badge}
            </span>
          ) : null}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest("button")) return;
        p.onToggleExpand();
      }}
      className="flex shrink-0 items-center gap-2 px-5 pb-3 pt-3 select-none"
    >
      <Logo className="size-4 text-foreground" data-tauri-drag-region />
      <span className="text-sm font-semibold tracking-tight" data-tauri-drag-region>
        Batch
      </span>

      <div className="ml-auto flex min-w-0 flex-1 items-center justify-end gap-0.5">
        {p.searchOpen ? (
          <InputGroup className="h-7 min-w-16 max-w-60 flex-1 bg-background/60 has-[[data-slot=input-group-control]:focus-visible]:ring-ring/15 dark:bg-input/40">
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput
              ref={p.searchRef}
              value={p.query}
              onChange={(e) => p.onQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  e.preventDefault();
                  e.stopPropagation();
                  if (p.query) p.onQuery("");
                  else p.onCloseSearch();
                } else if (e.key === "ArrowDown") {
                  e.preventDefault();
                  p.onArrowDownOut();
                }
              }}
              placeholder="Search all folders…"
              aria-label="Search"
              autoComplete="off"
              className="text-sm"
            />
            <InputGroupAddon align="inline-end">
              <InputGroupButton size="icon-xs" onClick={p.onCloseSearch} aria-label="Close search">
                <X />
              </InputGroupButton>
            </InputGroupAddon>
          </InputGroup>
        ) : (
          iconBtn(
            `Search  ${formatBinding(p.keymap.search)}`,
            false,
            p.onToggleSearch,
            <Search className="size-4 text-muted-foreground" />,
          )
        )}
        {iconBtn(
          `Filters  ${formatBinding(p.keymap.filters)}`,
          p.filtersOpen,
          p.onToggleFilters,
          <Filter className="size-4 text-muted-foreground" />,
          p.activeFilters,
        )}
        {p.isTauri &&
          iconBtn(
            p.pinned ? "Pinned — stays open" : `Pin window  ${formatBinding(p.keymap.pin)}`,
            p.pinned,
            p.onTogglePin,
            <Pin className={cn("size-4", p.pinned ? "fill-current" : "text-muted-foreground")} />,
          )}
        {iconBtn(
          `Settings  ${formatBinding(p.keymap.settings)}`,
          false,
          p.onOpenSettings,
          <Settings className="size-4 text-muted-foreground" />,
        )}
      </div>
    </header>
  );
}
