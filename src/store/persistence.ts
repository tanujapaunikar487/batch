/**
 * Where things live on disk. Inside Tauri: JSON files under
 * ~/Library/Application Support/<bundle-id>/ via tauri-plugin-store. In a
 * plain browser (vite dev, tests): localStorage, so the UI can be developed
 * without the native shell.
 */

import { type NotesState, INBOX_ID, emptyState, migrateFromV1, normalizeState } from "@/lib/notes";

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
  return { state: emptyState(), migrated: false };
}

// ───────────────────────── dev seed (?seed=1) ─────────────────────────

function seedState(): NotesState {
  const now = Date.now();
  const H = 3_600_000;
  return {
    version: 2,
    sections: [
      { id: INBOX_ID, name: "Inbox", createdAt: 0 },
      { id: "prompts", name: "Prompts", createdAt: 1 },
      { id: "links", name: "Links", createdAt: 2 },
    ],
    notes: [
      { id: "s1", sectionId: INBOX_ID, text: "Ship the design review", priority: "high", done: false, createdAt: now - 30 * H },
      { id: "s2", sectionId: INBOX_ID, text: "Ask Claude to **summarise the thread** and pull out action items", priority: "medium", done: false, createdAt: now - 26 * H },
      { id: "s3", sectionId: INBOX_ID, text: "https://ui.shadcn.com/docs/components/textarea", priority: "low", done: false, createdAt: now - 20 * H },
      { id: "s4", sectionId: INBOX_ID, text: "Try `bun run app:build` and check the dmg step", priority: "medium", done: false, createdAt: now - 3 * H },
      { id: "s5", sectionId: INBOX_ID, text: "Renew passport", priority: "high", done: true, createdAt: now - 50 * H, completedAt: now - 2 * H },
      { id: "s6", sectionId: INBOX_ID, text: "Book dentist", priority: "low", done: true, createdAt: now - 60 * H, completedAt: now - 40 * H },
      { id: "p1", sectionId: "prompts", text: "Explain the tradeoffs of RSC vs. client components for a dashboard with heavy interactivity", priority: "high", done: false, createdAt: now - 10 * H },
      { id: "p2", sectionId: "prompts", text: "Rewrite this in a calmer tone:\n\n> We MUST ship by Friday or the launch slips.", priority: "medium", done: false, createdAt: now - 9 * H },
      { id: "p3", sectionId: "prompts", text: "Generate 5 test cases for `parseBinding()`", priority: "medium", done: false, createdAt: now - 8 * H },
      { id: "l1", sectionId: "links", text: "https://tauri.app/plugin/global-shortcut/", priority: "medium", done: false, createdAt: now - 5 * H },
    ],
  };
}
