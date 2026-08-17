# Contributing to Batch

Thanks for helping! Batch is a small, local-only macOS menu-bar app: Tauri v2 (Rust)
+ React + Tailwind v4 + shadcn/ui.

## Setup

```sh
# Requirements: macOS 12+, Xcode Command Line Tools, Bun, Rust (rustup)
bun install
bun run app:dev        # tauri dev — the popover opens automatically in dev builds
bun run test           # vitest (domain logic + hooks)
bun run typecheck
```

Web-only preview without the native shell: `bun run dev` → http://localhost:1420/?seed=1

Debug builds log to `$TMPDIR/batch-dev.log` (`getconf DARWIN_USER_TEMP_DIR`).

## Where things live

- `src/lib/*` — pure, tested domain logic (notes, filters, formatting, shortcuts, history, export)
- `src/store/*` — persistence + React state hooks
- `src/components/*` — UI (shadcn components under `components/ui`)
- `src-tauri/src/*` — native shell: tray, hotkeys, double-Shift tap, attachments, notes file I/O
- `docs/superpowers/specs/*` — design notes

## Ground rules

- **Local only.** No network calls, analytics, or telemetry. (The single exception is
  fetching an image the user drags in from a browser.)
- Put logic in `src/lib` with tests; keep components thin.
- Keep the keyboard-first feel: every action reachable without the mouse.
- Run `bun run test && bun run typecheck && cargo fmt --manifest-path src-tauri/Cargo.toml`
  before opening a PR. Small, focused PRs are easiest to review.

## Releasing (maintainers)

`bun run dist:mac` builds a universal `.dmg` into `dist-mac/`. Pushing a `v*` tag runs
`.github/workflows/release.yml`, which builds and attaches the DMG to a GitHub Release
(signed + notarized when the `APPLE_*` secrets are set).
