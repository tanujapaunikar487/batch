/**
 * Thin bridge to the Rust side. Every call is a no-op outside Tauri so the UI
 * keeps working in a plain browser during development.
 */
import { invoke } from "@tauri-apps/api/core";
import { isTauri } from "@/store/persistence";

/** Like `call` but propagates errors (for saves, where the caller must know). */
async function invokeStrict<T = void>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauri()) throw new Error("not in tauri");
  return invoke<T>(cmd, args);
}

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
  /** Bring the window to the front (after a drop from another app). */
  focus: () => call("focus_window"),
  /** Fill the screen's work area / restore. Resolves to the new expanded state. */
  toggleExpand: () => call<boolean>("toggle_expand"),
  isExpanded: () => call<boolean>("is_expanded"),
  /** Forget a manual drag; snap back under the menu-bar icon. */
  resetPosition: () => call("reset_position"),
  /** Pinned = stays open when it loses focus. */
  setPinned: (pinned: boolean) => call("set_pinned", { pinned }),
  /** Re-register the system-wide toggle hotkey. Returns false if it couldn't be registered. */
  setToggleShortcut: (shortcut: string) => call<boolean>("set_toggle_shortcut", { shortcut }),
  /** Turn the double-Shift event tap on/off. */
  setDoubleShift: (enabled: boolean) => call("set_double_shift", { enabled }),
  /** Ground truth for double-Shift: feature on, tap listening, permission granted. */
  doubleShiftStatus: () => call<{ enabled: boolean; active: boolean; granted: boolean }>("double_shift_status"),
  /** Show the Input Monitoring prompt / open that pane. */
  requestAccessibility: () => call<boolean>("request_accessibility"),
  /** Restart the app (Input Monitoring grants only apply to a fresh process). */
  relaunch: () => call("relaunch"),
  /** Grab the frontmost app's selection on ⇧⇧ (needs Accessibility). */
  setCaptureSelection: (enabled: boolean) => call("set_capture_selection", { enabled }),
  /** Remember the source app/window of a ⇧⇧ capture. */
  setCaptureSource: (enabled: boolean) => call("set_capture_source", { enabled }),
  /** Re-register the system-wide screen-region capture hotkey. */
  setScreenshotShortcut: (shortcut: string) => call<boolean>("set_screenshot_shortcut", { shortcut }),
  /** Start an interactive screen-region capture (result arrives via onCaptureImage). */
  captureRegion: () => call("capture_region"),
  /** Absolute path of the bundled `batch-mcp` server, if present. */
  mcpPath: () => call<string | null>("mcp_path"),
  accessibilityTrusted: () => call<boolean>("accessibility_trusted"),
  requestAccessibilityPermission: () => call<boolean>("request_accessibility_permission"),
  /** Force the native window appearance (vibrancy follows): "system" | "light" | "dark". */
  setTheme: (theme: "system" | "light" | "dark") => call("set_theme", { theme }),
  /** Open http(s)/mailto links in the default browser. */
  openUrl: (url: string) => call("open_url", { url }),
  /** Reveal notes.json in Finder. */
  revealNotesFile: () => call("reveal_notes_file"),
  /** Absolute path of the notes file (for display). */
  notesFilePath: () => call<string>("notes_file_path"),
  // ── notes file ──
  readNotes: () => call<string | null>("read_notes"),
  writeNotes: (contents: string) => invokeStrict("write_notes", { contents }),
  quarantineNotes: () => call<string>("quarantine_notes"),
  writeTextFile: (path: string, contents: string) => invokeStrict("write_text_file", { path, contents }),
  readTextFile: (path: string) => invokeStrict<string>("read_text_file", { path }),
  listBackups: () => call<{ name: string; path: string; bytes: number; date: string }[]>("list_backups"),
  exportBundle: (destDir: string, folderName: string, markdown: string, attachmentIds: string[]) =>
    invokeStrict<string>("export_bundle", { destDir, folderName, markdown, attachmentIds }),
  // ── attachments ──
  attachmentsDir: () => call<string>("attachments_dir"),
  importAttachments: (paths: string[]) => call<import("@/lib/notes").Attachment[]>("import_attachments", { paths }),
  gcAttachments: (keep: string[]) => call<number>("gc_attachments", { keep }),
  openAttachment: (id: string) => call("open_attachment", { id }),
  attachmentPaths: (ids: string[]) => call<string[]>("attachment_paths", { ids }),
  /** Text + image files on the pasteboard together. */
  copyRich: (text: string, ids: string[]) => call("copy_rich", { text, ids }),
  /** Dev builds only: echo to the `tauri dev` terminal. No-op in production. */
  devLog: (msg: string) => (import.meta.env.DEV ? call("dev_log", { msg }) : Promise.resolve()),
};

export interface CapturePayload {
  text: string;
  source?: { app: string; title?: string; bundleId?: string; at: number };
}

/** Text captured from another app via double-Shift (with where it came from). */
export async function onCapture(handler: (p: CapturePayload) => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<CapturePayload>("batch://capture", (e) => handler(e.payload));
}

/** A screen-region capture finished (⌥⇧S / ⊕ menu). */
export async function onCaptureImage(
  handler: (a: import("@/lib/notes").Attachment) => void,
): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen<import("@/lib/notes").Attachment>("batch://capture-image", (e) => handler(e.payload));
}

/** notes.json was changed by something else (the MCP server, a text editor…). */
export async function onNotesChanged(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("batch://notes-changed", () => handler());
}

/** Subscribe to the "window was just shown" signal from Rust. */
export async function onShown(handler: () => void): Promise<() => void> {
  if (!isTauri()) return () => {};
  const { listen } = await import("@tauri-apps/api/event");
  return listen("batch://shown", handler);
}
