import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import {
  type Action,
  type Attachment,
  type NoteSource,
  type NotesState,
  type Priority,
  emptyState,
  reduce,
} from "@/lib/notes";
import { withHistory } from "@/lib/history";
import { CorruptStoreError, createNotesStore, loadNotes, type KeyValueStore } from "./persistence";
import { native } from "@/lib/native";

const SAVE_DEBOUNCE_MS = 250;

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

type UiAction = Action | { type: "replaceUndoable"; state: NotesState };
const baseReducer = (s: NotesState, a: UiAction): NotesState =>
  a.type === "replaceUndoable" ? a.state : reduce(s, a);
const { reducer, init } = withHistory<NotesState, UiAction>(baseReducer, {
  limit: 50,
  skip: (a) => a.type === "replace",
});

export function useNotes(store?: KeyValueStore) {
  const kv = useMemo(() => store ?? createNotesStore(), [store]);
  const [h, dispatch] = useReducer(reducer, emptyState(), init);
  const [loaded, setLoaded] = useState(false);
  const [loadOk, setLoadOk] = useState(false);
  const [corrupt, setCorrupt] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
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
      .catch((err) => {
        console.error("[batch] failed to load notes:", err);
        if (!cancelled && err instanceof CorruptStoreError) setCorrupt(err.detail);
      })
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [kv]);

  const loadOkRef = useRef(false);
  loadOkRef.current = loadOk;
  const flush = useCallback(async () => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    // Never write over a file we couldn't read.
    if (!loadOkRef.current) return;
    try {
      await kv.save(latest.current);
      setSaveError(null);
    } catch (err) {
      console.error("[batch] failed to save notes:", err);
      setSaveError(String((err as Error)?.message ?? err));
    }
  }, [kv]);

  /**
   * Re-read notes.json after an external change (e.g. an agent via MCP wrote it).
   * Skipped while a local save is pending so we never clobber unsaved edits;
   * uses `replace` so it doesn't land on the undo stack.
   */
  const reloadFromDisk = useCallback(async () => {
    if (saveTimer.current !== null) return;
    try {
      const { state } = await loadNotes(kv);
      dispatch({ type: "replace", state });
      void native.devLog(`reloaded notes after external change (${state.notes.length} notes)`);
    } catch (err) {
      console.error("[batch] external reload failed:", err);
    }
  }, [kv]);

  /** After a quarantine ("start fresh"), allow saving again. */
  const startFresh = useCallback(() => {
    setCorrupt(null);
    setLoadOk(true);
    dispatch({ type: "replace", state: emptyState() });
  }, []);

  useEffect(() => {
    if (!loaded || !loadOk) return;
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null;
      void flush();
    }, SAVE_DEBOUNCE_MS);
    return () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current);
    };
  }, [h.present, loaded, loadOk, flush]);

  const actions = useMemo(
    () => ({
      add: (
        sectionId: string,
        text: string,
        priority?: Priority,
        attachments?: Attachment[],
        kind?: "heading",
        insertAfter?: string | null,
        source?: NoteSource,
      ) => {
        const id = newId();
        dispatch({ type: "add", id, sectionId, text, now: Date.now(), priority, attachments, kind, insertAfter, source });
        return id;
      },
      setAttachments: (id: string, attachments: Attachment[]) => dispatch({ type: "setAttachments", id, attachments }),
      setOutcome: (id: string, text: string | null, by: "me" | "agent" = "me") =>
        dispatch({ type: "setOutcome", id, text, by, now: Date.now() }),
      setPreamble: (sectionId: string, text: string) => dispatch({ type: "setPreamble", sectionId, text }),
      markHandedOff: (ids: string[]) => dispatch({ type: "markHandedOff", ids, now: Date.now() }),
      toggle: (id: string) => dispatch({ type: "toggle", id, now: Date.now() }),
      setDone: (ids: string[], done: boolean) => dispatch({ type: "setDone", ids, done, now: Date.now() }),
      edit: (id: string, text: string) => dispatch({ type: "edit", id, text }),
      remove: (ids: string[]) => dispatch({ type: "remove", ids }),
      setPriority: (ids: string[], priority: Priority) => dispatch({ type: "setPriority", ids, priority }),
      move: (ids: string[], sectionId: string) => dispatch({ type: "move", ids, sectionId }),
      merge: (ids: string[]) => dispatch({ type: "merge", ids, now: Date.now() }),
      clearDone: (sectionId?: string) => dispatch({ type: "clearDone", sectionId }),
      reorder: (id: string, afterId: string | null) => dispatch({ type: "reorder", id, afterId, now: Date.now() }),
      nudge: (id: string, delta: -1 | 1) => dispatch({ type: "nudge", id, delta, now: Date.now() }),
      reorderMany: (ids: string[], afterId: string | null) => dispatch({ type: "reorderMany", ids, afterId, now: Date.now() }),
      toggleCollapse: (id: string) => dispatch({ type: "toggleCollapse", id }),
      addSection: (name: string) => {
        const id = newId();
        dispatch({ type: "addSection", id, name, now: Date.now() });
        return id;
      },
      renameSection: (id: string, name: string) => dispatch({ type: "renameSection", id, name }),
      removeSection: (id: string) => dispatch({ type: "removeSection", id }),
      reorderSection: (id: string, afterId: string | null) => dispatch({ type: "reorderSection", id, afterId }),
      /** Wholesale replacement that stays undoable (import). */
      replace: (state: NotesState) => dispatch({ type: "replaceUndoable", state }),
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
    /** True only if the store was read successfully (guards attachment GC + saving). */
    loadOk,
    /** Set when notes.json exists but couldn't be parsed; saving is paused. */
    corrupt,
    saveError,
    startFresh,
    reloadFromDisk,
    flush,
    ...actions,
  };
}

export type NotesApi = ReturnType<typeof useNotes>;
