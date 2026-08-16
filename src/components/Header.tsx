import { ListChecks, ListFilter, MoreHorizontal, Pin, PinOff, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type ActionId, formatBinding } from "@/lib/shortcuts";

interface Props {
  subtitle: string;
  searchOpen: boolean;
  onToggleSearch: () => void;
  filtersOpen: boolean;
  activeFilters: number;
  onToggleFilters: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  isTauri: boolean;
  keymap: Record<ActionId, string>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopySectionAsList: () => void;
  onClearDone: () => void;
  onRevealFile: () => void;
  onOpenSettings: () => void;
  onOpenHelp: () => void;
  onQuit: () => void;
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
    <header data-tauri-drag-region className="flex h-11 shrink-0 items-center gap-2 px-3 select-none">
      <ListChecks className="size-4 text-muted-foreground" aria-hidden data-tauri-drag-region />
      <span className="text-sm font-semibold tracking-tight" data-tauri-drag-region>
        Batch
      </span>
      <span className="truncate text-xs text-muted-foreground tabular-nums" data-tauri-drag-region>
        {p.subtitle}
      </span>

      <div className="ml-auto flex items-center gap-0.5">
        {iconBtn(
          `Search  ${formatBinding(p.keymap.search)}`,
          p.searchOpen,
          p.onToggleSearch,
          <Search className="size-4 text-muted-foreground" />,
        )}
        {iconBtn(
          `Filters  ${formatBinding(p.keymap.filters)}`,
          p.filtersOpen,
          p.onToggleFilters,
          <ListFilter className="size-4 text-muted-foreground" />,
          p.activeFilters,
        )}
        {p.isTauri &&
          iconBtn(
            p.pinned ? "Pinned — stays open" : `Pin window  ${formatBinding(p.keymap.pin)}`,
            p.pinned,
            p.onTogglePin,
            p.pinned ? <Pin className="size-4" /> : <PinOff className="size-4 text-muted-foreground" />,
          )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-52">
            <DropdownMenuItem onSelect={p.onUndo} disabled={!p.canUndo}>
              Undo <DropdownMenuShortcut>{formatBinding(p.keymap.undo)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onRedo} disabled={!p.canRedo}>
              Redo <DropdownMenuShortcut>{formatBinding(p.keymap.redo)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={p.onCopySectionAsList}>
              Copy section as list
              <DropdownMenuShortcut>{formatBinding(p.keymap.copySectionAsList)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onClearDone}>
              Clear done in section
              <DropdownMenuShortcut>{formatBinding(p.keymap.clearDone)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {p.isTauri && <DropdownMenuItem onSelect={p.onRevealFile}>Reveal notes file in Finder</DropdownMenuItem>}
            <DropdownMenuItem onSelect={p.onOpenSettings}>
              Settings <DropdownMenuShortcut>{formatBinding(p.keymap.settings)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onOpenHelp}>
              Keyboard shortcuts <DropdownMenuShortcut>{formatBinding(p.keymap.help)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            {p.isTauri && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={p.onQuit} variant="destructive">
                  Quit Batch <DropdownMenuShortcut>⌘Q</DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
