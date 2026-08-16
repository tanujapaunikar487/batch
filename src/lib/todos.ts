/**
 * Pure domain logic for the checklist. No React, no Tauri, no I/O — so it can
 * be unit-tested and reused (e.g. by a future widget or CLI).
 */

export type Priority = "high" | "medium" | "low";

/** Display / cycle order. */
export const PRIORITIES: readonly Priority[] = ["high", "medium", "low"] as const;

export const PRIORITY_LABEL: Record<Priority, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

export interface Todo {
  id: string;
  text: string;
  priority: Priority;
  done: boolean;
  /** epoch ms */
  createdAt: number;
  /** epoch ms; present only while `done` is true */
  completedAt?: number;
}

export interface TodoState {
  version: 1;
  todos: Todo[];
}

export const emptyState = (): TodoState => ({ version: 1, todos: [] });

export type Action =
  | { type: "add"; id: string; text: string; priority: Priority; now: number }
  | { type: "addMany"; ids: string[]; texts: string[]; priority: Priority; now: number }
  | { type: "toggle"; id: string; now: number }
  | { type: "setPriority"; id: string; priority: Priority }
  | { type: "cyclePriority"; id: string }
  | { type: "updateText"; id: string; text: string }
  | { type: "remove"; id: string }
  | { type: "clearDone" }
  | { type: "replace"; state: TodoState };

const cleanText = (raw: string) => raw.replace(/\s+/g, " ").trim();

/**
 * Turn what the user typed/dictated/pasted into a list of item texts.
 * One line = one item; blank lines are dropped.
 */
export function parseInput(raw: string): string[] {
  return raw
    .split(/\r?\n/)
    .map(cleanText)
    .filter((t) => t.length > 0);
}

export function nextPriority(p: Priority): Priority {
  const i = PRIORITIES.indexOf(p);
  return PRIORITIES[(i + 1) % PRIORITIES.length];
}

function updateTodo(
  state: TodoState,
  id: string,
  fn: (t: Todo) => Todo | null,
): TodoState {
  const idx = state.todos.findIndex((t) => t.id === id);
  if (idx === -1) return state;
  const next = fn(state.todos[idx]);
  const todos = state.todos.slice();
  if (next === null) todos.splice(idx, 1);
  else todos[idx] = next;
  return { ...state, todos };
}

export function reduce(state: TodoState, action: Action): TodoState {
  switch (action.type) {
    case "add": {
      const text = cleanText(action.text);
      if (!text) return state;
      const todo: Todo = {
        id: action.id,
        text,
        priority: action.priority,
        done: false,
        createdAt: action.now,
      };
      return { ...state, todos: [todo, ...state.todos] };
    }
    case "addMany": {
      const fresh: Todo[] = [];
      action.texts.forEach((raw, i) => {
        const text = cleanText(raw);
        if (!text) return;
        fresh.push({
          id: action.ids[i],
          text,
          priority: action.priority,
          done: false,
          // stagger so "newest first" keeps typed order stable
          createdAt: action.now - (action.texts.length - 1 - i),
        });
      });
      if (fresh.length === 0) return state;
      return { ...state, todos: [...fresh, ...state.todos] };
    }
    case "toggle":
      return updateTodo(state, action.id, (t) =>
        t.done
          ? { ...t, done: false, completedAt: undefined }
          : { ...t, done: true, completedAt: action.now },
      );
    case "setPriority":
      return updateTodo(state, action.id, (t) =>
        t.priority === action.priority ? t : { ...t, priority: action.priority },
      );
    case "cyclePriority":
      return updateTodo(state, action.id, (t) => ({ ...t, priority: nextPriority(t.priority) }));
    case "updateText": {
      const text = cleanText(action.text);
      return updateTodo(state, action.id, (t) => (text ? { ...t, text } : null));
    }
    case "remove":
      return updateTodo(state, action.id, () => null);
    case "clearDone": {
      const todos = state.todos.filter((t) => !t.done);
      return todos.length === state.todos.length ? state : { ...state, todos };
    }
    case "replace":
      return action.state;
  }
}

/** Open (not done) todos bucketed by priority, newest first within a bucket. */
export function groupByPriority(todos: Todo[]): Record<Priority, Todo[]> {
  const out: Record<Priority, Todo[]> = { high: [], medium: [], low: [] };
  for (const t of todos) if (!t.done) out[t.priority].push(t);
  for (const p of PRIORITIES) out[p].sort((a, b) => b.createdAt - a.createdAt);
  return out;
}

/** Completed todos, most recently completed first. */
export function doneTodos(todos: Todo[]): Todo[] {
  return todos
    .filter((t) => t.done)
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
}

const isPriority = (v: unknown): v is Priority =>
  typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);

/**
 * Validate whatever came off disk. Never throws; drops what it can't repair.
 */
export function normalizeState(raw: unknown): TodoState {
  if (!raw || typeof raw !== "object") return emptyState();
  const todosRaw = (raw as { todos?: unknown }).todos;
  if (!Array.isArray(todosRaw)) return emptyState();
  const todos: Todo[] = [];
  for (const item of todosRaw) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    if (typeof r.id !== "string" || typeof r.text !== "string") continue;
    const text = cleanText(r.text);
    if (!text) continue;
    const done = Boolean(r.done);
    const createdAt = typeof r.createdAt === "number" ? r.createdAt : Date.now();
    const todo: Todo = {
      id: r.id,
      text,
      priority: isPriority(r.priority) ? r.priority : "medium",
      done,
      createdAt,
    };
    if (done) {
      todo.completedAt = typeof r.completedAt === "number" ? r.completedAt : createdAt;
    }
    todos.push(todo);
  }
  return { version: 1, todos };
}
