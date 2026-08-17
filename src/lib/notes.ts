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

/** Max images per note. */
export const MAX_ATTACHMENTS = 10;

export interface Attachment {
  /** File name inside the attachments dir (uuid + ext). */
  id: string;
  /** Original file name, for display. */
  name: string;
  mime: string;
  /** A PNG thumbnail exists at thumbs/<id>.png */
  thumb: boolean;
  width: number;
  height: number;
  /** Browser-only fallback (dev): inline data URL instead of a file. */
  dataUrl?: string;
}

export interface Note {
  id: string;
  sectionId: string;
  /** Markdown. Multi-line allowed. May be "" when the note is images-only. */
  text: string;
  priority: Priority;
  done: boolean;
  createdAt: number;
  completedAt?: number;
  attachments?: Attachment[];
  /** Manual position within the folder; defaults to createdAt (chronological). */
  order?: number;
  /** "heading" = a section title row inside the folder (no checkbox / priority). */
  kind?: "heading";
  /** Heading only: its notes are hidden in the list. */
  collapsed?: boolean;
}

export const isHeading = (n: Pick<Note, "kind">) => n.kind === "heading";
/** `# Title` typed into the capture box becomes a heading. */
export const HEADING_PREFIX = /^#{1,3}\s+(.+)$/;

/** Sort key for open notes: manual order if set, else creation time. */
export const sortKey = (n: Pick<Note, "order" | "createdAt">) => n.order ?? n.createdAt;

export const hasAttachments = (n: Pick<Note, "attachments">) => (n.attachments?.length ?? 0) > 0;

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
  | {
      type: "add";
      id: string;
      sectionId: string;
      text: string;
      now: number;
      priority?: Priority;
      attachments?: Attachment[];
      kind?: "heading";
      /** Place the new note right after this id (null = top) instead of at the end. */
      insertAfter?: string | null;
    }
  | { type: "setAttachments"; id: string; attachments: Attachment[] }
  | { type: "toggle"; id: string; now: number }
  | { type: "setDone"; ids: string[]; done: boolean; now: number }
  | { type: "edit"; id: string; text: string }
  | { type: "remove"; ids: string[] }
  | { type: "setPriority"; ids: string[]; priority: Priority }
  | { type: "move"; ids: string[]; sectionId: string }
  | { type: "merge"; ids: string[]; now: number }
  | { type: "clearDone"; sectionId?: string }
  /** Move `id` right after `afterId` among the open notes of its folder (null = to the top). */
  | { type: "reorder"; id: string; afterId: string | null; now: number }
  /** Nudge `id` one step up (-1) or down (+1) within its folder. */
  | { type: "nudge"; id: string; delta: -1 | 1; now: number }
  /** Move several notes together, keeping their relative order, right after `afterId` (null = top). */
  | { type: "reorderMany"; ids: string[]; afterId: string | null; now: number }
  | { type: "toggleCollapse"; id: string }
  | { type: "addSection"; id: string; name: string; now: number }
  | { type: "renameSection"; id: string; name: string }
  | { type: "removeSection"; id: string }
  /** Move a folder right after `afterId` (null = first). */
  | { type: "reorderSection"; id: string; afterId: string | null }
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
      const attachments = (action.attachments ?? []).slice(0, MAX_ATTACHMENTS);
      if ((!text && attachments.length === 0) || !hasSection(state, action.sectionId)) return state;
      const note: Note = {
        id: action.id,
        sectionId: action.sectionId,
        text,
        priority: action.priority ?? "medium",
        done: false,
        createdAt: action.now,
      };
      if (action.kind === "heading") {
        note.kind = "heading";
        note.text = text.split("\n")[0].replace(/^#{1,3}\s+/, "");
        delete note.attachments;
      } else if (attachments.length) note.attachments = attachments;
      const next = { ...state, notes: [...state.notes, note] };
      if (action.insertAfter === undefined) return next;
      // Position it: raw insertion (no section snapping) so "add section above X" lands exactly there.
      const sorted = folderSorted(next, note.sectionId);
      const rest = sorted.filter((n) => n.id !== note.id);
      let at = 0;
      if (action.insertAfter !== null) {
        const i = rest.findIndex((n) => n.id === action.insertAfter);
        if (i === -1) return next;
        at = i + 1;
      }
      return withSequence(next, sorted, [...rest.slice(0, at), note, ...rest.slice(at)]);
    }
    case "setAttachments": {
      const attachments = action.attachments.slice(0, MAX_ATTACHMENTS);
      return mapNotes(state, [action.id], (n) => {
        if (!n.text && attachments.length === 0) return null; // nothing left
        const next = { ...n };
        if (attachments.length) next.attachments = attachments;
        else delete next.attachments;
        return next;
      });
    }
    case "toggle":
      return mapNotes(state, [action.id], (n) =>
        isHeading(n) ? n : n.done
          ? { ...n, done: false, completedAt: undefined }
          : { ...n, done: true, completedAt: action.now },
      );
    case "setDone":
      return mapNotes(state, action.ids, (n) =>
        isHeading(n) || n.done === action.done
          ? n
          : action.done
            ? { ...n, done: true, completedAt: action.now }
            : { ...n, done: false, completedAt: undefined },
      );
    case "edit": {
      const text = cleanText(action.text);
      return mapNotes(state, [action.id], (n) => {
        if (text === n.text) return n;
        // Blank text removes the note unless it still carries images.
        if (!text && !hasAttachments(n)) return null;
        return { ...n, text };
      });
    }
    case "remove":
      return mapNotes(state, action.ids, () => null);
    case "setPriority":
      return mapNotes(state, action.ids, (n) =>
        isHeading(n) || n.priority === action.priority ? n : { ...n, priority: action.priority },
      );
    case "move":
      if (!hasSection(state, action.sectionId)) return state;
      return mapNotes(state, action.ids, (n) =>
        n.sectionId === action.sectionId ? n : { ...n, sectionId: action.sectionId },
      );
    case "merge": {
      const set = new Set(action.ids);
      const picked = state.notes.filter((n) => set.has(n.id) && !isHeading(n));
      if (picked.length < 2) return state;
      const ordered = [...picked].sort((a, b) => sortKey(a) - sortKey(b));
      const first = ordered[0];
      const attachments = ordered.flatMap((n) => n.attachments ?? []).slice(0, MAX_ATTACHMENTS);
      const merged: Note = {
        id: first.id,
        sectionId: first.sectionId,
        text: ordered
          .map((n) => n.text)
          .filter(Boolean)
          .join("\n\n"),
        priority: ordered.reduce<Priority>(
          (best, n) => (PRIORITY_RANK[n.priority] < PRIORITY_RANK[best] ? n.priority : best),
          first.priority,
        ),
        done: false,
        createdAt: first.createdAt,
      };
      if (first.order !== undefined) merged.order = first.order;
      if (attachments.length) merged.attachments = attachments;
      const notes: Note[] = [];
      for (const n of state.notes) {
        if (n.id === first.id) notes.push(merged);
        else if (!set.has(n.id) || isHeading(n)) notes.push(n);
      }
      return { ...state, notes };
    }
    case "reorder": {
      const moving = state.notes.find((n) => n.id === action.id);
      if (!moving || action.afterId === action.id) return state;
      const sorted = folderSorted(state, moving.sectionId);
      const block = groupOf(sorted, action.id);
      const blockIds = new Set(block.map((n) => n.id));
      if (action.afterId && blockIds.has(action.afterId)) return state;
      const rest = sorted.filter((n) => !blockIds.has(n.id));
      let at = 0;
      if (action.afterId !== null) {
        let i = rest.findIndex((n) => n.id === action.afterId);
        if (i === -1) return state;
        // A section block dropped inside another section snaps to that section's end.
        if (isHeading(moving)) while (i + 1 < rest.length && !isHeading(rest[i + 1])) i++;
        at = i + 1;
      }
      const seq = [...rest.slice(0, at), ...block, ...rest.slice(at)];
      return withSequence(state, sorted, seq);
    }
    case "reorderMany": {
      const set = new Set(action.ids);
      const first = state.notes.find((n) => set.has(n.id));
      if (!first || (action.afterId && set.has(action.afterId))) return state;
      const sorted = folderSorted(state, first.sectionId);
      const block = sorted.filter((n) => set.has(n.id) && !isHeading(n));
      if (block.length === 0) return state;
      const rest = sorted.filter((n) => !set.has(n.id) || isHeading(n));
      let at = 0;
      if (action.afterId !== null) {
        const i = rest.findIndex((n) => n.id === action.afterId);
        if (i === -1) return state;
        at = i + 1;
      }
      return withSequence(state, sorted, [...rest.slice(0, at), ...block, ...rest.slice(at)]);
    }
    case "toggleCollapse":
      return mapNotes(state, [action.id], (n) => (isHeading(n) ? { ...n, collapsed: !n.collapsed } : n));
    case "nudge": {
      const moving = state.notes.find((n) => n.id === action.id);
      if (!moving) return state;
      const sorted = folderSorted(state, moving.sectionId);
      if (isHeading(moving)) {
        // Whole section blocks swap places.
        const blocks = splitBlocks(sorted);
        const bi = blocks.findIndex((bl) => bl[0].id === action.id);
        const bj = bi + action.delta;
        if (bi === -1 || bj < 0 || bj >= blocks.length) return state;
        [blocks[bi], blocks[bj]] = [blocks[bj], blocks[bi]];
        return withSequence(state, sorted, blocks.flat());
      }
      const i = sorted.findIndex((n) => n.id === action.id);
      const j = i + action.delta;
      if (i === -1 || j < 0 || j >= sorted.length) return state;
      const seq = sorted.slice();
      [seq[i], seq[j]] = [seq[j], seq[i]];
      return withSequence(state, sorted, seq);
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
    case "reorderSection": {
      if (action.id === action.afterId || !hasSection(state, action.id)) return state;
      const rest = state.sections.filter((s) => s.id !== action.id);
      const moving = state.sections.find((s) => s.id === action.id)!;
      let at = 0;
      if (action.afterId !== null) {
        const i = rest.findIndex((s) => s.id === action.afterId);
        if (i === -1) return state;
        at = i + 1;
      }
      const sections = [...rest.slice(0, at), moving, ...rest.slice(at)];
      if (sections.every((s, i) => s.id === state.sections[i].id)) return state;
      return { ...state, sections };
    }
    case "replace":
      return action.state;
  }
}

// ───────────────────────── ordering helpers ─────────────────────────

/** All notes of a folder (open and done) in display order — done notes stay in place. */
function folderSorted(state: NotesState, sectionId: string): Note[] {
  return state.notes.filter((n) => n.sectionId === sectionId).sort((a, b) => sortKey(a) - sortKey(b));
}

/** A heading + the notes under it (until the next heading); a plain note is its own group. */
function groupOf(sorted: Note[], id: string): Note[] {
  const i = sorted.findIndex((n) => n.id === id);
  if (i === -1) return [];
  if (!isHeading(sorted[i])) return [sorted[i]];
  let j = i + 1;
  while (j < sorted.length && !isHeading(sorted[j])) j++;
  return sorted.slice(i, j);
}

/** Split into blocks: a heading + its notes; unheaded notes before the first heading are single-note blocks. */
function splitBlocks(sorted: Note[]): Note[][] {
  const blocks: Note[][] = [];
  for (const n of sorted) {
    const last = blocks[blocks.length - 1];
    if (isHeading(n) || !last || !isHeading(last[0])) blocks.push([n]);
    else last.push(n);
  }
  return blocks;
}

/**
 * Apply a new display sequence by redistributing the existing sort keys, so the
 * key range stays timestamp-like and newly created notes still append at the end.
 */
function withSequence(state: NotesState, before: Note[], seq: Note[]): NotesState {
  if (before.length === seq.length && before.every((n, i) => n.id === seq[i].id)) return state;
  const keys = before.map(sortKey).sort((a, b) => a - b);
  const keyById = new Map(seq.map((n, i) => [n.id, keys[i]]));
  return mapNotes(
    state,
    seq.map((n) => n.id),
    (n) => {
      const k = keyById.get(n.id)!;
      return sortKey(n) === k && n.order !== undefined ? n : { ...n, order: k };
    },
  );
}

// ───────────────────────── selectors ─────────────────────────

const byCreated = (a: Note, b: Note) => sortKey(a) - sortKey(b);
const byCompletedDesc = (a: Note, b: Note) => (b.completedAt ?? 0) - (a.completedAt ?? 0);

/** Every note in a folder in display order (open and done interleaved). */
export function allInSection(state: NotesState, sectionId: string): Note[] {
  return folderSorted(state, sectionId);
}

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
  // The default folder must exist (it's where notes go when a folder is deleted),
  // but the user may order folders however they like.
  if (!seen.has(INBOX_ID)) sections.unshift({ id: INBOX_ID, name: DEFAULT_FOLDER_NAME, createdAt: 0 });
  const sectionIds = new Set(sections.map((s) => s.id));

  const notes: Note[] = [];
  const noteIds = new Set<string>();
  for (const item of r.notes) {
    if (!item || typeof item !== "object") continue;
    const n = item as Record<string, unknown>;
    if (typeof n.id !== "string" || typeof n.text !== "string" || noteIds.has(n.id)) continue;
    const text = cleanText(n.text);
    const attachments = normalizeAttachments(n.attachments);
    if (!text && attachments.length === 0) continue;
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
    if (attachments.length) note.attachments = attachments;
    if (typeof n.order === "number" && Number.isFinite(n.order)) note.order = n.order;
    if (n.kind === "heading") {
      note.kind = "heading";
      note.done = false;
      delete note.completedAt;
      delete note.attachments;
      if (n.collapsed === true) note.collapsed = true;
    }
    notes.push(note);
  }
  return { version: 2, sections, notes };
}

function normalizeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  const out: Attachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const a = item as Record<string, unknown>;
    if (typeof a.id !== "string" || !a.id || a.id.includes("/")) continue;
    const att: Attachment = {
      id: a.id,
      name: typeof a.name === "string" && a.name ? a.name : a.id,
      mime: typeof a.mime === "string" ? a.mime : "image/*",
      thumb: Boolean(a.thumb),
      width: typeof a.width === "number" ? a.width : 0,
      height: typeof a.height === "number" ? a.height : 0,
    };
    if (typeof a.dataUrl === "string" && a.dataUrl.startsWith("data:")) att.dataUrl = a.dataUrl;
    out.push(att);
    if (out.length >= MAX_ATTACHMENTS) break;
  }
  return out;
}

/** Every attachment id referenced anywhere (for GC). */
export function allAttachmentIds(state: NotesState): string[] {
  return state.notes.flatMap((n) => (n.attachments ?? []).map((a) => a.id));
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
