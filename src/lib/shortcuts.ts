/**
 * Keyboard shortcut bindings.
 *
 * A binding is a string like "mod+shift+KeyN": lower-case modifiers (mod = ⌘,
 * ctrl, alt, shift) followed by a KeyboardEvent.code. Using `code` rather than
 * `key` makes ⌥-combos layout independent (⌥N types "˜" but its code is KeyN).
 */

export type ActionId =
  | "newSection"
  | "search"
  | "filters"
  | "copySectionAsList"
  | "merge"
  | "clearDone"
  | "moveNextSection"
  | "movePrevSection"
  | "pin"
  | "settings"
  | "help"
  | "undo"
  | "redo";

export interface Binding {
  mod: boolean;
  ctrl: boolean;
  alt: boolean;
  shift: boolean;
  code: string;
}

export const ACTIONS: Record<ActionId, { label: string; customizable: boolean }> = {
  newSection: { label: "New folder", customizable: true },
  search: { label: "Search", customizable: true },
  filters: { label: "Toggle filters", customizable: true },
  copySectionAsList: { label: "Copy as list (selection, or whole folder)", customizable: true },
  merge: { label: "Merge selected notes", customizable: true },
  clearDone: { label: "Clear done in folder", customizable: true },
  moveNextSection: { label: "Move note to next folder", customizable: true },
  movePrevSection: { label: "Move note to previous folder", customizable: true },
  pin: { label: "Pin / unpin window", customizable: true },
  settings: { label: "Settings", customizable: false },
  help: { label: "Keyboard shortcuts", customizable: false },
  undo: { label: "Undo", customizable: false },
  redo: { label: "Redo", customizable: false },
};

export const DEFAULT_KEYMAP: Record<ActionId, string> = {
  newSection: "mod+shift+KeyN",
  search: "mod+KeyF",
  filters: "mod+shift+KeyF",
  copySectionAsList: "mod+shift+KeyC",
  merge: "mod+KeyM",
  clearDone: "mod+shift+Backspace",
  moveNextSection: "mod+shift+BracketRight",
  movePrevSection: "mod+shift+BracketLeft",
  pin: "mod+KeyP",
  settings: "mod+Comma",
  help: "mod+Slash",
  undo: "mod+KeyZ",
  redo: "mod+shift+KeyZ",
};

export const CUSTOMIZABLE_ACTIONS = (Object.keys(ACTIONS) as ActionId[]).filter(
  (a) => ACTIONS[a].customizable,
);

/** Default global (system-wide) toggle hotkey. */
export const DEFAULT_TOGGLE_SHORTCUT = "alt+shift+Space";

const MODS = ["mod", "ctrl", "alt", "shift"] as const;
const MOD_CODES = new Set([
  "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight", "AltLeft", "AltRight",
  "ControlLeft", "ControlRight", "CapsLock", "Fn", "FnLock", "OSLeft", "OSRight",
]);

const NAMED_CODES = new Set([
  "Space", "Enter", "Escape", "Backspace", "Delete", "Tab", "Insert",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End", "PageUp", "PageDown",
  "Comma", "Period", "Slash", "Backslash", "Semicolon", "Quote", "BracketLeft", "BracketRight",
  "Minus", "Equal", "Backquote", "IntlBackslash",
]);

export function isKnownCode(code: string): boolean {
  return (
    NAMED_CODES.has(code) ||
    /^Key[A-Z]$/.test(code) ||
    /^Digit[0-9]$/.test(code) ||
    /^F([1-9]|1[0-9]|2[0-4])$/.test(code) ||
    /^Numpad([0-9]|Add|Subtract|Multiply|Divide|Decimal|Enter|Equal)$/.test(code)
  );
}

export function parseBinding(binding: string): Binding | null {
  if (!binding) return null;
  const parts = binding.split("+").map((p) => p.trim()).filter(Boolean);
  const b: Binding = { mod: false, ctrl: false, alt: false, shift: false, code: "" };
  for (const p of parts) {
    const lower = p.toLowerCase();
    if ((MODS as readonly string[]).includes(lower)) {
      b[lower as (typeof MODS)[number]] = true;
    } else if (!b.code && isKnownCode(p)) {
      b.code = p;
    } else {
      return null;
    }
  }
  return b.code ? b : null;
}

/** Canonical form: mod, ctrl, alt, shift, then code. */
export function normalizeBinding(binding: string): string | null {
  const b = parseBinding(binding);
  if (!b) return null;
  return [...MODS.filter((m) => b[m]), b.code].join("+");
}

const CODE_LABELS: Record<string, string> = {
  Space: "Space", Enter: "↩", Escape: "Esc", Backspace: "⌫", Delete: "⌦", Tab: "⇥",
  ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
  Comma: ",", Period: ".", Slash: "/", Backslash: "\\", Semicolon: ";", Quote: "'",
  BracketLeft: "[", BracketRight: "]", Minus: "-", Equal: "=", Backquote: "`",
  Home: "↖", End: "↘", PageUp: "⇞", PageDown: "⇟",
};

export function codeLabel(code: string): string {
  if (CODE_LABELS[code]) return CODE_LABELS[code];
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad/.test(code)) return "Num " + code.slice(6);
  return code;
}

/** Human form with mac glyphs, e.g. "⌘⇧N". */
export function formatBinding(binding: string): string {
  const b = parseBinding(binding);
  if (!b) return binding;
  return (
    (b.ctrl ? "⌃" : "") + (b.alt ? "⌥" : "") + (b.shift ? "⇧" : "") + (b.mod ? "⌘" : "") + codeLabel(b.code)
  );
}

export function matchesEvent(e: KeyboardEvent, binding: string): boolean {
  const b = parseBinding(binding);
  if (!b) return false;
  return (
    e.code === b.code &&
    e.metaKey === b.mod &&
    e.ctrlKey === b.ctrl &&
    e.altKey === b.alt &&
    e.shiftKey === b.shift
  );
}

/** For the recorder: turn a keydown into a binding, or null for a bare modifier. */
export function bindingFromEvent(e: KeyboardEvent): string | null {
  if (!e.code || MOD_CODES.has(e.code)) return null;
  const parts: string[] = [];
  if (e.metaKey) parts.push("mod");
  if (e.ctrlKey) parts.push("ctrl");
  if (e.altKey) parts.push("alt");
  if (e.shiftKey) parts.push("shift");
  parts.push(e.code);
  return normalizeBinding(parts.join("+"));
}

/** "mod+shift+KeyN" → "Cmd+Shift+KeyN" (tauri-plugin-global-shortcut / global-hotkey syntax). */
export function toTauriShortcut(binding: string): string | null {
  const b = parseBinding(binding);
  if (!b) return null;
  const parts: string[] = [];
  if (b.mod) parts.push("Cmd");
  if (b.ctrl) parts.push("Ctrl");
  if (b.alt) parts.push("Alt");
  if (b.shift) parts.push("Shift");
  parts.push(b.code);
  return parts.join("+");
}
