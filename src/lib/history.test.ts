import { describe, expect, it } from "vitest";
import { withHistory, type Historied } from "./history";

type S = { n: number };
type A = { type: "inc" } | { type: "replace"; state: S } | { type: "noop" };
const base = (s: S, a: A): S => (a.type === "inc" ? { n: s.n + 1 } : a.type === "replace" ? a.state : s);

describe("withHistory", () => {
  const { reducer, init } = withHistory(base, { limit: 3, skip: (a) => a.type === "replace" });
  const start: Historied<S> = init({ n: 0 });

  it("records past states and undoes/redoes", () => {
    let h = reducer(start, { type: "inc" });
    h = reducer(h, { type: "inc" });
    expect(h.present.n).toBe(2);
    expect(h.canUndo).toBe(true);
    h = reducer(h, { type: "undo" });
    expect(h.present.n).toBe(1);
    expect(h.canRedo).toBe(true);
    h = reducer(h, { type: "redo" });
    expect(h.present.n).toBe(2);
    expect(h.canRedo).toBe(false);
  });

  it("a no-op action does not add history", () => {
    const h = reducer(start, { type: "noop" });
    expect(h).toBe(start);
  });

  it("skipped actions replace present without touching history", () => {
    let h = reducer(start, { type: "inc" });
    h = reducer(h, { type: "replace", state: { n: 42 } });
    expect(h.present.n).toBe(42);
    expect(h.past.length).toBe(1);
    expect(reducer(h, { type: "undo" }).present.n).toBe(0);
  });

  it("caps history length", () => {
    let h = start;
    for (let i = 0; i < 10; i++) h = reducer(h, { type: "inc" });
    expect(h.past.length).toBe(3);
  });

  it("new action clears the redo stack", () => {
    let h = reducer(start, { type: "inc" });
    h = reducer(h, { type: "undo" });
    h = reducer(h, { type: "inc" });
    expect(h.canRedo).toBe(false);
  });
});
