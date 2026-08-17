# Batch — menu bar checklist for macOS

**Date:** 2026-08-16
**Status:** v1 built 2026-08-16 (autonomously from the initial brief; assumptions listed at the bottom)

## What it is

A tiny macOS menu bar app. Click the icon in the menu bar (or press a global
hotkey) and a small popover-style window drops down. Whatever you type (or
dictate with Wispr Flow) into the input becomes a checklist item. Items carry a
priority (High / Medium / Low) and the list is shown in priority sections, with
a collapsible Done section at the bottom. That's the whole product for v1.

Not a full-window app. No accounts, no sync, no cloud. Local only.

## Approaches considered

| Option | Pros | Cons |
| --- | --- | --- |
| **Tauri v2 + React + Tailwind + the UI kit (chosen)** | ~10 MB app, low RAM, native tray + window APIs, the UI kit/Tailwind as requested, Rust side is ~100 lines | Needs Rust toolchain (installed via rustup) |
| Electron + React + Tailwind + the UI kit | Zero new toolchains, huge ecosystem (`menubar` pkg) | ~200 MB app, 100–200 MB RAM for a utility that sits in the menu bar all day |
| Native SwiftUI + MenuBarExtra | Most native, WidgetKit possible later | User explicitly asked for Tailwind + a Radix-based UI kit; those are web-only |

Tauri wins on product fit (lightweight, always-resident utility) while still
letting the UI be built with Tailwind + a Radix-based UI kit exactly as asked. The "widget"
idea (WidgetKit) is out of reach for both Tauri and Electron and is deferred.

## Architecture

```
┌──────────────────────────────────────────────────────┐
│ macOS                                                │
│  ┌───────────┐   click / ⌥⇧Space   ┌───────────────┐ │
│  │ Tray icon │ ───────────────────▶│ Popover window│ │
│  └───────────┘                     │ 360×520, no   │ │
│        ▲                           │ titlebar,     │ │
│        │ tauri (Rust)              │ vibrancy      │ │
│        │  • tray + placement       │  ┌──────────┐ │ │
│        │  • global shortcut        │  │ React UI │ │ │
│        │  • hide on blur (unless   │  │ the UI kit + │ │ │
│        │    pinned)                │  │ Tailwind │ │ │
│        │  • Accessory activation   │  └────┬─────┘ │ │
│        │    (no Dock icon)         │       │ store │ │
│        │                           └───────┼───────┘ │
│        │                                   ▼         │
│        │              ~/Library/Application Support/  │
│        └────────────  dev.tanuja.batch/todos.json     │
└──────────────────────────────────────────────────────┘
```

### Rust side (`src-tauri/`)

- Window placement: `TrayIcon::rect()` → centre the window under the icon,
  clamped to the monitor (no positioner plugin needed; it can't position from a
  hotkey before the tray has been hovered).
- `tauri-plugin-global-shortcut` — `⌥⇧Space` toggles the window. Constant in
  one place so it's trivial to change.
- `tauri-plugin-store` — JSON persistence.
- `window-vibrancy` — native `NSVisualEffectView` popover material so the
  window looks like a system popover in light and dark.
- App runs with `ActivationPolicy::Accessory` (menu bar only, no Dock icon).
- Window hides on blur unless "pinned". Pin state is sent from the UI via a
  Tauri command (`set_pinned`) and read in the blur handler.
- Tray left-click → toggle. Tray right-click → small native menu: Show, Quit.

### React side (`src/`)

- `lib/todos.ts` — pure, tested domain logic: `Todo` type, `Priority`,
  `addTodo`, `toggleDone`, `cyclePriority`, `setPriority`, `updateText`,
  `removeTodo`, `clearDone`, `groupByPriority`, `parseInput` (newline-separated
  paste → several items).
- `store/useTodos.ts` — React hook wrapping the reducer + `@tauri-apps/plugin-store`
  load/save (debounced). Falls back to `localStorage` when not running inside
  Tauri so the UI can be developed/tested in a plain browser.
- Components (the UI kit): `button`, `input`, `checkbox`, `badge`,
  `dropdown-menu`, `scroll-area`, `tooltip`, `toggle-group`, `separator`.
- `App.tsx` — layout: header (drag region, pin toggle, overflow menu),
  capture input + priority segmented control, sectioned list, Done section.

## UI

```
┌────────────────────────────────┐
│ ✓ Batch                  📌  ⋯ │  ← drag region · pin · menu (Clear done, Quit)
│ ┌────────────────────────────┐ │
│ │ What needs doing?        ↵ │ │  ← autofocus on show, Enter adds, Esc hides
│ └────────────────────────────┘ │
│  ● High   ● Medium   ● Low     │  ← segmented control, ⌘1/⌘2/⌘3
│                                │
│ HIGH ·························2│
│ ☐ Ship the design review     × │
│ ☐ Call the landlord          × │
│ MEDIUM ·······················1│
│ ☐ Buy groceries              × │
│ LOW ··························0│
│   Nothing here                 │
│                                │
│ ▸ Done (3)                Clear│
└────────────────────────────────┘
```

Item interactions: checkbox toggles done; click the coloured priority dot to
cycle High → Medium → Low; double-click text to edit inline (Enter saves, Esc
cancels); hover shows ×. Empty state on first launch: one line of guidance.

Priority colours: High = red-ish, Medium = amber, Low = slate/blue. Use the UI kit
tokens for everything else so light/dark follow the system.

Keyboard: `Enter` add · `⌘1/2/3` set priority for the next item · `Esc` clear
input, second `Esc` hides window · `⌘W` hides · `⌘⇧⌫` clears done · `⌘Q` quits.

## Data

```ts
type Priority = "high" | "medium" | "low";
interface Todo {
  id: string;         // crypto.randomUUID()
  text: string;
  priority: Priority;
  done: boolean;
  createdAt: number;  // epoch ms
  completedAt?: number;
}
```

Stored as `{ version: 1, todos: Todo[] }` under key `state` in `todos.json`.
Order inside a section: newest first for open items; most recently completed
first in Done.

## Error handling

- Store load failure → start empty, log to console, don't crash.
- Store save is debounced 250 ms and awaited on window hide.
- Global shortcut registration failure (already taken) → app still works via
  tray click; logged.

## Testing

- `vitest` unit tests for `lib/todos.ts` (every reducer + `parseInput` +
  `groupByPriority`).
- Manual: `bun run tauri dev`, click tray, add/complete/cycle/edit/delete,
  quit and relaunch to confirm persistence.

## Out of scope for v1 (explicitly deferred)

Widget (WidgetKit), launch at login, iCloud/sync, due dates, tags beyond
priority, natural-language priority parsing ("… high priority" → High),
notifications, custom hotkey UI, auto-update.

## Assumptions made (please confirm or redirect)

1. "a to-do list and a give section" was read as "…and it can give sections",
   i.e. the list is sectioned by priority, plus a Done section.
2. Three priority levels (High/Medium/Low), default Medium.
3. Tauri over Electron; Rust installed via rustup as part of setup.
4. Global hotkey `⌥⇧Space` (Option+Shift+Space) — chosen to avoid Raycast /
   Alfred / Spotlight / Wispr defaults; one-line change.
5. App name "Batch" (from the folder), bundle id `dev.tanuja.batch`.
6. Package manager: bun (installed, fast).
