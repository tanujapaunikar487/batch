import { ListChecks, MoreHorizontal, Pin, PinOff } from "lucide-react";
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

interface Props {
  openCount: number;
  pinned: boolean;
  onTogglePin: () => void;
  onClearDone: () => void;
  doneCount: number;
  onQuit: () => void;
  isTauri: boolean;
}

export function Header({ openCount, pinned, onTogglePin, onClearDone, doneCount, onQuit, isTauri }: Props) {
  return (
    <header
      data-tauri-drag-region
      className="flex h-11 shrink-0 items-center gap-2 px-3 select-none"
    >
      <ListChecks className="size-4 text-muted-foreground" aria-hidden data-tauri-drag-region />
      <span className="text-sm font-semibold tracking-tight" data-tauri-drag-region>
        Batch
      </span>
      <span className="text-xs text-muted-foreground tabular-nums" data-tauri-drag-region>
        {openCount === 0 ? "all clear" : `${openCount} open`}
      </span>

      <div className="ml-auto flex items-center gap-0.5">
        {isTauri && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onTogglePin}
                aria-pressed={pinned}
                aria-label={pinned ? "Unpin (hide when it loses focus)" : "Pin (keep open)"}
                className={cn(pinned && "bg-foreground/[0.06] text-foreground")}
              >
                {pinned ? <Pin className="size-4" /> : <PinOff className="size-4 text-muted-foreground" />}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{pinned ? "Pinned — stays open" : "Pin window"}</TooltipContent>
          </Tooltip>
        )}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="More">
              <MoreHorizontal className="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-44">
            <DropdownMenuItem onSelect={onClearDone} disabled={doneCount === 0}>
              Clear done
              <DropdownMenuShortcut>{doneCount > 0 ? doneCount : ""}</DropdownMenuShortcut>
            </DropdownMenuItem>
            {isTauri && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onQuit} variant="destructive">
                  Quit Batch
                  <DropdownMenuShortcut>⌘Q</DropdownMenuShortcut>
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
