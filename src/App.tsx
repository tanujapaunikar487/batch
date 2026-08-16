import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Header } from "@/components/Header";
import { SectionTabs } from "@/components/SectionTabs";
import { SearchAndFilters } from "@/components/SearchAndFilters";
import { CaptureBox, type CaptureBoxHandle } from "@/components/CaptureBox";
import { NoteList } from "@/components/NoteList";
import { Footer } from "@/components/Footer";
import { SettingsPanel } from "@/components/SettingsPanel";
import { HelpSheet } from "@/components/HelpSheet";
import { AccessibilityBanner } from "@/components/AccessibilityBanner";
import { useNotes } from "@/store/useNotes";
import { useSettings } from "@/store/useSettings";
import { isTauri } from "@/store/persistence";
import { native, onShown } from "@/lib/native";
import { useSystemTheme } from "@/hooks/useSystemTheme";
import { useListNav } from "@/hooks/useListNav";
import { useCopy } from "@/hooks/useClipboard";
import { type Priority, INBOX_ID, doneInSection, notesInSection, searchNotes, sectionById } from "@/lib/notes";
import { type Filter, EMPTY_FILTER, activeFilterCount, applyFilters } from "@/lib/filters";
import { asList, asPlainText } from "@/lib/format";
import { type ActionId, matchesEvent } from "@/lib/shortcuts";

const inTauri = isTauri();
const ACTIVE_SECTION_KEY = "batch:activeSection";
type View = "list" | "settings" | "help";
// Dev-only URL flags for previewing states in a browser: ?view=settings|help&search=foo&filters=1&section=prompts
const devParams = inTauri ? new URLSearchParams() : new URLSearchParams(location.search);

export default function App() {
  useSystemTheme();
  const notes = useNotes();
  const settings = useSettings();
  const copy = useCopy();
  const { state } = notes;

  // ── view state ──
  const [view, setView] = useState<View>((devParams.get("view") as View) || "list");
  const [activeId, setActiveId] = useState<string>(
    () => devParams.get("section") ?? localStorage.getItem(ACTIVE_SECTION_KEY) ?? INBOX_ID,
  );
  const [pinned, setPinned] = useState(false);
  const [searchOpen, setSearchOpen] = useState(devParams.has("search"));
  const [query, setQuery] = useState(devParams.get("search") ?? "");
  const [filtersOpen, setFiltersOpen] = useState(devParams.has("filters"));
  const [filter, setFilter] = useState<Filter>(EMPTY_FILTER);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [addSectionRequest, setAddSectionRequest] = useState(0);
  const [axTrusted, setAxTrusted] = useState<boolean | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const captureRef = useRef<CaptureBoxHandle>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<number | null>(null);

  // Active section must exist.
  const activeSection = sectionById(state, activeId) ?? state.sections[0];
  useEffect(() => {
    // Only reconcile once notes are loaded — before that only Inbox exists.
    if (notes.loaded && activeSection && activeSection.id !== activeId) setActiveId(activeSection.id);
  }, [notes.loaded, activeSection, activeId]);
  useEffect(() => {
    if (notes.loaded) localStorage.setItem(ACTIVE_SECTION_KEY, activeId);
  }, [notes.loaded, activeId]);

  // ── visible notes ──
  const searching = searchOpen && query.trim().length > 0;
  const { open, done } = useMemo(() => {
    if (searching) {
      const hits = applyFilters(searchNotes(state, query), filter);
      return { open: hits.filter((n) => !n.done), done: hits.filter((n) => n.done) };
    }
    return {
      open: applyFilters(notesInSection(state, activeSection.id), filter),
      done: applyFilters(doneInSection(state, activeSection.id), filter),
    };
  }, [state, searching, query, filter, activeSection.id]);
  const visibleIds = useMemo(() => [...open, ...done].map((n) => n.id), [open, done]);
  const nav = useListNav(visibleIds);
  const notesById = useMemo(() => new Map(state.notes.map((n) => [n.id, n])), [state.notes]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const n of state.notes) if (!n.done) c[n.sectionId] = (c[n.sectionId] ?? 0) + 1;
    return c;
  }, [state.notes]);
  const totalOpen = state.notes.filter((n) => !n.done).length;

  // ── helpers ──
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 1800);
  }, []);

  const focusCapture = useCallback(() => {
    requestAnimationFrame(() => captureRef.current?.focus());
  }, []);
  const focusList = useCallback(() => {
    if (visibleIds.length === 0) return;
    if (!nav.cursor) nav.focus(visibleIds[0]);
    listRef.current?.focus();
  }, [visibleIds, nav]);

  const copyNotes = useCallback(
    async (ids: string[], asListAlways = false) => {
      const picked = ids.map((id) => notesById.get(id)).filter((n): n is NonNullable<typeof n> => !!n);
      if (picked.length === 0) return;
      const text = asListAlways ? asList(picked) : asPlainText(picked);
      const ok = await copy(text);
      showToast(ok ? (picked.length > 1 ? `Copied ${picked.length} notes as list` : "Copied") : "Couldn't copy");
    },
    [notesById, copy, showToast],
  );
  const copySectionAsList = useCallback(
    (sectionId: string) => {
      const ids = notesInSection(state, sectionId).map((n) => n.id);
      if (ids.length === 0) return showToast("Nothing to copy");
      void copyNotes(ids, true);
    },
    [state, copyNotes, showToast],
  );
  const mergeSelected = useCallback(() => {
    if (nav.targets.length < 2) return showToast("Select 2+ notes to merge");
    notes.merge(nav.targets);
    showToast(`Merged ${nav.targets.length} → 1 · ⌘Z to undo`);
    nav.clear();
  }, [nav, notes, showToast]);
  const removeIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      notes.remove(ids);
      showToast(`Deleted ${ids.length > 1 ? ids.length + " notes" : "note"} · ⌘Z to undo`);
      nav.clear();
    },
    [notes, nav, showToast],
  );
  const moveBySection = useCallback(
    (delta: number) => {
      if (nav.targets.length === 0) return;
      const i = state.sections.findIndex((s) => s.id === activeSection.id);
      const target = state.sections[(i + delta + state.sections.length) % state.sections.length];
      if (!target || target.id === activeSection.id) return;
      notes.move(nav.targets, target.id);
      showToast(`Moved to ${target.name}`);
      nav.clear();
    },
    [nav, state.sections, activeSection.id, notes, showToast],
  );

  const hide = useCallback(async () => {
    await notes.flush();
    void native.hide();
  }, [notes]);
  const quit = useCallback(async () => {
    await notes.flush();
    void native.quit();
  }, [notes]);
  const togglePin = useCallback(() => {
    setPinned((p) => {
      void native.setPinned(!p);
      return !p;
    });
  }, []);
  const openSearch = useCallback(() => {
    setSearchOpen(true);
    requestAnimationFrame(() => searchRef.current?.focus());
  }, []);
  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setQuery("");
    nav.clear();
    focusCapture();
  }, [nav, focusCapture]);

  // ── lifecycle: focus on show, save on hide, accessibility status ──
  useEffect(() => {
    focusCapture();
    const onFocus = () => {
      if (view === "list" && document.activeElement === document.body) focusCapture();
    };
    window.addEventListener("focus", onFocus);
    let off: (() => void) | undefined;
    onShown(() => {
      setView("list");
      focusCapture();
    }).then((fn) => (off = fn));
    return () => {
      window.removeEventListener("focus", onFocus);
      off?.();
    };
  }, [focusCapture, view]);

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === "hidden") void notes.flush();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", onHide);
    };
  }, [notes.flush]);

  useEffect(() => {
    if (!inTauri || !settings.settings.doubleShift) return;
    let alive = true;
    const poll = async () => {
      const t = await native.accessibilityStatus();
      if (alive) setAxTrusted(t ?? null);
    };
    void poll();
    const id = window.setInterval(poll, 5000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, [settings.settings.doubleShift]);

  // ── keyboard ──
  const keymap = settings.keymap;
  const runAction = useCallback(
    (a: ActionId) => {
      switch (a) {
        case "newSection":
          setView("list");
          setAddSectionRequest((n) => n + 1);
          break;
        case "search":
          setView("list");
          if (searchOpen && document.activeElement === searchRef.current) closeSearch();
          else openSearch();
          break;
        case "filters":
          setView("list");
          setFiltersOpen((o) => !o);
          break;
        case "copySectionAsList":
          copySectionAsList(activeSection.id);
          break;
        case "merge":
          mergeSelected();
          break;
        case "clearDone": {
          const n = doneInSection(state, activeSection.id).length;
          if (!n) return showToast("Nothing to clear");
          notes.clearDone(activeSection.id);
          showToast(`Cleared ${n} done · ⌘Z to undo`);
          break;
        }
        case "moveNextSection":
          moveBySection(1);
          break;
        case "movePrevSection":
          moveBySection(-1);
          break;
        case "pin":
          togglePin();
          break;
        case "settings":
          setView((v) => (v === "settings" ? "list" : "settings"));
          break;
        case "help":
          setView((v) => (v === "help" ? "list" : "help"));
          break;
        case "undo":
          notes.undo();
          break;
        case "redo":
          notes.redo();
          break;
      }
    },
    [searchOpen, closeSearch, openSearch, copySectionAsList, activeSection.id, mergeSelected, state, notes, showToast, moveBySection, togglePin],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented) return;
      const el = e.target as HTMLElement | null;
      const inEditable =
        !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      const meta = e.metaKey && !e.ctrlKey;

      // Fixed app-level keys.
      if (meta && !e.shiftKey && !e.altKey && e.code === "KeyW") return void (e.preventDefault(), hide());
      if (meta && !e.shiftKey && !e.altKey && e.code === "KeyQ") return void (e.preventDefault(), quit());
      if (meta && !e.shiftKey && !e.altKey && /^Digit[1-9]$/.test(e.code)) {
        const s = state.sections[Number(e.code.slice(5)) - 1];
        if (s) {
          e.preventDefault();
          setView("list");
          setActiveId(s.id);
          nav.clear();
        }
        return;
      }

      // Customisable actions (⌘-combos); undo/redo stay native inside text fields.
      for (const a of Object.keys(keymap) as ActionId[]) {
        if (matchesEvent(e, keymap[a])) {
          if ((a === "undo" || a === "redo") && inEditable) return;
          e.preventDefault();
          runAction(a);
          return;
        }
      }

      // Esc cascade (fields handle their own first and stopPropagation when they consume it).
      if (e.key === "Escape") {
        e.preventDefault();
        if (view !== "list") return void (setView("list"), focusCapture());
        if (editingId) return void setEditingId(null);
        if (nav.selected.size > 0 || nav.cursor) return void (nav.clear(), focusCapture());
        if (searchOpen) return void closeSearch();
        if (filtersOpen && activeFilterCount(filter) > 0) return void setFilter(EMPTY_FILTER);
        if (filtersOpen) return void setFiltersOpen(false);
        if (captureRef.current && !captureRef.current.isEmpty()) return void captureRef.current.clear();
        return void hide();
      }

      if (inEditable || view !== "list") return;

      // List-mode keys.
      if (meta && e.code === "KeyA") return void (e.preventDefault(), nav.selectAll());
      if (meta && e.code === "KeyC" && nav.targets.length) return void (e.preventDefault(), copyNotes(nav.targets));
      if (e.code === "ArrowDown") return void (e.preventDefault(), nav.move(1, e.shiftKey), listRef.current?.focus());
      if (e.code === "ArrowUp") {
        e.preventDefault();
        if (nav.atFirst && !e.shiftKey) return void (nav.clear(), focusCapture());
        return void (nav.move(-1, e.shiftKey), listRef.current?.focus());
      }
      if (!nav.cursor) return;
      if (e.code === "Space") return void (e.preventDefault(), nav.targets.forEach((id) => notes.toggle(id)));
      if (e.code === "Enter") {
        e.preventDefault();
        const n = notesById.get(nav.cursor);
        if (n && !n.done) setEditingId(nav.cursor);
        return;
      }
      if (e.code === "Backspace" || e.code === "Delete") return void (e.preventDefault(), removeIds(nav.targets));
      if (/^Digit[123]$/.test(e.code) && !meta) {
        e.preventDefault();
        const p: Priority = (["high", "medium", "low"] as const)[Number(e.code.slice(5)) - 1];
        notes.setPriority(nav.targets, p);
        return;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    keymap, runAction, hide, quit, state.sections, nav, view, editingId, searchOpen, closeSearch,
    filtersOpen, filter, focusCapture, copyNotes, notes, notesById, removeIds,
  ]);

  // ── render ──
  const subtitle = searching
    ? `${open.length + done.length} result${open.length + done.length === 1 ? "" : "s"}`
    : `${counts[activeSection.id] ?? 0} open in ${activeSection.name}`;

  const listEmptyMessage = searching ? (
    <>No notes match “{query}”.</>
  ) : activeFilterCount(filter) > 0 ? (
    <>Nothing matches these filters.</>
  ) : state.notes.length === 0 ? (
    <>
      <p>Nothing yet.</p>
      <p className="mt-1 text-xs text-muted-foreground/70">
        Type or paste something above and press ↩. Markdown works. Press <kbd className="font-sans">⌘/</kbd> for shortcuts.
      </p>
    </>
  ) : (
    <>Nothing in {activeSection.name} yet.</>
  );

  return (
    <TooltipProvider delayDuration={400}>
      <div
        className={
          "flex h-dvh w-dvw flex-col overflow-hidden rounded-xl text-foreground " +
          (inTauri ? "bg-background/70 dark:bg-background/55" : "bg-background")
        }
      >
        <Header
          subtitle={subtitle}
          searchOpen={searchOpen}
          onToggleSearch={() => (searchOpen ? closeSearch() : openSearch())}
          filtersOpen={filtersOpen}
          activeFilters={activeFilterCount(filter)}
          onToggleFilters={() => runAction("filters")}
          pinned={pinned}
          onTogglePin={togglePin}
          isTauri={inTauri}
          keymap={keymap}
          canUndo={notes.canUndo}
          canRedo={notes.canRedo}
          onUndo={notes.undo}
          onRedo={notes.redo}
          onCopySectionAsList={() => copySectionAsList(activeSection.id)}
          onClearDone={() => runAction("clearDone")}
          onRevealFile={() => void native.revealNotesFile()}
          onOpenSettings={() => setView("settings")}
          onOpenHelp={() => setView("help")}
          onQuit={quit}
        />

        {view === "settings" ? (
          <SettingsPanel
            settings={settings}
            noteCount={state.notes.length}
            sectionCount={state.sections.length}
            onBack={() => {
              setView("list");
              focusCapture();
            }}
          />
        ) : view === "help" ? (
          <HelpSheet
            keymap={keymap}
            toggleShortcut={settings.settings.toggleShortcut}
            doubleShift={settings.settings.doubleShift}
            onBack={() => {
              setView("list");
              focusCapture();
            }}
          />
        ) : (
          <>
            {inTauri && settings.settings.doubleShift && axTrusted === false && !bannerDismissed && (
              <AccessibilityBanner
                onGrant={() => void native.requestAccessibility()}
                onDismiss={() => setBannerDismissed(true)}
              />
            )}
            {!searchOpen && (
              <SectionTabs
                sections={state.sections}
                counts={counts}
                activeId={activeSection.id}
                onSelect={(id) => {
                  setActiveId(id);
                  nav.clear();
                  focusCapture();
                }}
                onAdd={(name) => {
                  const id = notes.addSection(name);
                  setActiveId(id);
                  focusCapture();
                }}
                onRename={notes.renameSection}
                onRemove={(id) => {
                  const n = state.notes.filter((x) => x.sectionId === id).length;
                  notes.removeSection(id);
                  if (id === activeId) setActiveId(INBOX_ID);
                  showToast(n ? `Section deleted · ${n} note${n > 1 ? "s" : ""} moved to Inbox · ⌘Z to undo` : "Section deleted");
                }}
                onCopyAsList={copySectionAsList}
                onClearDone={(id) => {
                  const n = doneInSection(state, id).length;
                  notes.clearDone(id);
                  showToast(n ? `Cleared ${n} done · ⌘Z to undo` : "Nothing to clear");
                }}
                addRequest={addSectionRequest}
              />
            )}
            <SearchAndFilters
              ref={searchRef}
              searchOpen={searchOpen}
              query={query}
              onQuery={(q) => {
                setQuery(q);
                nav.clear();
              }}
              onCloseSearch={closeSearch}
              onArrowDownOut={focusList}
              filtersOpen={filtersOpen}
              filter={filter}
              onFilter={(f) => {
                setFilter(f);
                nav.clear();
              }}
            />
            {!searchOpen && (
              <CaptureBox
                ref={captureRef}
                placeholder={`Capture to ${activeSection.name}…`}
                onSubmit={(text) => {
                  if (!text.trim()) return false;
                  const id = notes.add(activeSection.id, text);
                  nav.clear();
                  requestAnimationFrame(() =>
                    listRef.current?.querySelector(`[data-note-id="${id}"]`)?.scrollIntoView({ block: "nearest" }),
                  );
                  return true;
                }}
                onArrowDownOut={focusList}
              />
            )}
            <div className="border-t border-border/60" />
            <NoteList
              ref={listRef}
              open={open}
              done={done}
              sections={state.sections}
              showSection={searching}
              cursorId={nav.cursor}
              selected={nav.selected}
              editingId={editingId}
              emptyMessage={listEmptyMessage}
              onKeyDown={() => {}}
              onPointerSelect={(id, e) => {
                if (e.metaKey) nav.toggle(id);
                else nav.focus(id, e.shiftKey);
                listRef.current?.focus();
              }}
              onToggle={notes.toggle}
              onEdit={notes.edit}
              onStartEdit={(id) => {
                nav.focus(id);
                setEditingId(id);
              }}
              onStopEdit={() => {
                setEditingId(null);
                listRef.current?.focus();
              }}
              onRemove={removeIds}
              onSetPriority={notes.setPriority}
              onMove={(ids, sectionId) => {
                notes.move(ids, sectionId);
                showToast(`Moved to ${sectionById(state, sectionId)?.name ?? "section"}`);
              }}
              onCopy={(ids) => void copyNotes(ids)}
            />
            <Footer
              selectedCount={nav.selected.size}
              toast={toast}
              mergeBinding={keymap.merge}
              totalOpen={totalOpen}
            />
          </>
        )}
      </div>
    </TooltipProvider>
  );
}
