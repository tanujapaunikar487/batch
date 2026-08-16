import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  type Priority,
  type TodoState,
  emptyState,
  normalizeState,
  parseInput,
  reduce,
} from "@/lib/todos";
import { createPersistence, type Persistence } from "./persistence";
import { native } from "@/lib/native";

const SAVE_DEBOUNCE_MS = 250;

const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function useTodos(persistence?: Persistence) {
  const store = useMemo(() => persistence ?? createPersistence(), [persistence]);
  const [state, dispatch] = useReducer(reduce, undefined, emptyState);
  const [loaded, setLoaded] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const pendingSave = useRef<Promise<void> | null>(null);
  const latest = useRef<TodoState>(state);
  latest.current = state;

  // Load once.
  useEffect(() => {
    let cancelled = false;
    store
      .load()
      .then((raw) => {
        if (cancelled) return;
        const next = normalizeState(raw);
        dispatch({ type: "replace", state: next });
        void native.devLog(`loaded ${next.todos.length} todo(s) from store`);
      })
      .catch((err) => console.error("[batch] failed to load todos:", err))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [store]);

  const flush = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    pendingSave.current = store
      .save(latest.current)
      .catch((err) => console.error("[batch] failed to save todos:", err));
    await pendingSave.current;
  }, [store]);

  // Debounced save on every change after the initial load.
  useEffect(() => {
    if (!loaded) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [state, loaded, flush]);

  /** Add one or many items from raw input (newline = separate items). */
  const add = useCallback((raw: string, priority: Priority) => {
    const texts = parseInput(raw);
    if (texts.length === 0) return 0;
    const now = Date.now();
    if (texts.length === 1) {
      dispatch({ type: "add", id: newId(), text: texts[0], priority, now });
    } else {
      dispatch({ type: "addMany", ids: texts.map(newId), texts, priority, now });
    }
    return texts.length;
  }, []);

  const toggle = useCallback((id: string) => dispatch({ type: "toggle", id, now: Date.now() }), []);
  const setPriority = useCallback(
    (id: string, priority: Priority) => dispatch({ type: "setPriority", id, priority }),
    [],
  );
  const cyclePriority = useCallback((id: string) => dispatch({ type: "cyclePriority", id }), []);
  const updateText = useCallback((id: string, text: string) => dispatch({ type: "updateText", id, text }), []);
  const remove = useCallback((id: string) => dispatch({ type: "remove", id }), []);
  const clearDone = useCallback(() => dispatch({ type: "clearDone" }), []);

  return {
    todos: state.todos,
    loaded,
    add,
    toggle,
    setPriority,
    cyclePriority,
    updateText,
    remove,
    clearDone,
    flush,
  };
}
