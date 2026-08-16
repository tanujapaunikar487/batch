/** Generic undo/redo wrapper for a pure reducer. */

export interface Historied<S> {
  present: S;
  past: S[];
  future: S[];
  canUndo: boolean;
  canRedo: boolean;
}

export type HistoryAction = { type: "undo" } | { type: "redo" };

export function withHistory<S, A extends { type: string }>(
  base: (s: S, a: A) => S,
  opts: { limit?: number; skip?: (a: A) => boolean } = {},
) {
  const limit = opts.limit ?? 50;
  const skip = opts.skip ?? (() => false);

  const init = (present: S): Historied<S> => ({
    present,
    past: [],
    future: [],
    canUndo: false,
    canRedo: false,
  });

  const reducer = (h: Historied<S>, action: A | HistoryAction): Historied<S> => {
    if (action.type === "undo") {
      if (h.past.length === 0) return h;
      const past = h.past.slice(0, -1);
      const present = h.past[h.past.length - 1];
      const future = [h.present, ...h.future];
      return { present, past, future, canUndo: past.length > 0, canRedo: true };
    }
    if (action.type === "redo") {
      if (h.future.length === 0) return h;
      const [present, ...future] = h.future;
      const past = [...h.past, h.present];
      return { present, past, future, canUndo: true, canRedo: future.length > 0 };
    }
    const a = action as A;
    const next = base(h.present, a);
    if (next === h.present) return h;
    if (skip(a)) return { ...h, present: next };
    const past = [...h.past, h.present].slice(-limit);
    return { present: next, past, future: [], canUndo: true, canRedo: false };
  };

  return { reducer, init };
}
