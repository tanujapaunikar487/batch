import { useEffect, useState } from "react";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";
import { type ActionId, ACTIONS, CUSTOMIZABLE_ACTIONS, DEFAULT_KEYMAP, DEFAULT_TOGGLE_SHORTCUT } from "@/lib/shortcuts";
import { type SettingsApi } from "@/store/useSettings";
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
  const [trusted, setTrusted] = useState<boolean | null>(null);
  const [autostart, setAutostart] = useState<boolean | null>(null);
  const [notesPath, setNotesPath] = useState<string>("");

  useEffect(() => {
    if (!inTauri) return;
    let alive = true;
    const poll = async () => {
      const t = await native.accessibilityStatus();
      if (alive) setTrusted(t ?? false);
    };
    void poll();
    const id = window.setInterval(poll, 2000);
    void native.notesFilePath().then((p) => alive && setNotesPath(p ?? ""));
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
      <div className="flex items-center gap-1 px-3 pb-1">
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label="Back">
          <ArrowLeft className="size-4" />
        </Button>
        <h2 className="text-sm font-semibold">Settings</h2>
        <span className="ml-auto text-[11px] text-muted-foreground">Esc to close</span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <Group title="General">
          <Row label="Launch at login" hint={inTauri ? undefined : "Available in the Mac app"}>
            <Switch checked={!!autostart} disabled={!inTauri || autostart === null} onCheckedChange={toggleAutostart} />
          </Row>
          <Row
            label="Double-Shift to open"
            hint={
              !inTauri
                ? "Available in the Mac app"
                : trusted === false
                  ? "Needs Accessibility access"
                  : "Tap Shift twice from any app"
            }
          >
            <div className="flex items-center gap-2">
              {inTauri && trusted === false && (
                <Button size="xs" variant="outline" onClick={() => void native.requestAccessibility()}>
                  Grant access
                </Button>
              )}
              {inTauri && trusted && (
                <span className="rounded-full bg-emerald-500/15 px-1.5 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-400">
                  Granted
                </span>
              )}
              <Switch checked={settings.settings.doubleShift} disabled={!inTauri} onCheckedChange={settings.setDoubleShift} />
            </div>
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
          <p className="pt-1 text-[11px] text-muted-foreground">
            Fixed: ⌘1–9 sections · ↑↓ browse · Space done · ↩ edit · ⌫ delete · 1/2/3 priority · ⌘A · ⌘C · ⌘Z · ⌘, · ⌘/
          </p>
        </Group>

        <Group title="Your data">
          <p className="text-xs text-muted-foreground">
            {noteCount} note{noteCount === 1 ? "" : "s"} in {sectionCount} section{sectionCount === 1 ? "" : "s"}. Everything is
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
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
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
        <div className="text-xs">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground">{hint}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}
