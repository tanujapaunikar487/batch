/**
 * Thin bridge to the Rust side. Every call is a no-op outside Tauri so the UI
 * keeps working in a plain browser during development.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/store/persistence";

async function call<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T | undefined> {
  if (!isTauri()) return undefined;
  try {
    return await invoke<T>(cmd, args);
  } catch (err) {
    console.error(`[batch] ${cmd} failed:`, err);
    return undefined;
  }
}

export const native = {
  /** Hide the popover window (it stays resident in the menu bar). */
  hide: () => call("hide_window"),
  /** Quit the app entirely. */
  quit: () => call("quit_app"),
  /** Pinned = stays open when it loses focus. */
  setPinned: (pinned: boolean) => call("set_pinned", { pinned }),
  /** Re-register the system-wide toggle hotkey. Returns false if it couldn't be registered. */
  setToggleShortcut: (shortcut: string) => call<boolean>("set_toggle_shortcut", { shortcut }),
  /** Turn the double-Shift event tap on/off. */
  setDoubleShift: (enabled: boolean) => call("set_double_shift", { enabled }),
  /** Is the app trusted for Accessibility (needed by the double-Shift tap)? */
  accessibilityStatus: () => call<boolean>("accessibility_status"),
  /** Show the system prompt / open the Accessibility pane. */
  requestAccessibility: () => call<boolean>("request_accessibility"),
  /** Force the native window appearance (vibrancy follows): "system" | "light" | "dark". */
  setTheme: (theme: "system" | "light" | "dark") => call("set_theme", { theme }),
  /** Open http(s)/mailto links in the default browser. */
  openUrl: (url: string) => call("open_url", { url }),
  /** Reveal notes.json in Finder. */
  revealNotesFile: () => call("reveal_notes_file"),
  /** Absolute path of the notes file (for display). */
  notesFilePath: () => call<string>("notes_file_path"),
  /** Dev builds only: echo to the `tauri dev` terminal. No-op in production. */
  devLog: (msg: string) => (import.meta.env.DEV ? call("dev_log", { msg }) : Promise.resolve()),
};

/** Subscribe to the "window was just shown" signal from Rust. */
export async function onShown(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("batch://shown", handler);
}
