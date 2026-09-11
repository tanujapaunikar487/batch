import { Check, Filter, Focus, List, Monitor, Moon, MoreHorizontal, Pin, Search, Sun, X } from "lucide-react";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from "@/components/ui/input-group";
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
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { type ActionId, formatBinding } from "@/lib/shortcuts";

interface Props {
  searchOpen: boolean;
  query: string;
  onQuery: (q: string) => void;
  onCloseSearch: () => void;
  onArrowDownOut: () => void;
  searchRef: React.Ref<HTMLInputElement>;
  expanded: boolean;
  onToggleExpand: () => void;
  onToggleSearch: () => void;
  filtersOpen: boolean;
  activeFilters: number;
  onToggleFilters: () => void;
  viewMode: "folders" | "clear";
  onToggleView: () => void;
  pinned: boolean;
  onTogglePin: () => void;
  isTauri: boolean;
  keymap: Record<ActionId, string>;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;

  onCopySectionAsList: () => void;
  onCopyFolderForAgent: () => void;
  onEditPreamble: () => void;
  onClearDone: () => void;
  onRevealFile: () => void;
  onResetPosition: () => void;
  onExport: (what: "folder-md" | "all-md" | "json" | "folder-bundle" | "all-bundle") => void;
  onImport: () => void;
  backups: { name: string; path: string; bytes: number; date: string }[];
  onOpenBackups: () => void;
  onRestoreBackup: (b: { path: string; date: string }) => void;
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
        <ToggleGroup
          type="single"
          spacing={0}
          value={p.viewMode}
          onValueChange={(v) => {
            if (v && v !== p.viewMode) p.onToggleView();
          }}
          aria-label={`View  ${formatBinding(p.keymap.toggleView)}`}
          title={`Switch view  ${formatBinding(p.keymap.toggleView)}`}
          className="mr-1 h-7 shrink-0 items-center gap-0 rounded-lg bg-foreground/[0.06] p-0.5"
        >
          <ToggleGroupItem
            value="folders"
            aria-label="List view — every note in order"
            className="h-6 min-w-0 gap-1.5 rounded-md border-0 px-2 text-xs font-medium text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
          >
            <List /> List
          </ToggleGroupItem>
          <ToggleGroupItem
            value="clear"
            aria-label="Focus view — grouped by what needs you"
            className="h-6 min-w-0 gap-1.5 rounded-md border-0 px-2 text-xs font-medium text-muted-foreground [&_svg:not([class*='size-'])]:size-3.5 data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
          >
            <Focus /> Focus
          </ToggleGroupItem>
        </ToggleGroup>
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
              <>
                <DropdownMenuItem onSelect={p.onToggleExpand}>
                  {p.expanded ? "Restore size" : "Expand (side panel)"}
                  <DropdownMenuShortcut>{formatBinding(p.keymap.expand)}</DropdownMenuShortcut>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={p.onResetPosition}>Snap under menu-bar icon</DropdownMenuItem>
              </>
            )}
            <DropdownMenuItem onSelect={p.onCopyFolderForAgent}>
              Ship folder to your agent
              <DropdownMenuShortcut>{formatBinding(p.keymap.copyForAgent)}</DropdownMenuShortcut>
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={p.onEditPreamble}>Agent instructions for this folder…</DropdownMenuItem>
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
            {p.isTauri && (
              <>
                <DropdownMenuSub>
                  <DropdownMenuSubTrigger>Export</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent>
                    <DropdownMenuItem onSelect={() => p.onExport("folder-md")}>This folder as Markdown…</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => p.onExport("folder-bundle")}>This folder as Markdown + images…</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onSelect={() => p.onExport("all-md")}>Everything as Markdown…</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => p.onExport("all-bundle")}>Everything as Markdown + images…</DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => p.onExport("json")}>Everything as JSON (backup)…</DropdownMenuItem>
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onSelect={p.onImport}>Import JSON…</DropdownMenuItem>
                <DropdownMenuSub onOpenChange={(o) => o && p.onOpenBackups()}>
                  <DropdownMenuSubTrigger>Restore backup</DropdownMenuSubTrigger>
                  <DropdownMenuSubContent className="min-w-48">
                    {p.backups.length === 0 ? (
                      <DropdownMenuItem disabled>No backups yet (one is kept per day)</DropdownMenuItem>
                    ) : (
                      p.backups.map((b) => (
                        <DropdownMenuItem key={b.name} onSelect={() => p.onRestoreBackup(b)}>
                          {b.date}
                          <DropdownMenuShortcut>{Math.max(1, Math.round(b.bytes / 1024))} KB</DropdownMenuShortcut>
                        </DropdownMenuItem>
                      ))
                    )}
                  </DropdownMenuSubContent>
                </DropdownMenuSub>
                <DropdownMenuItem onSelect={p.onRevealFile}>Reveal notes file in Finder</DropdownMenuItem>
              </>
            )}
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
