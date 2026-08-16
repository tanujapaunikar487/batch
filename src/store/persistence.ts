/**
 * Where the checklist lives on disk. Inside Tauri it's a JSON file under
 * ~/Library/Application Support/<bundle-id>/todos.json via tauri-plugin-store;
 * in a plain browser (vite dev, tests) it falls back to localStorage so the UI
 * can be developed without the native shell.
 */

import { type TodoState } from "@/lib/todos";

export interface Persistence {
  load(): Promise<unknown>;
  save(state: TodoState): Promise<void>;
}

const STORE_FILE = "todos.json";
const STORE_KEY = "state";

export const isTauri = () =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

class TauriPersistence implements Persistence {
  private storePromise: Promise<import("@tauri-apps/plugin-store").Store> | null = null;

  private store() {
    if (!this.storePromise) {
      this.storePromise = import("@tauri-apps/plugin-store").then((m) =>
        // autoSave: false — we call save() ourselves so a hide can await it.
        m.load(STORE_FILE, { autoSave: false, defaults: {} }),
      );
    }
    return this.storePromise;
  }

  async load() {
    const s = await this.store();
    return s.get<unknown>(STORE_KEY);
  }

  async save(state: TodoState) {
    const s = await this.store();
    await s.set(STORE_KEY, state);
    await s.save();
  }
}

class LocalStoragePersistence implements Persistence {
  async load() {
    // Dev affordance: http://localhost:1420/?seed=1 shows sample data (not persisted).
    if (new URLSearchParams(location.search).has("seed")) return SEED;
    const raw = localStorage.getItem(`batch:${STORE_KEY}`);
    return raw ? JSON.parse(raw) : undefined;
  }
  async save(state: TodoState) {
    localStorage.setItem(`batch:${STORE_KEY}`, JSON.stringify(state));
  }
}

export function createPersistence(): Persistence {
  return isTauri() ? new TauriPersistence() : new LocalStoragePersistence();
}

const SEED: TodoState = {
  version: 1,
  todos: [
    { id: "s1", text: "Ship the design review", priority: "high", done: false, createdAt: 6 },
    { id: "s2", text: "Call the landlord about the leak in the bathroom ceiling", priority: "high", done: false, createdAt: 5 },
    { id: "s3", text: "Buy groceries", priority: "medium", done: false, createdAt: 4 },
    { id: "s4", text: "Reply to Priya", priority: "medium", done: false, createdAt: 3 },
    { id: "s5", text: "Sort out old photos", priority: "low", done: false, createdAt: 2 },
    { id: "s6", text: "Book dentist", priority: "medium", done: true, createdAt: 1, completedAt: 10 },
    { id: "s7", text: "Renew passport", priority: "high", done: true, createdAt: 0, completedAt: 9 },
  ],
};
