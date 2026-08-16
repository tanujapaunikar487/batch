import { useCallback, useMemo, useState } from "react";

/**
 * Cursor + multi-selection over an ordered list of ids (the visible notes).
 * Pure UI state; the caller re-renders rows with `isCursor` / `isSelected`.
 */
export function useListNav(ids: string[]) {
  const [cursor, setCursor] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const index = useMemo(() => new Map(ids.map((id, i) => [id, i])), [ids]);

  // Drop ids that vanished (deleted / filtered out).
  const liveCursor = cursor && index.has(cursor) ? cursor : null;
  const liveSelected = useMemo(() => {
    if (selected.size === 0) return selected;
    let same = true;
    for (const id of selected) if (!index.has(id)) { same = false; break; }
    return same ? selected : new Set([...selected].filter((id) => index.has(id)));
  }, [selected, index]);

  const rangeBetween = useCallback(
    (a: string, b: string) => {
      const ia = index.get(a) ?? 0;
      const ib = index.get(b) ?? 0;
      const [lo, hi] = ia < ib ? [ia, ib] : [ib, ia];
      return new Set(ids.slice(lo, hi + 1));
    },
    [ids, index],
  );

  const clear = useCallback(() => {
    setCursor(null);
    setAnchor(null);
    setSelected(new Set());
  }, []);

  /** Put the cursor on `id`; without `extend` selection becomes just that id. */
  const focus = useCallback(
    (id: string, extend = false) => {
      setCursor(id);
      if (extend && anchor) {
        setSelected(rangeBetween(anchor, id));
      } else {
        setAnchor(id);
        setSelected(new Set([id]));
      }
    },
    [anchor, rangeBetween],
  );

  const move = useCallback(
    (delta: number, extend = false) => {
      if (ids.length === 0) return;
      const i = liveCursor ? (index.get(liveCursor) ?? 0) : delta > 0 ? -1 : ids.length;
      const next = Math.min(ids.length - 1, Math.max(0, i + delta));
      focus(ids[next], extend);
    },
    [ids, index, liveCursor, focus],
  );

  const toggle = useCallback(
    (id: string) => {
      setCursor(id);
      setAnchor(id);
      setSelected((s) => {
        const n = new Set(s);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      });
    },
    [],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(ids));
    if (!liveCursor && ids.length) setCursor(ids[0]);
  }, [ids, liveCursor]);

  const first = () => ids[0] ?? null;
  const atFirst = liveCursor !== null && index.get(liveCursor) === 0;

  return {
    cursor: liveCursor,
    selected: liveSelected,
    /** Ids to operate on: selection if any, else the cursor. */
    targets: liveSelected.size > 0 ? [...liveSelected] : liveCursor ? [liveCursor] : [],
    focus,
    move,
    toggle,
    selectAll,
    clear,
    first,
    atFirst,
  };
}
