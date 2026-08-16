import { useState } from "react";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type Todo } from "@/lib/todos";
import { TodoItem } from "./TodoItem";

interface Props {
  todos: Todo[];
  onToggle: (id: string) => void;
  onCyclePriority: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
}

export function DoneSection({ todos, onClear, ...handlers }: Props) {
  const [open, setOpen] = useState(false);
  if (todos.length === 0) return null;
  return (
    <section aria-label="Done" className="mt-1 border-t border-border/60 pt-1">
      <header className="flex items-center px-1 py-1 select-none">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          className="flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
        >
          <ChevronRight
            className={cn("size-3 transition-transform", open && "rotate-90")}
            aria-hidden
          />
          Done
          <span className="ml-1 font-normal tabular-nums text-muted-foreground/70">
            {todos.length}
          </span>
        </button>
        <Button
          variant="ghost"
          size="xs"
          onClick={onClear}
          className="ml-auto h-6 text-[11px] text-muted-foreground"
        >
          Clear
        </Button>
      </header>
      {open && (
        <ul className="flex flex-col">
          {todos.map((t) => (
            <TodoItem key={t.id} todo={t} {...handlers} />
          ))}
        </ul>
      )}
    </section>
  );
}
