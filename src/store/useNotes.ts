import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  type Action,
  type Attachment,
  type NotesState,
  type Priority,
  emptyState,
  reduce,
} from "@/lib/notes";
import { withHistory } from "@/lib/history";
import { createStore, loadNotes, NOTES_FILE, type KeyValueStore } from "./persistence";
import { native } from "@/lib/native";

const SAVE_DEBOUNCE_MS = 250;

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

const { reducer, init } = withHistory<NotesState, Action>(reduce, {
  limit: 50,
  skip: (a) => a.type === "replace",
});

export function useNotes(store?: KeyValueStore) {
  const kv = useMemo(() => store ?? createStore(NOTES_FILE), [store]);
  const [h, dispatch] = useReducer(reducer, emptyState(), init);
  const [loaded, setLoaded] = useState(false);
  const [loadOk, setLoadOk] = useState(false);
  const saveTimer = useRef<number | null>(null);
  const latest = useRef<NotesState>(h.present);
  latest.current = h.present;

  useEffect(() => {
    let cancelled = false;
    loadNotes(kv)
      .then(({ state, migrated }) => {
        if (cancelled) return;
        dispatch({ type: "replace", state });
        setLoadOk(true);
        void native.devLog(
          `loaded ${state.notes.length} note(s) in ${state.sections.length} section(s)${migrated ? " (migrated from v1)" : ""}`,
        );
      })
      .catch((err) => console.error("[batch] failed to load notes:", err))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [kv]);

  const flush = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    await kv.save(latest.current).catch((err) => console.error("[batch] failed to save notes:", err));
  }, [kv]);

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
  }, [h.present, loaded, flush]);

  const actions = useMemo(
    () => ({
      add: (sectionId: string, text: string, priority?: Priority, attachments?: Attachment[]) => {
        const id = newId();
        dispatch({ type: "add", id, sectionId, text, now: Date.now(), priority, attachments });
        return id;
      },
      setAttachments: (id: string, attachments: Attachment[]) => dispatch({ type: "setAttachments", id, attachments }),
      toggle: (id: string) => dispatch({ type: "toggle", id, now: Date.now() }),
      setDone: (ids: string[], done: boolean) => dispatch({ type: "setDone", ids, done, now: Date.now() }),
      edit: (id: string, text: string) => dispatch({ type: "edit", id, text }),
      remove: (ids: string[]) => dispatch({ type: "remove", ids }),
      setPriority: (ids: string[], priority: Priority) => dispatch({ type: "setPriority", ids, priority }),
      move: (ids: string[], sectionId: string) => dispatch({ type: "move", ids, sectionId }),
      merge: (ids: string[]) => dispatch({ type: "merge", ids, now: Date.now() }),
      clearDone: (sectionId?: string) => dispatch({ type: "clearDone", sectionId }),
      addSection: (name: string) => {
        const id = newId();
        dispatch({ type: "addSection", id, name, now: Date.now() });
        return id;
      },
      renameSection: (id: string, name: string) => dispatch({ type: "renameSection", id, name }),
      removeSection: (id: string) => dispatch({ type: "removeSection", id }),
      undo: () => dispatch({ type: "undo" }),
      redo: () => dispatch({ type: "redo" }),
    }),
    [],
  );

  return {
    state: h.present,
    canUndo: h.canUndo,
    canRedo: h.canRedo,
    loaded,
    /** True only if the store was read successfully (guards attachment GC). */
    loadOk,
    flush,
    ...actions,
  };
}

export type NotesApi = ReturnType<typeof useNotes>;
