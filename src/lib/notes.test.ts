import { describe, expect, it } from "vitest";
import {
  type Note,
  type NotesState,
  INBOX_ID,
  emptyState,
  reduce,
  notesInSection,
  allInSection,
  doneInSection,
  searchNotes,
  sectionById,
  normalizeState,
  migrateFromV1,
  cleanText,
  allAttachmentIds,
  MAX_ATTACHMENTS,
  type Attachment,
} from "./notes";

const att = (id: string): Attachment => ({ id, name: id, mime: "image/png", thumb: true, width: 10, height: 10 });

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

  it("add: images-only note is allowed; attachments capped at MAX", () => {
    const many = Array.from({ length: MAX_ATTACHMENTS + 3 }, (_, i) => att(`a${i}.png`));
    const s = reduce(emptyState(), { type: "add", id: "a", sectionId: INBOX_ID, text: "  ", now: 1, attachments: many });
    expect(s.notes).toHaveLength(1);
    expect(s.notes[0].text).toBe("");
    expect(s.notes[0].attachments).toHaveLength(MAX_ATTACHMENTS);
    const e = emptyState();
    expect(reduce(e, { type: "add", id: "b", sectionId: INBOX_ID, text: " ", now: 1, attachments: [] })).toBe(e);
  });

  it("edit: blank text keeps an images-only note; setAttachments removes empty notes", () => {
    const s0 = state([note({ id: "a", text: "cap", attachments: [att("x.png")] })]);
    const s1 = reduce(s0, { type: "edit", id: "a", text: "" });
    expect(s1.notes[0].text).toBe("");
    expect(s1.notes[0].attachments).toHaveLength(1);
    const s2 = reduce(s1, { type: "setAttachments", id: "a", attachments: [] });
    expect(s2.notes).toEqual([]);
    const s3 = reduce(s0, { type: "setAttachments", id: "a", attachments: [] });
    expect(s3.notes[0].attachments).toBeUndefined();
    expect(s3.notes[0].text).toBe("cap");
  });

  it("merge concatenates attachments (capped) and skips empty texts", () => {
    const s0 = state([
      note({ id: "a", text: "", createdAt: 1, attachments: [att("1.png"), att("2.png")] }),
      note({ id: "b", text: "hello", createdAt: 2, attachments: [att("3.png")] }),
    ]);
    const s1 = reduce(s0, { type: "merge", ids: ["a", "b"], now: 9 });
    expect(s1.notes[0].text).toBe("hello");
    expect(s1.notes[0].attachments?.map((x) => x.id)).toEqual(["1.png", "2.png", "3.png"]);
    expect(allAttachmentIds(s1)).toEqual(["1.png", "2.png", "3.png"]);
  });

  it("reorder: moves among open notes of the folder; new notes still append", () => {
    const s0 = state([note({ id: "a", createdAt: 1 }), note({ id: "b", createdAt: 2 }), note({ id: "c", createdAt: 3 })]);
    const s1 = reduce(s0, { type: "reorder", id: "c", afterId: null, now: 10 }); // c to top
    expect(notesInSection(s1, INBOX_ID).map((n) => n.id)).toEqual(["c", "a", "b"]);
    const s2 = reduce(s1, { type: "reorder", id: "a", afterId: "b", now: 10 }); // a to bottom
    expect(notesInSection(s2, INBOX_ID).map((n) => n.id)).toEqual(["c", "b", "a"]);
    const s3 = reduce(s2, { type: "add", id: "d", sectionId: INBOX_ID, text: "new", now: 11 });
    expect(notesInSection(s3, INBOX_ID).map((n) => n.id)).toEqual(["c", "b", "a", "d"]);
    const s4 = reduce(s3, { type: "reorder", id: "d", afterId: "c", now: 12 }); // between c and b
    expect(notesInSection(s4, INBOX_ID).map((n) => n.id)).toEqual(["c", "d", "b", "a"]);
    // no-ops
    expect(reduce(s4, { type: "reorder", id: "zzz", afterId: null, now: 13 })).toBe(s4);
    expect(reduce(s4, { type: "reorder", id: "a", afterId: "a", now: 13 })).toBe(s4);
  });

  it("nudge moves one step and stops at the edges", () => {
    const s0 = state([note({ id: "a", createdAt: 1 }), note({ id: "b", createdAt: 2 }), note({ id: "c", createdAt: 3 })]);
    const s1 = reduce(s0, { type: "nudge", id: "c", delta: -1, now: 10 });
    expect(notesInSection(s1, INBOX_ID).map((n) => n.id)).toEqual(["a", "c", "b"]);
    const s2 = reduce(s1, { type: "nudge", id: "c", delta: -1, now: 11 });
    expect(notesInSection(s2, INBOX_ID).map((n) => n.id)).toEqual(["c", "a", "b"]);
    expect(reduce(s2, { type: "nudge", id: "c", delta: -1, now: 12 })).toBe(s2);
    const s3 = reduce(s2, { type: "nudge", id: "c", delta: 1, now: 13 });
    expect(notesInSection(s3, INBOX_ID).map((n) => n.id)).toEqual(["a", "c", "b"]);
  });

  it("headings: created from '# Title', immune to done/priority/merge, kept in order", () => {
    let s = emptyState();
    s = reduce(s, { type: "add", id: "h", sectionId: INBOX_ID, text: "## Prompts to try", now: 1, kind: "heading" });
    s = reduce(s, { type: "add", id: "n", sectionId: INBOX_ID, text: "ask about caching", now: 2 });
    expect(s.notes[0]).toMatchObject({ kind: "heading", text: "Prompts to try", done: false });
    expect(reduce(s, { type: "toggle", id: "h", now: 3 })).toBe(s);
    expect(reduce(s, { type: "setDone", ids: ["h"], done: true, now: 3 })).toBe(s);
    expect(reduce(s, { type: "setPriority", ids: ["h"], priority: "high" })).toBe(s);
    expect(reduce(s, { type: "merge", ids: ["h", "n"], now: 4 })).toBe(s); // needs 2 real notes
    expect(notesInSection(s, INBOX_ID).map((x) => x.id)).toEqual(["h", "n"]);
    const back = normalizeState({ ...s, notes: [{ ...s.notes[0], done: true }] });
    expect(back.notes[0].done).toBe(false);
  });

  it("moving a heading moves its whole section (nudge swaps blocks, drag snaps to block ends)", () => {
    const h = (id: string, text: string, t: number) => note({ id, text, createdAt: t, kind: "heading" });
    const s0 = state([
      note({ id: "x", text: "loose", createdAt: 1 }),
      h("A", "A", 2), note({ id: "a1", createdAt: 3 }), note({ id: "a2", createdAt: 4 }),
      h("B", "B", 5), note({ id: "b1", createdAt: 6 }),
    ]);
    const ids = (st: NotesState) => notesInSection(st, INBOX_ID).map((n) => n.id);
    // B up → B block before A block
    const s1 = reduce(s0, { type: "nudge", id: "B", delta: -1, now: 10 });
    expect(ids(s1)).toEqual(["x", "B", "b1", "A", "a1", "a2"]);
    // B up again → before the loose note
    const s2 = reduce(s1, { type: "nudge", id: "B", delta: -1, now: 11 });
    expect(ids(s2)).toEqual(["B", "b1", "x", "A", "a1", "a2"]);
    expect(reduce(s2, { type: "nudge", id: "B", delta: -1, now: 12 })).toBe(s2);
    // drag A (block) after b1 → A block goes to the end of B's block... which is the end here
    const s3 = reduce(s0, { type: "reorder", id: "A", afterId: "b1", now: 13 });
    expect(ids(s3)).toEqual(["x", "B", "b1", "A", "a1", "a2"]);
    // drag A after "x" → stays where it is (already after x)
    expect(ids(reduce(s0, { type: "reorder", id: "A", afterId: "x", now: 14 }))).toEqual(ids(s0));
    // drag A to top
    expect(ids(reduce(s0, { type: "reorder", id: "A", afterId: null, now: 15 }))).toEqual(["A", "a1", "a2", "x", "B", "b1"]);
    // dropping into the middle of B's notes snaps to B's end (can't split a section)
    const s4 = state([h("A", "A", 1), note({ id: "a1", createdAt: 2 }), h("B", "B", 3), note({ id: "b1", createdAt: 4 }), note({ id: "b2", createdAt: 5 })]);
    expect(ids(reduce(s4, { type: "reorder", id: "A", afterId: "b1", now: 16 }))).toEqual(["B", "b1", "b2", "A", "a1"]);
    // new notes still append after everything
    const s5 = reduce(s2, { type: "add", id: "z", sectionId: INBOX_ID, text: "z", now: 99 });
    expect(ids(s5)[ids(s5).length - 1]).toBe("z");
  });

  it("done notes keep their place; reorderMany moves a block; toggleCollapse flips headings only", () => {
    const s0 = state([
      note({ id: "a", createdAt: 1 }),
      note({ id: "b", createdAt: 2, done: true, completedAt: 5 }),
      note({ id: "c", createdAt: 3 }),
      note({ id: "d", createdAt: 4 }),
    ]);
    expect(allInSection(s0, INBOX_ID).map((n) => n.id)).toEqual(["a", "b", "c", "d"]);
    // done note can be nudged like any other
    expect(allInSection(reduce(s0, { type: "nudge", id: "b", delta: 1, now: 9 }), INBOX_ID).map((n) => n.id)).toEqual(["a", "c", "b", "d"]);
    // multi-select move: a + d after c, keeping a before d
    const s1 = reduce(s0, { type: "reorderMany", ids: ["d", "a"], afterId: "c", now: 10 });
    expect(allInSection(s1, INBOX_ID).map((n) => n.id)).toEqual(["b", "c", "a", "d"]);
    // to top
    const s2 = reduce(s1, { type: "reorderMany", ids: ["a", "d"], afterId: null, now: 11 });
    expect(allInSection(s2, INBOX_ID).map((n) => n.id)).toEqual(["a", "d", "b", "c"]);
    // collapse
    const s3 = reduce(state([note({ id: "h", kind: "heading" }), note({ id: "x" })]), { type: "toggleCollapse", id: "h" });
    expect(s3.notes[0].collapsed).toBe(true);
    expect(reduce(s3, { type: "toggleCollapse", id: "x" })).toBe(s3);
    expect(reduce(s3, { type: "toggleCollapse", id: "h" }).notes[0].collapsed).toBe(false);
  });

  it("add with insertAfter places the note exactly there", () => {
    const s0 = state([note({ id: "a", createdAt: 1 }), note({ id: "b", createdAt: 2 })]);
    const s1 = reduce(s0, { type: "add", id: "h", sectionId: INBOX_ID, text: "Sec", now: 9, kind: "heading", insertAfter: "a" });
    expect(allInSection(s1, INBOX_ID).map((n) => n.id)).toEqual(["a", "h", "b"]);
    const s2 = reduce(s0, { type: "add", id: "t", sectionId: INBOX_ID, text: "top", now: 9, insertAfter: null });
    expect(allInSection(s2, INBOX_ID).map((n) => n.id)).toEqual(["t", "a", "b"]);
    const s3 = reduce(s2, { type: "add", id: "z", sectionId: INBOX_ID, text: "end", now: 10 });
    expect(allInSection(s3, INBOX_ID).map((n) => n.id)).toEqual(["t", "a", "b", "z"]);
  });

  it("source, outcome, handedOff and folder preamble round-trip", () => {
    let s = reduce(emptyState(), {
      type: "add", id: "a", sectionId: INBOX_ID, text: "from arc", now: 1,
      source: { app: "Arc", title: "GitHub", bundleId: "company.thebrowser.Browser", at: 1 },
    });
    expect(s.notes[0].source).toEqual({ app: "Arc", title: "GitHub", bundleId: "company.thebrowser.Browser", at: 1 });
    s = reduce(s, { type: "setOutcome", id: "a", text: "  Done: added caching.  ", by: "agent", now: 5 });
    expect(s.notes[0].outcome).toEqual({ text: "Done: added caching.", at: 5, by: "agent" });
    expect(reduce(s, { type: "setOutcome", id: "a", text: "Done: added caching.", by: "agent", now: 6 })).toBe(s);
    s = reduce(s, { type: "markHandedOff", ids: ["a"], now: 7 });
    expect(s.notes[0].handedOff).toBe(7);
    s = reduce(s, { type: "setPreamble", sectionId: INBOX_ID, text: " Be terse. " });
    expect(s.sections[0].preamble).toBe("Be terse.");
    const back = normalizeState(JSON.parse(JSON.stringify(s)));
    expect(back.notes[0]).toMatchObject({ source: { app: "Arc" }, outcome: { by: "agent" }, handedOff: 7 });
    expect(back.sections[0].preamble).toBe("Be terse.");
    // clearing
    s = reduce(s, { type: "setOutcome", id: "a", text: null, by: "me", now: 8 });
    expect(s.notes[0].outcome).toBeUndefined();
    s = reduce(s, { type: "setPreamble", sectionId: INBOX_ID, text: "" });
    expect(s.sections[0].preamble).toBeUndefined();
    // headings ignore outcome/handedOff
    const h = reduce(s, { type: "add", id: "h", sectionId: INBOX_ID, text: "Sec", now: 9, kind: "heading" });
    expect(reduce(h, { type: "setOutcome", id: "h", text: "x", by: "me", now: 10 })).toBe(h);
    expect(reduce(h, { type: "markHandedOff", ids: ["h"], now: 10 })).toBe(h);
  });

  it("toggle sets/clears completedAt", () => {
    const s0 = state([note({ id: "a" })]);
    const s1 = reduce(s0, { type: "toggle", id: "a", now: 5 });
    expect(s1.notes[0]).toMatchObject({ done: true, completedAt: 5 });
    const s2 = reduce(s1, { type: "toggle", id: "a", now: 6 });
    expect(s2.notes[0].done).toBe(false);
    expect(s2.notes[0].completedAt).toBeUndefined();
  });

  it("setDone marks many at once and is a no-op when nothing changes", () => {
    const s0 = state([note({ id: "a" }), note({ id: "b", done: true, completedAt: 1 })]);
    const s1 = reduce(s0, { type: "setDone", ids: ["a", "b"], done: true, now: 7 });
    expect(s1.notes.map((n) => [n.done, n.completedAt])).toEqual([[true, 7], [true, 1]]);
    expect(reduce(s1, { type: "setDone", ids: ["a", "b"], done: true, now: 8 })).toBe(s1);
    const s2 = reduce(s1, { type: "setDone", ids: ["a"], done: false, now: 9 });
    expect(s2.notes[0].done).toBe(false);
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

  it("source is stored on add and validated on load; outcome/preamble/handedOff round-trip", () => {
    const src = { app: "Arc", title: "GitHub", bundleId: "company.thebrowser.Browser", at: 5 };
    let s = reduce(emptyState(), { type: "add", id: "a", sectionId: INBOX_ID, text: "hi", now: 1, source: src });
    expect(s.notes[0].source).toEqual(src);
    // headings never carry a source
    s = reduce(s, { type: "add", id: "h", sectionId: INBOX_ID, text: "Sec", now: 2, kind: "heading", source: src });
    expect(s.notes[1].source).toBeUndefined();
    // outcome set / clear
    s = reduce(s, { type: "setOutcome", id: "a", text: "done via agent", by: "agent", now: 9 });
    expect(s.notes[0].outcome).toEqual({ text: "done via agent", at: 9, by: "agent" });
    expect(reduce(s, { type: "setOutcome", id: "a", text: null, by: "me", now: 10 }).notes[0].outcome).toBeUndefined();
    // markHandedOff + preamble
    s = reduce(s, { type: "markHandedOff", ids: ["a"], now: 11 });
    expect(s.notes[0].handedOff).toBe(11);
    s = reduce(s, { type: "setPreamble", sectionId: INBOX_ID, text: "  Be concise.  " });
    expect(sectionById(s, INBOX_ID)!.preamble).toBe("Be concise.");
    expect(reduce(s, { type: "setPreamble", sectionId: INBOX_ID, text: "" }).sections[0].preamble).toBeUndefined();
    // normalize keeps them
    const back = normalizeState(s);
    expect(back.notes[0].handedOff).toBe(11);
    const withSrc = normalizeState({ version: 2, sections: [], notes: [{ id: "z", sectionId: INBOX_ID, text: "t", priority: "low", done: false, createdAt: 1, source: { app: "Safari", at: 2 }, outcome: { text: "ok", at: 3, by: "agent" } }] });
    expect(withSrc.notes[0].source).toEqual({ app: "Safari", at: 2 });
    expect(withSrc.notes[0].outcome).toEqual({ text: "ok", at: 3, by: "agent" });
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
  it("reorderSection moves folders", () => {
    let s = emptyState();
    s = reduce(s, { type: "addSection", id: "b", name: "B", now: 1 });
    s = reduce(s, { type: "addSection", id: "c", name: "C", now: 2 });
    s = reduce(s, { type: "reorderSection", id: "c", afterId: null });
    expect(s.sections.map((x) => x.id)).toEqual(["c", INBOX_ID, "b"]);
    s = reduce(s, { type: "reorderSection", id: INBOX_ID, afterId: "b" });
    expect(s.sections.map((x) => x.id)).toEqual(["c", "b", INBOX_ID]);
    expect(reduce(s, { type: "reorderSection", id: "zz", afterId: null })).toBe(s);
  });

  it("re-homes notes whose folder is missing, ensures the default folder exists, renames legacy 'Inbox'", () => {
    const s = normalizeState({
      version: 2,
      sections: [{ id: "s2", name: "P", createdAt: 1 }],
      notes: [
        { id: "a", sectionId: "gone", text: "x", priority: "high", done: false, createdAt: 1 },
        { id: "b", sectionId: "s2", text: "y", priority: "weird", done: true, createdAt: 1 },
      ],
    });
    expect(s.sections.map((x) => x.id)).toEqual([INBOX_ID, "s2"]); // inserted first when missing
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
