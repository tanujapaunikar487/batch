import { useEffect, useRef, useState } from "react";
import { Flag, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { type Todo, nextPriority } from "@/lib/todos";
import { PRIORITY_UI } from "@/lib/priority-ui";

interface Props {
  todo: Todo;
  onToggle: (id: string) => void;
  onCyclePriority: (id: string) => void;
  onUpdateText: (id: string, text: string) => void;
  onRemove: (id: string) => void;
}

export function TodoItem({ todo, onToggle, onCyclePriority, onUpdateText, onRemove }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(todo.text);
  const inputRef = useRef<HTMLInputElement>(null);
  const ui = PRIORITY_UI[todo.priority];

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    setEditing(false);
    if (draft.trim() !== todo.text) onUpdateText(todo.id, draft);
  };
  const cancel = () => {
    setEditing(false);
    setDraft(todo.text);
  };

  return (
    <li
      className={cn(
        "group flex items-start gap-2.5 rounded-lg px-2 py-1 -mx-0.5",
        "hover:bg-foreground/[0.04] dark:hover:bg-foreground/[0.06]",
        todo.done && "opacity-60",
      )}
      data-testid="todo-item"
    >
      <Checkbox
        checked={todo.done}
        onCheckedChange={() => onToggle(todo.id)}
        aria-label={todo.done ? "Mark as not done" : "Mark as done"}
        className="mt-1 shrink-0"
      />

      {editing ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            else if (e.key === "Escape") {
              e.stopPropagation();
              cancel();
            }
          }}
          className="min-w-0 flex-1 bg-transparent py-0.5 text-sm leading-5 outline-none"
          aria-label="Edit item"
        />
      ) : (
        <span
          onDoubleClick={() => !todo.done && setEditing(true)}
          title={todo.done ? undefined : "Double-click to edit"}
          className={cn(
            "min-w-0 flex-1 select-none py-0.5 text-sm leading-5 break-words",
            todo.done && "line-through text-muted-foreground",
          )}
        >
          {todo.text}
        </span>
      )}

      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100">
        {!todo.done && (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onCyclePriority(todo.id)}
                aria-label={`Priority ${ui.label}. Change to ${PRIORITY_UI[nextPriority(todo.priority)].label}`}
              >
                <Flag className={cn("size-3.5", ui.text)} />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="left">
              {ui.label} → {PRIORITY_UI[nextPriority(todo.priority)].label}
            </TooltipContent>
          </Tooltip>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onRemove(todo.id)}
          aria-label="Delete item"
          className="text-muted-foreground hover:text-destructive"
        >
          <X className="size-3.5" />
        </Button>
      </div>
    </li>
  );
}
