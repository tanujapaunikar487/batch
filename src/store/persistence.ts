/**
 * Where things live on disk. Inside Tauri: JSON files under
 * ~/Library/Application Support/<bundle-id>/ via tauri-plugin-store. In a
 * plain browser (vite dev, tests): localStorage, so the UI can be developed
 * without the native shell.
 */

import { type NotesState, INBOX_ID, emptyState, migrateFromV1, normalizeState } from "@/lib/notes";
import { native } from "@/lib/native";

/** notes.json exists but can't be understood — never overwrite it. */
export class CorruptStoreError extends Error {
  constructor(public readonly detail: string) {
    super("notes.json could not be read");
  }
}

export interface KeyValueStore {
  load(): Promise<unknown>;
  save(value: unknown): Promise<void>;
}

export const NOTES_FILE = "notes.json";
export const SETTINGS_FILE = "settings.json";
const LEGACY_TODOS_FILE = "todos.json";
const KEY = "state";

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

class TauriStore implements KeyValueStore {
  private storePromise: Promise<import("@tauri-apps/plugin-store").Store> | null = null;
  constructor(private file: string) {}

  private store() {
    if (!this.storePromise) {
      this.storePromise = import("@tauri-apps/plugin-store").then((m) =>
        // autoSave: false — we call save() ourselves so a hide can await it.
        m.load(this.file, { autoSave: false, defaults: {} }),
      );
    }
    return this.storePromise;
  }
  async load() {
    return (await this.store()).get<unknown>(KEY);
  }
  async save(value: unknown) {
    const s = await this.store();
    await s.set(KEY, value);
    await s.save();
  }
}

class LocalStore implements KeyValueStore {
  constructor(private file: string) {}
  async load() {
    const raw = localStorage.getItem(`batch:${this.file}`);
    return raw ? JSON.parse(raw) : undefined;
  }
  async save(value: unknown) {
    localStorage.setItem(`batch:${this.file}`, JSON.stringify(value));
  }
}

export function createStore(file: string): KeyValueStore {
  return isTauri() ? new TauriStore(file) : new LocalStore(file);
}

/**
 * Notes live in their own file written by Rust (atomic + daily backups).
 * `load()` throws CorruptStoreError when the file exists but isn't valid, so
 * the app can pause saving instead of clobbering it.
 */
class TauriNotesStore implements KeyValueStore {
  async load() {
    const raw = await native.readNotes();
    if (raw === null || raw === undefined) return undefined;
    if (!raw.trim()) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      throw new CorruptStoreError(`invalid JSON: ${(e as Error).message}`);
    }
    // Older builds wrapped the state as {"state": {...}} (tauri-plugin-store).
    const inner = parsed && typeof parsed === "object" && "state" in (parsed as object)
      ? (parsed as { state: unknown }).state
      : parsed;
    if (!inner || typeof inner !== "object" || !Array.isArray((inner as { notes?: unknown }).notes)) {
      throw new CorruptStoreError("unexpected shape");
    }
    return inner;
  }
  async save(value: unknown) {
    await native.writeNotes(JSON.stringify(value, null, 2));
  }
}

export function createNotesStore(): KeyValueStore {
  return isTauri() ? new TauriNotesStore() : new LocalStore(NOTES_FILE);
}

/**
 * Notes loader with v1 migration: if notes.json is empty and a v1 todos.json
 * exists, import it (into Inbox) and persist.
 */
export async function loadNotes(store: KeyValueStore): Promise<{ state: NotesState; migrated: boolean }> {
  if (!isTauri() && new URLSearchParams(location.search).has("seed")) {
    return { state: seedState(), migrated: false };
  }
  const raw = await store.load();
  if (raw && typeof raw === "object" && Array.isArray((raw as { notes?: unknown }).notes)) {
    return { state: normalizeState(raw), migrated: false };
  }
  const legacy = await createStore(LEGACY_TODOS_FILE).load().catch(() => undefined);
  if (legacy && typeof legacy === "object" && Array.isArray((legacy as { todos?: unknown }).todos)) {
    const state = migrateFromV1(legacy);
    await store.save(state);
    return { state, migrated: true };
  }
  // First run: a few notes that teach by doing.
  return { state: tutorialState(), migrated: false };
}

function tutorialState(): NotesState {
  const now = Date.now();
  const mk = (i: number, text: string, priority: "high" | "medium" | "low" = "medium") => ({
    id: `tour-${i}`,
    sectionId: INBOX_ID,
    text,
    priority,
    done: false,
    createdAt: now - (10 - i) * 1000,
  });
  return {
    version: 2,
    sections: emptyState().sections,
    notes: [
      mk(1, "Welcome to Batch 👋 — check things off as you go. Your notes are saved locally, in one file on this Mac.", "high"),
      mk(2, "Tap **Shift twice** in any app to open Batch. Select some text first and it comes along."),
      mk(3, "Type or paste below and press ↩. Markdown works: **bold**, `code`, lists, links."),
      mk(4, "Drag a screenshot or image onto this window to attach it — up to 10 per note."),
      mk(5, "Select two notes (⇧↓), then ⌘M merges them, ⇧⌘C copies them as a numbered list.", "low"),
      mk(6, "⌘/ shows every shortcut · ⌘, opens settings · click a folder name to rename it.", "low"),
    ],
  };
}

// ───────────────────────── dev seed (?seed=1) ─────────────────────────

function seedState(): NotesState {
  const now = Date.now();
  const H = 3_600_000;
  const png = (name: string, w: number, h: number, dataUrl: string) => ({ id: `seed-${name}`, name, mime: "image/png", thumb: false, width: w, height: h, dataUrl });
  const blue = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAEAAAAAwCAIAAAAuKetIAAAAQ0lEQVR42u3PQQkAAAgEsItqOUv6soJfYbACS/W8FgEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQGBqwUyR/VaFprtdQAAAABJRU5ErkJggg==";
  const amber = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAADAAAABACAIAAADTQmMRAAAARElEQVR42u3OMQ0AAAgDsInBvwWE8eCCcDSpgGa6XomQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQ0JUFBfFpS4NV8boAAAAASUVORK5CYII=";
  return {
    version: 2,
    sections: [
      { id: INBOX_ID, name: "Untitled", createdAt: 0 },
      { id: "prompts", name: "Prompts", createdAt: 1 },
      { id: "research", name: "Research", createdAt: 2 },
    ],
    notes: [
      { id: "h-today", sectionId: INBOX_ID, text: "Today", priority: "medium", done: false, createdAt: now - 40 * H, kind: "heading" },
      { id: "u1", sectionId: INBOX_ID, text: "Draft the release notes for 1.1 — mention the new export and the side-panel mode", priority: "high", done: false, createdAt: now - 39 * H },
      { id: "u2", sectionId: INBOX_ID, text: "Reply to Sam about the API rate limits", priority: "medium", done: true, createdAt: now - 38 * H, completedAt: now - 2 * H },
      { id: "u3", sectionId: INBOX_ID, text: "Ask Claude to **summarise the thread** and pull out the action items", priority: "medium", done: false, createdAt: now - 30 * H },
      { id: "h-later", sectionId: INBOX_ID, text: "Later", priority: "medium", done: false, createdAt: now - 20 * H, kind: "heading" },
      { id: "u4", sectionId: INBOX_ID, text: "Compare Postgres vs. SQLite for the sync layer — write up pros/cons", priority: "low", done: false, createdAt: now - 19 * H },
      { id: "u5", sectionId: INBOX_ID, text: "Try `bun run dist:mac` on the Intel machine", priority: "medium", done: false, createdAt: now - 3 * H },
      { id: "u6", sectionId: INBOX_ID, text: "Onboarding card needs more spacing — see the two screenshots", priority: "medium", done: false, createdAt: now - 1 * H, attachments: [png("before.png", 64, 48, blue), png("after.png", 48, 64, amber)] },
      { id: "p1", sectionId: "prompts", text: "Explain the tradeoffs of server components vs. client components for a dashboard with heavy interactivity", priority: "high", done: false, createdAt: now - 10 * H },
      { id: "p2", sectionId: "prompts", text: "Rewrite this in a calmer tone:\n\n> We MUST ship by Friday or the launch slips.", priority: "medium", done: false, createdAt: now - 9 * H },
      { id: "p3", sectionId: "prompts", text: "Generate 5 edge-case tests for `parseBinding()` — layouts, dead keys, numpad", priority: "medium", done: false, createdAt: now - 8 * H },
      { id: "p4", sectionId: "prompts", text: "Turn these bullet notes into a one-paragraph status update for the team", priority: "low", done: true, createdAt: now - 7 * H, completedAt: now - 5 * H },
      { id: "r1", sectionId: "research", text: "https://tauri.app/plugin/global-shortcut/", priority: "medium", done: false, createdAt: now - 6 * H },
      { id: "r2", sectionId: "research", text: "https://developer.apple.com/design/human-interface-guidelines/the-menu-bar", priority: "low", done: false, createdAt: now - 5 * H },
      { id: "r3", sectionId: "research", text: "Notes from the call: keep the core config declarative; add a TypeScript escape hatch later if needed", priority: "medium", done: false, createdAt: now - 4 * H },
    ],
  };
}

