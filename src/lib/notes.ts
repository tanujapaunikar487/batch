/**
 * Pure domain logic for Batch: sections + notes. No React, no Tauri, no I/O.
 */

export type Priority = "high" | "medium" | "low";
export const PRIORITIES: readonly Priority[] = ["high", "medium", "low"] as const;
export const PRIORITY_RANK: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

export function nextPriority(p: Priority): Priority {
  const i = PRIORITIES.indexOf(p);
  return PRIORITIES[(i + 1) % PRIORITIES.length];
}

/** Id of the default folder (kept as "inbox" for on-disk compatibility). */
export const INBOX_ID = "inbox";
export const DEFAULT_FOLDER_NAME = "Untitled";

export interface Section {
  id: string;
  name: string;
  createdAt: number;
}

export interface Note {
  id: string;
  sectionId: string;
  /** Markdown. Multi-line allowed. */
  text: string;
  priority: Priority;
  done: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface NotesState {
  version: 2;
  sections: Section[];
  notes: Note[];
}

export const emptyState = (): NotesState => ({
  version: 2,
  sections: [{ id: INBOX_ID, name: DEFAULT_FOLDER_NAME, createdAt: 0 }],
  notes: [],
});

/** Trim, normalise line endings, collapse runs of blank lines. */
export function cleanText(raw: string): string {
  return raw
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/[ \t]+$/g, ""))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const cleanName = (raw: string) => raw.replace(/\s+/g, " ").trim();

export type Action =
  | { type: "add"; id: string; sectionId: string; text: string; now: number; priority?: Priority }
  | { type: "toggle"; id: string; now: number }
  | { type: "edit"; id: string; text: string }
  | { type: "remove"; ids: string[] }
  | { type: "setPriority"; ids: string[]; priority: Priority }
  | { type: "move"; ids: string[]; sectionId: string }
  | { type: "merge"; ids: string[]; now: number }
  | { type: "clearDone"; sectionId?: string }
  | { type: "addSection"; id: string; name: string; now: number }
  | { type: "renameSection"; id: string; name: string }
  | { type: "removeSection"; id: string }
  | { type: "replace"; state: NotesState };

const hasSection = (s: NotesState, id: string) => s.sections.some((x) => x.id === id);

function mapNotes(state: NotesState, ids: string[], fn: (n: Note) => Note | null): NotesState {
  const set = new Set(ids);
  let changed = false;
  const notes: Note[] = [];
  for (const n of state.notes) {
    if (!set.has(n.id)) {
      notes.push(n);
      continue;
    }
    const next = fn(n);
    if (next !== n) changed = true;
    if (next !== null) notes.push(next);
  }
  return changed ? { ...state, notes } : state;
}

export function reduce(state: NotesState, action: Action): NotesState {
  switch (action.type) {
    case "add": {
      const text = cleanText(action.text);
      if (!text || !hasSection(state, action.sectionId)) return state;
      const note: Note = {
        id: action.id,
        sectionId: action.sectionId,
        text,
        priority: action.priority ?? "medium",
        done: false,
        createdAt: action.now,
      };
      return { ...state, notes: [...state.notes, note] };
    }
    case "toggle":
      return mapNotes(state, [action.id], (n) =>
        n.done
          ? { ...n, done: false, completedAt: undefined }
          : { ...n, done: true, completedAt: action.now },
      );
    case "edit": {
      const text = cleanText(action.text);
      return mapNotes(state, [action.id], (n) => (text ? (text === n.text ? n : { ...n, text }) : null));
    }
    case "remove":
      return mapNotes(state, action.ids, () => null);
    case "setPriority":
      return mapNotes(state, action.ids, (n) =>
        n.priority === action.priority ? n : { ...n, priority: action.priority },
      );
    case "move":
      if (!hasSection(state, action.sectionId)) return state;
      return mapNotes(state, action.ids, (n) =>
        n.sectionId === action.sectionId ? n : { ...n, sectionId: action.sectionId },
      );
    case "merge": {
      const set = new Set(action.ids);
      const picked = state.notes.filter((n) => set.has(n.id));
      if (picked.length < 2) return state;
      const ordered = [...picked].sort((a, b) => a.createdAt - b.createdAt);
      const first = ordered[0];
      const merged: Note = {
        id: first.id,
        sectionId: first.sectionId,
        text: ordered.map((n) => n.text).join("\n\n"),
        priority: ordered.reduce<Priority>(
          (best, n) => (PRIORITY_RANK[n.priority] < PRIORITY_RANK[best] ? n.priority : best),
          first.priority,
        ),
        done: false,
        createdAt: first.createdAt,
      };
      const notes: Note[] = [];
      for (const n of state.notes) {
        if (n.id === first.id) notes.push(merged);
        else if (!set.has(n.id)) notes.push(n);
      }
      return { ...state, notes };
    }
    case "clearDone": {
      const notes = state.notes.filter(
        (n) => !(n.done && (action.sectionId === undefined || n.sectionId === action.sectionId)),
      );
      return notes.length === state.notes.length ? state : { ...state, notes };
    }
    case "addSection": {
      const name = cleanName(action.name);
      if (!name || hasSection(state, action.id)) return state;
      return {
        ...state,
        sections: [...state.sections, { id: action.id, name, createdAt: action.now }],
      };
    }
    case "renameSection": {
      const name = cleanName(action.name);
      if (!name) return state;
      let changed = false;
      const sections = state.sections.map((s) => {
        if (s.id !== action.id || s.name === name) return s;
        changed = true;
        return { ...s, name };
      });
      return changed ? { ...state, sections } : state;
    }
    case "removeSection": {
      if (action.id === INBOX_ID || !hasSection(state, action.id)) return state;
      return {
        sections: state.sections.filter((s) => s.id !== action.id),
        notes: state.notes.map((n) => (n.sectionId === action.id ? { ...n, sectionId: INBOX_ID } : n)),
        version: 2,
      };
    }
    case "replace":
      return action.state;
  }
}

// ───────────────────────── selectors ─────────────────────────

const byCreated = (a: Note, b: Note) => a.createdAt - b.createdAt;
const byCompletedDesc = (a: Note, b: Note) => (b.completedAt ?? 0) - (a.completedAt ?? 0);

/** Open notes in a section, oldest first. */
export function notesInSection(state: NotesState, sectionId: string): Note[] {
  return state.notes.filter((n) => n.sectionId === sectionId && !n.done).sort(byCreated);
}

/** Done notes in a section, most recently completed first. */
export function doneInSection(state: NotesState, sectionId: string): Note[] {
  return state.notes.filter((n) => n.sectionId === sectionId && n.done).sort(byCompletedDesc);
}

/** Case-insensitive substring search across all sections; open first, then done. */
export function searchNotes(state: NotesState, query: string): Note[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits = state.notes.filter((n) => n.text.toLowerCase().includes(q));
  const open = hits.filter((n) => !n.done).sort(byCreated);
  const done = hits.filter((n) => n.done).sort(byCompletedDesc);
  return [...open, ...done];
}

export function sectionById(state: NotesState, id: string): Section | undefined {
  return state.sections.find((s) => s.id === id);
}

// ───────────────────────── loading ─────────────────────────

const isPriority = (v: unknown): v is Priority =>
  typeof v === "string" && (PRIORITIES as readonly string[]).includes(v);

/** Validate whatever came off disk. Never throws; repairs what it can. */
export function normalizeState(raw: unknown): NotesState {
  if (!raw || typeof raw !== "object") return emptyState();
  const r = raw as Record<string, unknown>;
  if (!Array.isArray(r.sections) || !Array.isArray(r.notes)) return emptyState();

  const sections: Section[] = [];
  const seen = new Set<string>();
  for (const item of r.sections) {
    if (!item || typeof item !== "object") continue;
    const s = item as Record<string, unknown>;
    if (typeof s.id !== "string" || typeof s.name !== "string") continue;
    const name = cleanName(s.name);
    if (!name || seen.has(s.id)) continue;
    seen.add(s.id);
    sections.push({
      id: s.id,
      // "Inbox" was the pre-folders default name; show it as "Untitled" now.
      name: s.id === INBOX_ID && name === "Inbox" ? DEFAULT_FOLDER_NAME : name,
      createdAt: typeof s.createdAt === "number" ? s.createdAt : 0,
    });
  }
  if (!seen.has(INBOX_ID)) sections.unshift({ id: INBOX_ID, name: DEFAULT_FOLDER_NAME, createdAt: 0 });
  else {
    // Inbox always first.
    const i = sections.findIndex((s) => s.id === INBOX_ID);
    if (i > 0) sections.unshift(...sections.splice(i, 1));
  }
  const sectionIds = new Set(sections.map((s) => s.id));

  const notes: Note[] = [];
  const noteIds = new Set<string>();
  for (const item of r.notes) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.text !== "string" || noteIds.has(n.id)) continue;
    const text = cleanText(n.text);
    if (!text) continue;
    noteIds.add(n.id);
    const done = Boolean(n.done);
    const createdAt = typeof n.createdAt === "number" ? n.createdAt : Date.now();
    const note: Note = {
      id: n.id,
      sectionId: typeof n.sectionId === "string" && sectionIds.has(n.sectionId) ? n.sectionId : INBOX_ID,
      text,
      priority: isPriority(n.priority) ? n.priority : "medium",
      done,
      createdAt,
    };
    if (done) note.completedAt = typeof n.completedAt === "number" ? n.completedAt : createdAt;
    notes.push(note);
  }
  return { version: 2, sections, notes };
}

/** v1 `todos.json` ({version:1, todos:[...]}) → v2 state with everything in Inbox. */
export function migrateFromV1(raw: unknown): NotesState {
  const todos = raw && typeof raw === "object" ? (raw as { todos?: unknown }).todos : undefined;
  if (!Array.isArray(todos)) return emptyState();
  return normalizeState({
    version: 2,
    sections: emptyState().sections,
    notes: todos.map((t) => ({ ...(t as object), sectionId: INBOX_ID })),
  });
}
