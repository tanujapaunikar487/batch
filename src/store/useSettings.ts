import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ActionId, DEFAULT_KEYMAP, DEFAULT_TOGGLE_SHORTCUT, normalizeBinding, toTauriShortcut } from "@/lib/shortcuts";
import { createStore, SETTINGS_FILE, type KeyValueStore } from "./persistence";
import { native } from "@/lib/native";

export interface Settings {
  version: 1;
  /** Binding string ("alt+shift+Space"); registered system-wide via Rust. */
  toggleShortcut: string;
  doubleShift: boolean;
  keymap: Partial<Record<ActionId, string>>;
}

export const DEFAULT_SETTINGS: Settings = {
  version: 1,
  toggleShortcut: DEFAULT_TOGGLE_SHORTCUT,
  doubleShift: true,
  keymap: {},
};

function normalizeSettings(raw: unknown): Settings {
  const s = { ...DEFAULT_SETTINGS, keymap: {} as Settings["keymap"] };
  if (!raw || typeof raw !== "object") return s;
  const r = raw as Record<string, unknown>;
  if (typeof r.toggleShortcut === "string" && normalizeBinding(r.toggleShortcut)) {
    s.toggleShortcut = normalizeBinding(r.toggleShortcut)!;
  }
  if (typeof r.doubleShift === "boolean") s.doubleShift = r.doubleShift;
  if (r.keymap && typeof r.keymap === "object") {
    for (const [k, v] of Object.entries(r.keymap as Record<string, unknown>)) {
      if (k in DEFAULT_KEYMAP && typeof v === "string" && normalizeBinding(v)) {
        s.keymap[k as ActionId] = normalizeBinding(v)!;
      }
    }
  }
  return s;
}

export function useSettings(store?: KeyValueStore) {
  const kv = useMemo(() => store ?? createStore(SETTINGS_FILE), [store]);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);
  const latest = useRef(settings);
  latest.current = settings;

  useEffect(() => {
    let cancelled = false;
    kv.load()
      .then((raw) => !cancelled && setSettings(normalizeSettings(raw)))
      .catch((err) => console.error("[batch] failed to load settings:", err))
      .finally(() => !cancelled && setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [kv]);

  const update = useCallback(
    (patch: Partial<Settings> | ((s: Settings) => Partial<Settings>)) => {
      setSettings((prev) => {
        const next = { ...prev, ...(typeof patch === "function" ? patch(prev) : patch) };
        void kv.save(next).catch((err) => console.error("[batch] failed to save settings:", err));
        return next;
      });
    },
    [kv],
  );

  /** Effective keymap = defaults overridden by user bindings. */
  const keymap = useMemo(() => ({ ...DEFAULT_KEYMAP, ...settings.keymap }), [settings.keymap]);

  const setBinding = useCallback(
    (action: ActionId, binding: string | null) =>
      update((s) => {
        const keymap = { ...s.keymap };
        if (binding === null || binding === DEFAULT_KEYMAP[action]) delete keymap[action];
        else keymap[action] = binding;
        return { keymap };
      }),
    [update],
  );

  const resetKeymap = useCallback(() => update({ keymap: {} }), [update]);

  const setToggleShortcut = useCallback(
    async (binding: string) => {
      const tauri = toTauriShortcut(binding);
      if (!tauri) return false;
      const ok = (await native.setToggleShortcut(tauri)) ?? true;
      if (ok) update({ toggleShortcut: binding });
      return ok;
    },
    [update],
  );

  const setDoubleShift = useCallback(
    (enabled: boolean) => {
      update({ doubleShift: enabled });
      void native.setDoubleShift(enabled);
    },
    [update],
  );

  return { settings, keymap, loaded, setBinding, resetKeymap, setToggleShortcut, setDoubleShift };
}

export type SettingsApi = ReturnType<typeof useSettings>;
