import { describe, expect, it } from "vitest";
import {
  type Todo,
  type TodoState,
  emptyState,
  reduce,
  parseInput,
  nextPriority,
  groupByPriority,
  doneTodos,
  normalizeState,
  PRIORITIES,
} from "./todos";

const mk = (over: Partial<Todo> = {}): Todo => ({
  id: over.id ?? "id-" + Math.random().toString(36).slice(2),
  text: "thing",
  priority: "medium",
  done: false,
  createdAt: 1000,
  ...over,
});

const withTodos = (todos: Todo[]): TodoState => ({ version: 1, todos });

describe("parseInput", () => {
  it("returns a single trimmed line", () => {
    expect(parseInput("  buy milk  ")).toEqual(["buy milk"]);
  });
  it("splits newline-separated paste into several items", () => {
    expect(parseInput("a\nb\r\n  c  \n\n")).toEqual(["a", "b", "c"]);
  });
  it("returns [] for blank input", () => {
    expect(parseInput("   \n  ")).toEqual([]);
  });
  it("collapses internal whitespace but keeps words", () => {
    expect(parseInput("call   the   landlord")).toEqual(["call the landlord"]);
  });
});

describe("nextPriority", () => {
  it("cycles high → medium → low → high", () => {
    expect(nextPriority("high")).toBe("medium");
    expect(nextPriority("medium")).toBe("low");
    expect(nextPriority("low")).toBe("high");
  });
  it("PRIORITIES is ordered high, medium, low", () => {
    expect(PRIORITIES).toEqual(["high", "medium", "low"]);
  });
});

describe("reduce", () => {
  it("add: prepends a new open todo with the given priority", () => {
    const s = reduce(emptyState(), {
      type: "add",
      id: "1",
      text: "ship it",
      priority: "high",
      now: 42,
    });
    expect(s.todos).toEqual([
      { id: "1", text: "ship it", priority: "high", done: false, createdAt: 42 },
    ]);
  });

  it("add: ignores blank text", () => {
    const s = reduce(emptyState(), {
      type: "add",
      id: "1",
      text: "   ",
      priority: "low",
      now: 1,
    });
    expect(s.todos).toEqual([]);
  });

  it("addMany: adds each text as its own todo, preserving input order (first typed ends up first)", () => {
    const s = reduce(emptyState(), {
      type: "addMany",
      ids: ["a", "b", "c"],
      texts: ["one", "two", "three"],
      priority: "medium",
      now: 5,
    });
    expect(s.todos.map((t) => t.text)).toEqual(["one", "two", "three"]);
    // subsequent add still lands on top
    const s2 = reduce(s, { type: "add", id: "d", text: "four", priority: "low", now: 6 });
    expect(s2.todos[0].text).toBe("four");
  });

  it("toggle: marks done with completedAt, and back to open clears it", () => {
    const s0 = withTodos([mk({ id: "1" })]);
    const s1 = reduce(s0, { type: "toggle", id: "1", now: 99 });
    expect(s1.todos[0].done).toBe(true);
    expect(s1.todos[0].completedAt).toBe(99);
    const s2 = reduce(s1, { type: "toggle", id: "1", now: 120 });
    expect(s2.todos[0].done).toBe(false);
    expect(s2.todos[0].completedAt).toBeUndefined();
  });

  it("setPriority / cyclePriority", () => {
    const s0 = withTodos([mk({ id: "1", priority: "high" })]);
    expect(reduce(s0, { type: "setPriority", id: "1", priority: "low" }).todos[0].priority).toBe("low");
    expect(reduce(s0, { type: "cyclePriority", id: "1" }).todos[0].priority).toBe("medium");
  });

  it("updateText: trims; blank text removes the todo", () => {
    const s0 = withTodos([mk({ id: "1", text: "old" })]);
    expect(reduce(s0, { type: "updateText", id: "1", text: "  new  " }).todos[0].text).toBe("new");
    expect(reduce(s0, { type: "updateText", id: "1", text: "  " }).todos).toEqual([]);
  });

  it("remove", () => {
    const s0 = withTodos([mk({ id: "1" }), mk({ id: "2" })]);
    expect(reduce(s0, { type: "remove", id: "1" }).todos.map((t) => t.id)).toEqual(["2"]);
  });

  it("clearDone removes only completed todos", () => {
    const s0 = withTodos([mk({ id: "1", done: true }), mk({ id: "2" })]);
    expect(reduce(s0, { type: "clearDone" }).todos.map((t) => t.id)).toEqual(["2"]);
  });

  it("unknown id is a no-op and returns the same state object", () => {
    const s0 = withTodos([mk({ id: "1" })]);
    expect(reduce(s0, { type: "toggle", id: "nope", now: 1 })).toBe(s0);
    expect(reduce(s0, { type: "remove", id: "nope" })).toBe(s0);
  });

  it("does not mutate the input state", () => {
    const s0 = withTodos([mk({ id: "1" })]);
    const frozen = JSON.stringify(s0);
    reduce(s0, { type: "toggle", id: "1", now: 1 });
    reduce(s0, { type: "add", id: "2", text: "x", priority: "low", now: 1 });
    expect(JSON.stringify(s0)).toBe(frozen);
  });
});

describe("groupByPriority", () => {
  it("buckets open todos by priority, newest first, and excludes done", () => {
    const todos = [
      mk({ id: "a", priority: "low", createdAt: 1 }),
      mk({ id: "b", priority: "high", createdAt: 2 }),
      mk({ id: "c", priority: "high", createdAt: 3 }),
      mk({ id: "d", priority: "high", createdAt: 4, done: true, completedAt: 5 }),
    ];
    const g = groupByPriority(todos);
    expect(g.high.map((t) => t.id)).toEqual(["c", "b"]);
    expect(g.medium).toEqual([]);
    expect(g.low.map((t) => t.id)).toEqual(["a"]);
  });
});

describe("doneTodos", () => {
  it("returns completed todos, most recently completed first", () => {
    const todos = [
      mk({ id: "a", done: true, completedAt: 10 }),
      mk({ id: "b" }),
      mk({ id: "c", done: true, completedAt: 30 }),
    ];
    expect(doneTodos(todos).map((t) => t.id)).toEqual(["c", "a"]);
  });
});

describe("normalizeState", () => {
  it("returns empty state for garbage", () => {
    expect(normalizeState(undefined)).toEqual(emptyState());
    expect(normalizeState(null)).toEqual(emptyState());
    expect(normalizeState("nope")).toEqual(emptyState());
    expect(normalizeState({ version: 1, todos: "x" })).toEqual(emptyState());
  });
  it("drops malformed todos and coerces missing fields", () => {
    const s = normalizeState({
      version: 1,
      todos: [
        { id: "1", text: "ok", priority: "high", done: false, createdAt: 1 },
        { id: "2", text: "bad priority", priority: "urgent", done: false, createdAt: 1 },
        { text: "no id" },
        { id: "3", text: "done no ts", priority: "low", done: true, createdAt: 1 },
      ],
    });
    expect(s.todos.map((t) => t.id)).toEqual(["1", "2", "3"]);
    expect(s.todos[1].priority).toBe("medium"); // unknown priority → medium
    expect(s.todos[2].done).toBe(true);
    expect(typeof s.todos[2].completedAt).toBe("number");
  });
});
