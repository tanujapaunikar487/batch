import { describe, expect, it } from "vitest";
import {
  type Note,
  type NotesState,
  INBOX_ID,
  emptyState,
  reduce,
  notesInSection,
  doneInSection,
  searchNotes,
  normalizeState,
  migrateFromV1,
  cleanText,
} from "./notes";

const note = (over: Partial<Note> = {}): Note => ({
  id: over.id ?? "n-" + Math.random().toString(36).slice(2),
  sectionId: INBOX_ID,
  text: "thing",
  priority: "medium",
  done: false,
  createdAt: 1000,
  ...over,
});

const state = (notes: Note[], extraSections: { id: string; name: string }[] = []): NotesState => ({
  version: 2,
  sections: [
    { id: INBOX_ID, name: "Untitled", createdAt: 0 },
    ...extraSections.map((s, i) => ({ ...s, createdAt: i + 1 })),
  ],
  notes,
});

describe("cleanText", () => {
  it("trims outer whitespace, keeps inner newlines, normalises CRLF", () => {
    expect(cleanText("  a\r\nb  \n\n")).toBe("a\nb");
  });
  it("collapses 3+ blank lines to one blank line", () => {
    expect(cleanText("a\n\n\n\nb")).toBe("a\n\nb");
  });
});

describe("emptyState", () => {
  it("has a default 'Untitled' folder and no notes", () => {
    const s = emptyState();
    expect(s.version).toBe(2);
    expect(s.sections.map((x) => x.id)).toEqual([INBOX_ID]);
    expect(s.notes).toEqual([]);
  });
});

describe("notes reducer", () => {
  it("add: appends a note to the given section (oldest first ordering)", () => {
    let s = emptyState();
    s = reduce(s, { type: "add", id: "a", sectionId: INBOX_ID, text: "first", now: 1 });
    s = reduce(s, { type: "add", id: "b", sectionId: INBOX_ID, text: "second", now: 2 });
    expect(notesInSection(s, INBOX_ID).map((n) => n.text)).toEqual(["first", "second"]);
    expect(s.notes[0]).toMatchObject({ id: "a", priority: "medium", done: false, createdAt: 1 });
  });

  it("add: ignores blank text and unknown sections", () => {
    const s0 = emptyState();
    expect(reduce(s0, { type: "add", id: "a", sectionId: INBOX_ID, text: "  \n ", now: 1 })).toBe(s0);
    expect(reduce(s0, { type: "add", id: "a", sectionId: "nope", text: "x", now: 1 })).toBe(s0);
  });

  it("add: keeps multi-line text as one note", () => {
    const s = reduce(emptyState(), { type: "add", id: "a", sectionId: INBOX_ID, text: "line 1\nline 2", now: 1 });
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0].text).toBe("line 1\nline 2");
  });

  it("toggle sets/clears completedAt", () => {
    const s0 = state([note({ id: "a" })]);
    const s1 = reduce(s0, { type: "toggle", id: "a", now: 5 });
    expect(s1.notes[0]).toMatchObject({ done: true, completedAt: 5 });
    const s2 = reduce(s1, { type: "toggle", id: "a", now: 6 });
    expect(s2.notes[0].done).toBe(false);
    expect(s2.notes[0].completedAt).toBeUndefined();
  });

  it("edit trims; blank removes", () => {
    const s0 = state([note({ id: "a" })]);
    expect(reduce(s0, { type: "edit", id: "a", text: " new\n" }).notes[0].text).toBe("new");
    expect(reduce(s0, { type: "edit", id: "a", text: "  " }).notes).toEqual([]);
  });

  it("remove accepts many ids", () => {
    const s0 = state([note({ id: "a" }), note({ id: "b" }), note({ id: "c" })]);
    expect(reduce(s0, { type: "remove", ids: ["a", "c"] }).notes.map((n) => n.id)).toEqual(["b"]);
  });

  it("setPriority", () => {
    const s0 = state([note({ id: "a" })]);
    expect(reduce(s0, { type: "setPriority", ids: ["a"], priority: "high" }).notes[0].priority).toBe("high");
  });

  it("move: changes section for many ids; unknown section is a no-op", () => {
    const s0 = state([note({ id: "a" }), note({ id: "b" })], [{ id: "s2", name: "Prompts" }]);
    const s1 = reduce(s0, { type: "move", ids: ["a", "b"], sectionId: "s2" });
    expect(notesInSection(s1, "s2").map((n) => n.id)).toEqual(["a", "b"]);
    expect(reduce(s0, { type: "move", ids: ["a"], sectionId: "zzz" })).toBe(s0);
  });

  it("merge: joins texts in chronological order, keeps earliest createdAt + first section, drops the rest", () => {
    const s0 = state(
      [
        note({ id: "a", text: "one", createdAt: 3, sectionId: "s2", priority: "low" }),
        note({ id: "b", text: "two", createdAt: 1, priority: "high" }),
        note({ id: "c", text: "three", createdAt: 2 }),
        note({ id: "d", text: "untouched", createdAt: 9 }),
      ],
      [{ id: "s2", name: "Prompts" }],
    );
    const s1 = reduce(s0, { type: "merge", ids: ["a", "b", "c"], now: 100 });
    expect(s1.notes).toHaveLength(2);
    const merged = s1.notes.find((n) => n.id === "b")!; // earliest survives
    expect(merged.text).toBe("two\n\nthree\n\none");
    expect(merged.createdAt).toBe(1);
    expect(merged.sectionId).toBe(INBOX_ID);
    expect(merged.priority).toBe("high"); // highest priority wins
    expect(merged.done).toBe(false);
    expect(s1.notes.map((n) => n.id).sort()).toEqual(["b", "d"]);
  });

  it("merge with < 2 ids is a no-op", () => {
    const s0 = state([note({ id: "a" })]);
    expect(reduce(s0, { type: "merge", ids: ["a"], now: 1 })).toBe(s0);
  });

  it("clearDone: only in the given section, or everywhere when omitted", () => {
    const s0 = state(
      [
        note({ id: "a", done: true }),
        note({ id: "b", done: true, sectionId: "s2" }),
        note({ id: "c" }),
      ],
      [{ id: "s2", name: "P" }],
    );
    expect(reduce(s0, { type: "clearDone", sectionId: INBOX_ID }).notes.map((n) => n.id)).toEqual(["b", "c"]);
    expect(reduce(s0, { type: "clearDone" }).notes.map((n) => n.id)).toEqual(["c"]);
  });

  it("addSection / renameSection / removeSection", () => {
    let s = emptyState();
    s = reduce(s, { type: "addSection", id: "s2", name: "  Prompts ", now: 1 });
    expect(s.sections.map((x) => x.name)).toEqual(["Untitled", "Prompts"]);
    s = reduce(s, { type: "renameSection", id: "s2", name: "Ideas" });
    expect(s.sections[1].name).toBe("Ideas");
    s = reduce(s, { type: "add", id: "n1", sectionId: "s2", text: "x", now: 2 });
    // removing a section moves its notes to Inbox
    s = reduce(s, { type: "removeSection", id: "s2" });
    expect(s.sections.map((x) => x.id)).toEqual([INBOX_ID]);
    expect(s.notes[0].sectionId).toBe(INBOX_ID);
  });

  it("cannot remove Inbox; blank section names are ignored", () => {
    const s0 = emptyState();
    expect(reduce(s0, { type: "removeSection", id: INBOX_ID })).toBe(s0);
    expect(reduce(s0, { type: "addSection", id: "x", name: "   ", now: 1 })).toBe(s0);
  });

  it("does not mutate input", () => {
    const s0 = state([note({ id: "a" })]);
    const snapshot = JSON.stringify(s0);
    reduce(s0, { type: "toggle", id: "a", now: 1 });
    reduce(s0, { type: "merge", ids: ["a", "a"], now: 1 });
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});

describe("selectors", () => {
  const s0 = state(
    [
      note({ id: "a", text: "Alpha prompt", createdAt: 2 }),
      note({ id: "b", text: "beta link", createdAt: 1 }),
      note({ id: "c", text: "gamma", createdAt: 3, done: true, completedAt: 10 }),
      note({ id: "d", text: "delta ALPHA", createdAt: 4, sectionId: "s2", done: true, completedAt: 20 }),
    ],
    [{ id: "s2", name: "P" }],
  );

  it("notesInSection: open notes, oldest first", () => {
    expect(notesInSection(s0, INBOX_ID).map((n) => n.id)).toEqual(["b", "a"]);
  });
  it("doneInSection: most recently completed first", () => {
    expect(doneInSection(s0, INBOX_ID).map((n) => n.id)).toEqual(["c"]);
  });
  it("searchNotes: case-insensitive across sections, open first then done, blank query → []", () => {
    expect(searchNotes(s0, "alpha").map((n) => n.id)).toEqual(["a", "d"]);
    expect(searchNotes(s0, "  ")).toEqual([]);
  });
});

describe("normalizeState", () => {
  it("garbage → empty state", () => {
    expect(normalizeState(undefined)).toEqual(emptyState());
    expect(normalizeState({ version: 2, sections: "x", notes: [] })).toEqual(emptyState());
  });
  it("re-homes notes whose folder is missing, ensures the default folder exists first, renames legacy 'Inbox'", () => {
    const s = normalizeState({
      version: 2,
      sections: [{ id: "s2", name: "P", createdAt: 1 }],
      notes: [
        { id: "a", sectionId: "gone", text: "x", priority: "high", done: false, createdAt: 1 },
        { id: "b", sectionId: "s2", text: "y", priority: "weird", done: true, createdAt: 1 },
      ],
    });
    expect(s.sections.map((x) => x.id)).toEqual([INBOX_ID, "s2"]);
    expect(s.notes[0].sectionId).toBe(INBOX_ID);
    expect(s.notes[1].priority).toBe("medium");
    expect(typeof s.notes[1].completedAt).toBe("number");
    const legacy = normalizeState({ version: 2, sections: [{ id: INBOX_ID, name: "Inbox", createdAt: 0 }], notes: [] });
    expect(legacy.sections[0].name).toBe("Untitled");
    const custom = normalizeState({ version: 2, sections: [{ id: INBOX_ID, name: "Work", createdAt: 0 }], notes: [] });
    expect(custom.sections[0].name).toBe("Work");
  });
});

describe("migrateFromV1", () => {
  it("puts v1 todos into Inbox keeping priority/done", () => {
    const s = migrateFromV1({
      version: 1,
      todos: [
        { id: "t1", text: "old", priority: "high", done: false, createdAt: 5 },
        { id: "t2", text: "done one", priority: "low", done: true, createdAt: 6, completedAt: 7 },
      ],
    });
    expect(s.version).toBe(2);
    expect(s.notes.map((n) => [n.id, n.sectionId, n.priority, n.done])).toEqual([
      ["t1", INBOX_ID, "high", false],
      ["t2", INBOX_ID, "low", true],
    ]);
  });
});
