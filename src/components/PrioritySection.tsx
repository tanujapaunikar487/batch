import { type Priority, type Todo } from "@/lib/todos";
import { PRIORITY_UI } from "@/lib/priority-ui";
import { cn } from "@/lib/utils";
import { TodoItem } from "./TodoItem";

interface Props {
  priority: Priority;
  todos: Todo[];
  onToggle: (id: string) => void;
  onCyclePriority: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}

export function PrioritySection({ priority, todos, ...handlers }: Props) {
  if (todos.length === 0) return null;
  const ui = PRIORITY_UI[priority];
  return (
    <section aria-label={`${ui.label} priority`} className="mb-2">
      <header className="flex items-center gap-1.5 px-2 pt-2 pb-1 select-none">
        <span className={cn("size-1.5 rounded-full", ui.dot)} aria-hidden />
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          {ui.label}
        </h2>
        <span className="ml-auto text-[11px] tabular-nums text-muted-foreground/70">
          {todos.length}
        </span>
      </header>
      <ul className="flex flex-col">
        {todos.map((t) => (
          <TodoItem key={t.id} todo={t} {...handlers} />
        ))}
      </ul>
    </section>
  );
}
