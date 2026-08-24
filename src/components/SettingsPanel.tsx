import { useEffect, useState } from "react";
import { ArrowLeft, Check, Copy, ExternalLink, Monitor, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { type ActionId, ACTIONS, CUSTOMIZABLE_ACTIONS, DEFAULT_KEYMAP, DEFAULT_SCREENSHOT_SHORTCUT, DEFAULT_TOGGLE_SHORTCUT } from "@/lib/shortcuts";
import { type SettingsApi, type ThemePref } from "@/store/useSettings";
import { native } from "@/lib/native";
import { isTauri } from "@/store/persistence";
import { ShortcutRecorder } from "./ShortcutRecorder";

interface Props {
  settings: SettingsApi;
  noteCount: number;
  sectionCount: number;
  onBack: () => void;
}

export function SettingsPanel({ settings, noteCount, sectionCount, onBack }: Props) {
  const inTauri = isTauri();
  const [ds, setDs] = useState<{ active: boolean; granted: boolean } | null>(null);
  const [axTrusted, setAxTrusted] = useState<boolean | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [notesPath, setNotesPath] = useState<string>("");
  const [mcpPath, setMcpPath] = useState<string | null>(null);
  const [copiedMcp, setCopiedMcp] = useState(false);

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

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center gap-1 px-4 pb-1">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-sm font-semibold">Settings</h2>
        <span className="ml-auto text-xs text-muted-foreground">Esc to close</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">
        <Group title="General">
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
          <Row label="Launch at login" hint={inTauri ? undefined : "Available in the Mac app"}>
            <Switch checked={!!autostart} disabled={!inTauri || autostart === null} onCheckedChange={toggleAutostart} />
          </Row>
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
          <Row label="Remember where a ⇧⇧ capture came from" hint="Shows the app/window on the note">
            <Switch
              checked={settings.settings.captureSource}
              disabled={!inTauri}
              onCheckedChange={settings.setCaptureSource}
            />
          </Row>
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
          <Row label="Copy as List marks notes done" hint="They've been handed off; ⌘Z brings them back">
            <Switch checked={settings.settings.copyListMarksDone} onCheckedChange={settings.setCopyListMarksDone} />
          </Row>
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
        </Group>

        <Group
          title="Shortcuts"
          action={
            Object.keys(settings.settings.keymap).length > 0 ? (
              <button type="button" onClick={resetKeymap} className="text-[11px] text-muted-foreground hover:text-foreground">
                Reset all
              </button>
            ) : null
          }
        >
          {CUSTOMIZABLE_ACTIONS.map((a) => (
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
          <p className="pt-1 text-xs leading-5 text-muted-foreground">
            Fixed: ⌘1–9 sections · ↑↓ browse · Space done · ↩ edit · ⌫ delete · 1/2/3 priority · ⌘A · ⌘C · ⌘Z · ⌘, · ⌘/
          </p>
        </Group>

        {inTauri && (
          <Group title="Agents (MCP)">
            <p className="text-xs leading-5 text-muted-foreground">
              Let Claude Code, Cursor or Codex read and tick off your notes. They talk to a local
              server that edits the same file — nothing leaves your Mac.
            </p>
            {mcpPath ? (
              <div className="mt-1.5 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-foreground/[0.05] px-1.5 py-1 text-[10px]" title={`claude mcp add batch -- ${mcpPath}`}>
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
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                The bundled <code>batch-mcp</code> server wasn’t found (dev build?). It ships inside the released app.
              </p>
            )}
          </Group>
        )}

        <Group title="Your data">
          <p className="text-xs leading-5 text-muted-foreground">
            {noteCount} note{noteCount === 1 ? "" : "s"} in {sectionCount} folder{sectionCount === 1 ? "" : "s"}. Everything is
            stored in one local file. Nothing syncs, nothing is tracked, no account.
          </p>
          {inTauri && (
            <div className="mt-1.5 flex items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-foreground/[0.05] px-1.5 py-0.5 text-[10px]" title={notesPath}>
                {notesPath || "…"}
              </code>
              <Button size="xs" variant="outline" onClick={() => void native.revealNotesFile()}>
                <ExternalLink className="size-3" /> Reveal
              </Button>
            </div>
          )}
        </Group>
      </div>
    </div>
  );
}

function Group({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mb-4">
      <div className="mb-1.5 flex items-center">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <div className="ml-auto">{action}</div>
      </div>
      <div className="flex flex-col">{children}</div>
      <Separator className="mt-3 opacity-60" />
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className={cn("flex min-h-8 items-center gap-3 py-1")}>
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{label}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
