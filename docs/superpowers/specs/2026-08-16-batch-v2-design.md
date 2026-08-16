# Batch v2 — capture, sections, keyboard-first

**Date:** 2026-08-16 · supersedes the v1 spec (priority-sectioned checklist).

## Why v2

The reference product ("Batch" — a to-do list + clipboard + scratchpad for
AI-assisted work) defines the target USPs:

Merge Notes · Sections · Markdown · Copy as List · Search · Custom Shortcuts ·
Local Files · No Tracking · No Account · Free Updates · Keyboard-First ·
Native Mac App.

Core loop: hit **Shift twice** anywhere → Batch pops up with the input focused
→ type/paste the thing (a prompt, an answer, a link) → ↵. Later: arrow to a
note, **⌘C** it into ChatGPT/Claude/Cursor, check it off. Select several →
**⌘C** copies them as a list; **⌘M** merges them into one note.

## Decisions

| Area | Decision |
| --- | --- |
| Organisation | **Sections** (tabs) are primary; every note lives in exactly one. Default section "Inbox". `⌘1…9` switch, `⌘⇧N` new, double-click rename, right-click menu (rename / copy as list / clear done / delete → notes go to Inbox). |
| Priority | Kept from v1 as a per-note attribute (High/Med/Low dot). Set with `1/2/3` when a note is selected. Not a grouping. |
| Order | Oldest first within a section (a checklist reads top-down in the order you wrote it). Copy-as-list and merge follow this order. The list is flat: open notes, a hairline, then done notes (most recently completed first). No headers. |
| Filters | `⌘⇧F` reveals a chip row: Status (All/Open/Done) · Priority · Type (Links/Code/Text — detected from the text) · When (Today/7 days — created, or completed for done notes). Filters combine with search and with the current section. |
| Notes | Multi-line Markdown. Capture box is a textarea: `↵` saves, `⇧↵` newline. Paste keeps one note. Rendered with react-markdown + GFM; `↵`/double-click to edit in place. Links open in the browser. |
| Selection | List has a cursor. `↓/↑` move, `⇧↓/↑` extend, `⌘A` all, click / ⌘-click / ⇧-click. `Esc` clears → back to input. |
| Copy | `⌘C`: one note → its text; several → Markdown bullet list. `⌘⇧C`: whole section as a list. Toast "Copied". |
| Merge | `⌘M` on 2+ selected → one note, texts joined by a blank line, earliest `createdAt`, first note's section; others removed. |
| Search | `⌘F` swaps the tab row for a search field; filters across all sections; results show a section pill. `Esc` exits. |
| Undo | `⌘Z` / `⌘⇧Z` for every note mutation (in-memory history, 50 steps). |
| Custom shortcuts | Settings (`⌘,`) → click a binding, press keys, saved to `settings.json`. Customisable: global toggle hotkey, new section, search, copy section as list, merge, clear done, move note to next/prev section, pin. Others fixed. |
| Capture hotkeys | (1) **Double-Shift** via a CGEventTap listening to `flagsChanged` (needs Accessibility; app shows a one-line banner with a "Grant access" button until granted). (2) Configurable combo, default `⌥⇧Space`, via tauri-plugin-global-shortcut. Either toggles the popover; on show the input is focused. |
| Local files | `notes.json` + `settings.json` in `~/Library/Application Support/dev.tanuja.batch/`. "Reveal notes file" in the ⋯ menu. v1 `todos.json` is migrated into "Inbox" on first run. |
| No tracking / no account | Nothing phones home. No updater in this personal build ("Free updates" = rebuild from source). |
| Native | Tauri menu-bar app, vibrancy, no Dock icon, launch-at-login toggle (tauri-plugin-autostart). |

## UI (380×560, resizable)

```
┌────────────────────────────────────────┐
│ ✓ Batch                     🔍  📌  ⋯  │ header (drag) · search · pin · menu
│ [Inbox 4] [Prompts 2] [Links] [+]      │ section tabs, scroll-x, ⌘1…9
│ ┌────────────────────────────────────┐ │
│ │ Capture to Inbox…                  │ │ textarea, autogrow ≤6 lines
│ └────────────────────────────────────┘ │
│────────────────────────────────────────│
│ ☐ Explain the tradeoffs of RSC vs …  ● │ ● = priority dot (hover: flag, ×, ⋯)
│ ☐ https://…                            │
│ ☐ **Follow-up:** ask about caching     │
│ ▸ Done 3                        Clear  │
│────────────────────────────────────────│
│ 2 selected  ⌘C copy list · ⌘M merge    │ contextual footer (also shows "Copied")
└────────────────────────────────────────┘
```

Settings replaces the list area (back arrow / `Esc`): General (launch at
login, double-Shift toggle + accessibility status, toggle hotkey recorder),
Shortcuts (recorders), Data (file path, Reveal, note count).

`⌘/` shows a shortcuts cheat-sheet.

## Data

```ts
interface Section { id: string; name: string; createdAt: number }
interface Note {
  id: string; sectionId: string; text: string; priority: "high"|"medium"|"low";
  done: boolean; createdAt: number; completedAt?: number;
}
interface NotesState { version: 2; sections: Section[]; notes: Note[] }
interface Settings {
  version: 1; toggleShortcut: string /* "Alt+Shift+Space" */; doubleShift: boolean;
  keymap: Partial<Record<ActionId, string /* "mod+shift+n" */>>;
}
```

Shortcut bindings are stored by `KeyboardEvent.code` ("mod+shift+KeyN") so they
survive ⌥-layouts; displayed as ⌘⇧N.

## Modules

- `lib/notes.ts` — reducer (add, toggle, edit, remove, setPriority, move,
  merge, clearDone, addSection, renameSection, removeSection), selectors
  (bySection, search), `migrateFromV1`, `normalize`. Tested.
- `lib/format.ts` — `asList(notes)`, `mergeText(notes)`. Tested.
- `lib/shortcuts.ts` — parse/format/match bindings, defaults, `toTauriShortcut`.
  Tested.
- `lib/history.ts` — undo/redo wrapper for any reducer. Tested.
- `store/persistence.ts` — notes + settings stores, v1 migration.
- `store/useNotes.ts`, `store/useSettings.ts`, `hooks/useListNav.ts`.
- `components/…` — Header, SectionTabs, CaptureBox, NoteList/NoteRow, SearchBar,
  Footer, SettingsPanel, ShortcutRecorder, HelpSheet, AccessibilityBanner.
- Rust: `double_shift.rs` (event tap thread), commands `accessibility_status`,
  `request_accessibility`, `set_toggle_shortcut`, `reveal_notes_file`;
  reads `settings.json` at startup for the hotkey + double-shift flag.

## Out of scope (still)

Widget, sync, due dates, tags, drag-reorder, capture-selected-text via
simulated ⌘C (follow-up: it's the natural next step for double-Shift), updater.
