import { describe, expect, it } from "vitest";
import {
  parseBinding,
  formatBinding,
  matchesEvent,
  bindingFromEvent,
  toTauriShortcut,
  normalizeBinding,
  DEFAULT_KEYMAP,
  CUSTOMIZABLE_ACTIONS,
  ACTIONS,
} from "./shortcuts";

const ev = (over: Partial<KeyboardEvent>): KeyboardEvent =>
  ({ metaKey: false, ctrlKey: false, altKey: false, shiftKey: false, code: "", key: "", ...over }) as KeyboardEvent;

describe("parseBinding / normalizeBinding", () => {
  it("parses modifiers + code, order-insensitive, case-insensitive modifiers", () => {
    expect(parseBinding("shift+mod+KeyN")).toEqual({ mod: true, shift: true, alt: false, ctrl: false, code: "KeyN" });
    expect(normalizeBinding("Shift+MOD+KeyN")).toBe("mod+shift+KeyN");
  });
  it("rejects bindings without a key or with an unknown token", () => {
    expect(parseBinding("mod+shift")).toBeNull();
    expect(parseBinding("hyper+KeyA")).toBeNull();
    expect(parseBinding("")).toBeNull();
  });
});

describe("formatBinding", () => {
  it("renders mac glyphs", () => {
    expect(formatBinding("mod+shift+KeyN")).toBe("⇧⌘N"); // Apple order: ⌃⌥⇧⌘
    expect(formatBinding("alt+shift+Space")).toBe("⌥⇧Space");
    expect(formatBinding("mod+Comma")).toBe("⌘,");
    expect(formatBinding("mod+Slash")).toBe("⌘/");
    expect(formatBinding("mod+Digit1")).toBe("⌘1");
    expect(formatBinding("mod+shift+Backspace")).toBe("⇧⌘⌫");
    expect(formatBinding("mod+BracketRight")).toBe("⌘]");
    expect(formatBinding("Escape")).toBe("Esc");
    expect(formatBinding("ArrowUp")).toBe("↑");
  });
});

describe("matchesEvent", () => {
  it("matches exact modifier set + code", () => {
    expect(matchesEvent(ev({ metaKey: true, shiftKey: true, code: "KeyN" }), "mod+shift+KeyN")).toBe(true);
    expect(matchesEvent(ev({ metaKey: true, code: "KeyN" }), "mod+shift+KeyN")).toBe(false);
    expect(matchesEvent(ev({ metaKey: true, shiftKey: true, altKey: true, code: "KeyN" }), "mod+shift+KeyN")).toBe(false);
  });
  it("mod means ⌘ (metaKey), not ctrl", () => {
    expect(matchesEvent(ev({ ctrlKey: true, code: "KeyN" }), "mod+KeyN")).toBe(false);
    expect(matchesEvent(ev({ ctrlKey: true, code: "KeyN" }), "ctrl+KeyN")).toBe(true);
  });
});

describe("bindingFromEvent (recorder)", () => {
  it("returns null for bare modifiers, otherwise a normalised binding", () => {
    expect(bindingFromEvent(ev({ shiftKey: true, code: "ShiftLeft", key: "Shift" }))).toBeNull();
    expect(bindingFromEvent(ev({ metaKey: true, code: "MetaLeft", key: "Meta" }))).toBeNull();
    expect(bindingFromEvent(ev({ metaKey: true, altKey: true, code: "KeyK", key: "˚" }))).toBe("mod+alt+KeyK");
    expect(bindingFromEvent(ev({ code: "F5", key: "F5" }))).toBe("F5");
  });
});

describe("toTauriShortcut", () => {
  it("converts to global-hotkey syntax", () => {
    expect(toTauriShortcut("alt+shift+Space")).toBe("Alt+Shift+Space");
    expect(toTauriShortcut("mod+shift+KeyN")).toBe("Cmd+Shift+KeyN");
    expect(toTauriShortcut("ctrl+alt+Digit1")).toBe("Ctrl+Alt+Digit1");
    expect(toTauriShortcut("bogus")).toBeNull();
  });
});

describe("keymap defaults", () => {
  it("every customizable action has a default and metadata", () => {
    for (const a of CUSTOMIZABLE_ACTIONS) {
      expect(DEFAULT_KEYMAP[a]).toBeTruthy();
      expect(ACTIONS[a].label).toBeTruthy();
    }
  });
  it("no two default bindings collide", () => {
    const vals = Object.values(DEFAULT_KEYMAP);
    expect(new Set(vals).size).toBe(vals.length);
  });
});
