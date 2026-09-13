import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Monitor, Moon, Search, Sun } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type ActionId, ACTIONS, CUSTOMIZABLE_ACTIONS, DEFAULT_KEYMAP, DEFAULT_SCREENSHOT_SHORTCUT, DEFAULT_TOGGLE_SHORTCUT, formatBinding } from "@/lib/shortcuts";
import { type SettingsApi, type ThemePref } from "@/store/useSettings";
import { native } from "@/lib/native";
import { isTauri } from "@/store/persistence";
import { ShortcutRecorder } from "./ShortcutRecorder";

interface Props {
  settings: SettingsApi;
  noteCount: number;
  sectionCount: number;
  onBack: () => void;
  onOpenHelp: () => void;
  onResetPosition: () => void;
  onExport: (what: "folder-md" | "all-md" | "json" | "folder-bundle" | "all-bundle") => void;
  onImport: () => void;
  backups: { name: string; path: string; bytes: number; date: string }[];
  onOpenBackups: () => void;
  onRestoreBackup: (b: { path: string; date: string }) => void;
}

const NAV = [
  ["general", "General"],
  ["agents", "Agents (MCP)"],
  ["capture", "Capture"],
  ["shortcuts", "Shortcuts"],
  ["data", "Your data"],
] as const;
type SectionId = (typeof NAV)[number][0];

export function SettingsPanel({
  settings,
  noteCount,
  sectionCount,
  onBack,
  onOpenHelp,
  onResetPosition,
  onExport,
  onImport,
  backups,
  onOpenBackups,
  onRestoreBackup,
}: Props) {
  const inTauri = isTauri();
  const [ds, setDs] = useState<{ active: boolean; granted: boolean } | null>(null);
  const [axTrusted, setAxTrusted] = useState<boolean | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [notesPath, setNotesPath] = useState<string>("");
  const [mcpPath, setMcpPath] = useState<string | null>(null);
  const [copiedMcp, setCopiedMcp] = useState(false);
  const [activeNav, setActiveNav] = useState<SectionId>("general");
  const [q, setQ] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Partial<Record<SectionId, HTMLElement | null>>>({});
  const clickScroll = useRef(false);

  useEffect(() => {
    if (!inTauri) return;
    let alive = true;
    const poll = async () => {
      const st = await native.doubleShiftStatus();
      if (alive && st) setDs({ active: st.active, granted: st.granted });
      const ax = await native.accessibilityTrusted();
      if (alive && typeof ax === "boolean") setAxTrusted(ax);
    };
    void poll();
    const id = window.setInterval(poll, 2000);
    void native.notesFilePath().then((p) => alive && setNotesPath(p ?? ""));
    void native.mcpPath().then((p) => alive && setMcpPath(p ?? null));
    import("@tauri-apps/plugin-autostart")
      .then((m) => m.isEnabled())
      .then((v) => alive && setAutostart(v))
      .catch(() => alive && setAutostart(null));
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [inTauri]);

  const toggleAutostart = async (on: boolean) => {
    setAutostart(on);
    try {
      const m = await import("@tauri-apps/plugin-autostart");
      if (on) await m.enable();
      else await m.disable();
    } catch (e) {
      console.error("[batch] autostart:", e);
      setAutostart(!on);
    }
  };

  const { keymap, setBinding, resetKeymap } = settings;
  const duplicateOf = (binding: string, except: ActionId | "toggle") =>
    (Object.keys(keymap) as ActionId[]).find((a) => a !== except && keymap[a] === binding);

  const qx = q.trim().toLowerCase();
  const m = (...texts: (string | undefined)[]) => !qx || texts.some((t) => t?.toLowerCase().includes(qx));
  const shortcutHits = CUSTOMIZABLE_ACTIONS.filter((a) => m(ACTIONS[a].label));
  const rows = {
    appearance: m("appearance", "theme", "system light dark"),
    autostart: m("launch at login", "autostart"),
    copyList: m("copy as list marks notes done", "handed off"),
    toggleHotkey: m("toggle hotkey", "system-wide", "show hide"),
    windowPosition: m("window position", "snap under menu-bar icon", "off-screen"),
    doubleShift: m("double-shift to open", "input monitoring"),
    captureSel: m("capture selected text", "accessibility"),
    captureSrc: m("remember where a capture came from", "source app window"),
    regionHotkey: m("screen-region hotkey", "screenshot", "drag a box"),
    allShortcuts: m("keyboard shortcuts", "full list"),
    agents: m("agents", "mcp", "claude cursor codex", "connect", "server"),
    data: m("your data", "notes folder", "local file", "reveal", "sync"),
    backup: m("export", "import", "backup", "restore", "json", "markdown"),
  };
  const showSection: Record<SectionId, boolean> = {
    general: m("general") || rows.appearance || rows.autostart || rows.copyList || rows.toggleHotkey || rows.windowPosition,
    capture: m("capture") || rows.doubleShift || rows.captureSel || rows.captureSrc || rows.regionHotkey,
    shortcuts: m("shortcuts") || shortcutHits.length > 0 || rows.allShortcuts,
    agents: rows.agents,
    data: rows.data || rows.backup,
  };
  const anyHit = (Object.keys(showSection) as SectionId[]).some((k) => showSection[k]);

  const goTo = (id: SectionId) => {
    setActiveNav(id);
    clickScroll.current = true;
    sectionRefs.current[id]?.scrollIntoView({ block: "start" });
    window.setTimeout(() => (clickScroll.current = false), 300);
  };

  /** Highlight the section nearest the top of the viewport while scrolling. */
  const onScroll = () => {
    if (clickScroll.current) return;
    const top = scrollRef.current?.getBoundingClientRect().top ?? 0;
    let best: SectionId = "general";
    for (const [id] of NAV) {
      const el = sectionRefs.current[id];
      if (el && el.getBoundingClientRect().top - top <= 40) best = id;
    }
    setActiveNav(best);
  };

  const group = (id: SectionId, title: string, action: React.ReactNode, children: React.ReactNode) => (
    <section
      ref={(el) => {
        sectionRefs.current[id] = el;
      }}
      className="scroll-mt-2 pb-6"
    >
      <div className="mb-2 flex items-end">
        <h3 className="text-sm font-semibold">{title}</h3>
        <div className="ml-auto">{action}</div>
      </div>
      <div className="divide-y divide-border/50 rounded-xl border border-border/60 bg-foreground/[0.02] px-4 dark:bg-input/20">
        {children}
      </div>
    </section>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1">
        <nav className="flex w-40 shrink-0 flex-col gap-0.5 overflow-y-auto py-3 pl-4 pr-2" aria-label="Settings sections">
          <button
            type="button"
            onClick={onBack}
            className="mb-2 flex items-center gap-1.5 px-1 text-[13px] font-medium text-foreground hover:text-muted-foreground"
          >
            <ArrowLeft className="size-3.5" /> Back to app
          </button>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape" && q) {
                  e.preventDefault();
                  e.stopPropagation();
                  setQ("");
                }
              }}
              placeholder="Search settings…"
              aria-label="Search settings"
              className="h-7 pl-7 text-sm"
            />
          </div>
          {NAV.filter(([id]) => (id !== "agents" || inTauri) && (!qx || showSection[id])).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => goTo(id)}
              aria-current={activeNav === id}
              className={cn(
                "block w-full rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors",
                activeNav === id
                  ? "bg-foreground/[0.06] font-medium text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </nav>

        <div ref={scrollRef} onScroll={onScroll} className="min-h-0 min-w-0 flex-1 overflow-y-auto py-2 pl-2 pr-5">
          <div className="mx-auto w-full max-w-[500px]">
          <h1 className="mb-3 px-1 text-base font-semibold">Settings</h1>
          {qx && !anyHit && (
            <p className="px-1 py-6 text-center text-xs text-muted-foreground">Nothing in Settings matches “{q}”.</p>
          )}
          {showSection.general && group(
            "general",
            "General",
            null,
            <>
              {rows.appearance && (
              <Row label="Appearance" hint="System follows macOS">
                <div className="flex items-center rounded-md border border-input bg-background/60 p-0.5 dark:bg-input/40" role="radiogroup" aria-label="Appearance">
                  {(
                    [
                      ["system", "System", <Monitor key="s" className="size-3" />],
                      ["light", "Light", <Sun key="l" className="size-3" />],
                      ["dark", "Dark", <Moon key="d" className="size-3" />],
                    ] as [ThemePref, string, React.ReactNode][]
                  ).map(([v, label, icon]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={settings.settings.theme === v}
                      onClick={() => settings.setTheme(v)}
                      className={cn(
                        "flex h-5 items-center gap-1 rounded px-1.5 text-[11px] transition-colors",
                        settings.settings.theme === v
                          ? "bg-foreground/[0.08] text-foreground dark:bg-foreground/[0.12]"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {icon} {label}
                    </button>
                  ))}
                </div>
              </Row>
              )}
              {rows.autostart && (
              <Row label="Launch at login" hint={inTauri ? undefined : "Available in the Mac app"}>
                <Switch checked={!!autostart} disabled={!inTauri || autostart === null} onCheckedChange={toggleAutostart} />
              </Row>
              )}
              {rows.copyList && (
              <Row label="Copy as List marks notes done" hint="They've been handed off; ⌘Z brings them back">
                <Switch checked={settings.settings.copyListMarksDone} onCheckedChange={settings.setCopyListMarksDone} />
              </Row>
              )}
              {rows.toggleHotkey && (
              <Row label="Toggle hotkey" hint="System-wide; shows or hides Batch">
                <ShortcutRecorder
                  value={settings.settings.toggleShortcut}
                  defaultValue={DEFAULT_TOGGLE_SHORTCUT}
                  requireModifier
                  onChange={async (b) => {
                    if (duplicateOf(b, "toggle")) return "Used in-app";
                    const ok = await settings.setToggleShortcut(b);
                    return ok ? null : "Taken by another app";
                  }}
                  onReset={() => void settings.setToggleShortcut(DEFAULT_TOGGLE_SHORTCUT)}
                />
              </Row>
              )}
              {rows.windowPosition && inTauri && (
              <Row label="Window position" hint="If it's off-screen or dragged away">
                <Button size="xs" variant="outline" onClick={onResetPosition}>
                  Snap under menu-bar icon
                </Button>
              </Row>
              )}
            </>,
          )}

          {inTauri &&
            showSection.agents &&
            group(
              "agents",
              "Agents (MCP)",
              null,
              <div className="py-3">
                <p className="text-xs leading-5 text-muted-foreground">
                  Connect Claude Code, Cursor or Codex once and it reads your notes itself, writes
                  each answer under its note, and ticks it off — live in the app, no pasting.
                  A local server edits the same file; nothing leaves your Mac.
                </p>
                {mcpPath ? (
                  <div className="mt-2 flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded bg-foreground/[0.05] px-1.5 py-1 text-xs" title={`claude mcp add batch -- ${mcpPath}`}>
                      claude mcp add batch -- {mcpPath}
                    </code>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(`claude mcp add batch -- ${mcpPath}`);
                          setCopiedMcp(true);
                          window.setTimeout(() => setCopiedMcp(false), 1200);
                        } catch {
                          /* ignore */
                        }
                      }}
                    >
                      {copiedMcp ? <Check className="size-3" /> : <Copy className="size-3" />} Copy
                    </Button>
                  </div>
                ) : (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    The bundled <code>batch-mcp</code> server wasn’t found (dev build?). It ships inside the released app.
                  </p>
                )}
              </div>,
            )}

          {showSection.capture && group(
            "capture",
            "Capture",
            null,
            <>
              {rows.doubleShift && (
              <Row
                label="Double-Shift to open"
                hint={
                  !inTauri
                    ? "Available in the Mac app"
                    : !settings.settings.doubleShift
                      ? "Tap Shift twice from any app"
                      : ds?.active
                        ? "Listening — tap Shift twice from any app"
                        : ds?.granted
                          ? "Access granted — relaunch Batch to enable"
                          : "Needs Input Monitoring access"
                }
              >
                <div className="flex items-center gap-2">
                  {inTauri && settings.settings.doubleShift && ds && !ds.active && !ds.granted && (
                    <Button size="xs" variant="outline" onClick={() => void native.requestAccessibility()}>
                      Grant access
                    </Button>
                  )}
                  {inTauri && settings.settings.doubleShift && ds && !ds.active && ds.granted && (
                    <Button size="xs" variant="outline" onClick={() => void native.relaunch()}>
                      Relaunch
                    </Button>
                  )}
                  {inTauri && ds?.active && (
                    <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                      Active
                    </span>
                  )}
                  <Switch checked={settings.settings.doubleShift} disabled={!inTauri} onCheckedChange={settings.setDoubleShift} />
                </div>
              </Row>
              )}
              {rows.captureSel && (
              <Row
                label="Capture selected text on ⇧⇧"
                hint={
                  !inTauri
                    ? "Available in the Mac app"
                    : axTrusted === false
                      ? "Needs Accessibility access (to send ⌘C to the other app)"
                      : "Select text in any app, tap Shift twice — it lands in the box"
                }
              >
                <div className="flex items-center gap-2">
                  {inTauri && axTrusted === false && settings.settings.captureSelection && (
                    <Button size="xs" variant="outline" onClick={() => void native.requestAccessibilityPermission()}>
                      Grant access
                    </Button>
                  )}
                  <Switch
                    checked={settings.settings.captureSelection}
                    disabled={!inTauri}
                    onCheckedChange={settings.setCaptureSelection}
                  />
                </div>
              </Row>
              )}
              {rows.captureSrc && (
              <Row label="Remember where a ⇧⇧ capture came from" hint="Shows the app/window on the note">
                <Switch
                  checked={settings.settings.captureSource}
                  disabled={!inTauri}
                  onCheckedChange={settings.setCaptureSource}
                />
              </Row>
              )}
              {rows.regionHotkey && (
              <Row label="Screen-region hotkey" hint="Drag a box; the shot lands in the capture box">
                <ShortcutRecorder
                  value={settings.settings.screenshotShortcut}
                  defaultValue={DEFAULT_SCREENSHOT_SHORTCUT}
                  requireModifier
                  onChange={async (b) => {
                    if (duplicateOf(b, "toggle")) return "Used in-app";
                    const ok = await settings.setScreenshotShortcut(b);
                    return ok ? null : "Taken by another app";
                  }}
                  onReset={() => void settings.setScreenshotShortcut(DEFAULT_SCREENSHOT_SHORTCUT)}
                />
              </Row>
              )}
            </>,
          )}

          {showSection.shortcuts && group(
            "shortcuts",
            "Shortcuts",
            Object.keys(settings.settings.keymap).length > 0 ? (
              <button type="button" onClick={resetKeymap} className="text-[11px] text-muted-foreground hover:text-foreground">
                Reset all
              </button>
            ) : null,
            <>
              {shortcutHits.map((a) => (
                <Row key={a} label={ACTIONS[a].label}>
                  <ShortcutRecorder
                    value={keymap[a]}
                    defaultValue={DEFAULT_KEYMAP[a]}
                    onChange={(b) => {
                      const dup = duplicateOf(b, a);
                      if (dup) return `Used by “${ACTIONS[dup].label}”`;
                      if (b === settings.settings.toggleShortcut) return "Used by toggle hotkey";
                      setBinding(a, b);
                      return null;
                    }}
                    onReset={() => setBinding(a, null)}
                  />
                </Row>
              ))}
              {rows.allShortcuts && (
              <Row label="All shortcuts" hint="Fixed ones too — browse, star, sections, edit, delete…">
                <Button size="xs" variant="outline" onClick={onOpenHelp}>
                  View  {formatBinding(keymap.help)}
                </Button>
              </Row>
              )}
            </>,
          )}

          {showSection.data && group(
            "data",
            "Your data",
            null,
            <div className="py-3">
              <p className="text-xs leading-5 text-muted-foreground">
                {noteCount} note{noteCount === 1 ? "" : "s"} in {sectionCount} folder{sectionCount === 1 ? "" : "s"}. Everything is
                stored in one local file. Nothing syncs, nothing is tracked, no account.
              </p>
              {inTauri && (
                <div className="mt-2 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-foreground/[0.05] px-1.5 py-0.5 text-xs" title={notesPath}>
                    {notesPath || "…"}
                  </code>
                  <Button size="xs" variant="outline" onClick={() => void native.revealNotesFile()}>
                    <ExternalLink className="size-3" /> Reveal
                  </Button>
                </div>
              )}
              {rows.backup && inTauri && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button size="xs" variant="outline">Export…</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start">
                      <DropdownMenuItem onSelect={() => onExport("folder-md")}>This folder as Markdown…</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onExport("folder-bundle")}>This folder as Markdown + images…</DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onSelect={() => onExport("all-md")}>Everything as Markdown…</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onExport("all-bundle")}>Everything as Markdown + images…</DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => onExport("json")}>Everything as JSON (backup)…</DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <Button size="xs" variant="outline" onClick={onImport}>Import JSON…</Button>
                  <DropdownMenu onOpenChange={(o) => o && onOpenBackups()}>
                    <DropdownMenuTrigger asChild>
                      <Button size="xs" variant="outline">Restore backup…</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="min-w-48">
                      {backups.length === 0 ? (
                        <DropdownMenuItem disabled>No backups yet (one is kept per day)</DropdownMenuItem>
                      ) : (
                        backups.map((b) => (
                          <DropdownMenuItem key={b.name} onSelect={() => onRestoreBackup(b)}>
                            {b.date}
                            <DropdownMenuShortcut>{Math.max(1, Math.round(b.bytes / 1024))} KB</DropdownMenuShortcut>
                          </DropdownMenuItem>
                        ))
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
            </div>,
          )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-8 items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
