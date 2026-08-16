import { Check, ListFilter, Maximize2, Minimize2, Monitor, Moon, MoreHorizontal, Pin, Search, Sun } from "lucide-react";
import { Logo } from "./Logo";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { type ThemePref } from "@/store/useSettings";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type ActionId, formatBinding } from "@/lib/shortcuts";

interface Props {
  searchOpen: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
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
  onRenameFolder: () => void;
  onCopySectionAsList: () => void;
  onClearDone: () => void;
  onRevealFile: () => void;
  theme: ThemePref;
  onTheme: (t: ThemePref) => void;
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
            p.expanded ? `Restore size  ${formatBinding(p.keymap.expand)}` : `Full screen  ${formatBinding(p.keymap.expand)}`,
            p.expanded,
            p.onToggleExpand,
            p.expanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4 text-muted-foreground" />,
          )}
        {p.isTauri &&
          iconBtn(
            p.pinned ? "Pinned — stays open" : `Pin window  ${formatBinding(p.keymap.pin)}`,
            p.pinned,
            p.onTogglePin,
            <Pin className={cn("size-4", p.pinned ? "fill-current" : "text-muted-foreground")} />,
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
            {p.isTauri && (
              <DropdownMenuItem onSelect={p.onToggleExpand}>
                {p.expanded ? "Restore size" : "Full screen"}
                <DropdownMenuShortcut>{formatBinding(p.keymap.expand)}</DropdownMenuShortcut>
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={p.onRenameFolder}>Rename folder</DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onCopySectionAsList}>
              Copy folder as list
              <DropdownMenuShortcut>{formatBinding(p.keymap.copySectionAsList)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onClearDone}>
              Clear done in folder
              <DropdownMenuShortcut>{formatBinding(p.keymap.clearDone)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Appearance</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {(
                  [
                    ["system", "System", <Monitor key="s" />],
                    ["light", "Light", <Sun key="l" />],
                    ["dark", "Dark", <Moon key="d" />],
                  ] as [ThemePref, string, React.ReactNode][]
                ).map(([v, label, icon]) => (
                  <DropdownMenuItem key={v} onSelect={() => p.onTheme(v)}>
                    {icon} {label}
                    {p.theme === v && <Check className="ml-auto size-3.5" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
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
