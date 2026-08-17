import { describe, expect, it } from "vitest";
import { INBOX_ID, emptyState, normalizeState, type NotesState } from "./notes";
import { folderToMarkdown, mergeImport, parseImport, stateToJson } from "./export";

const st: NotesState = {
  version: 2,
  sections: [{ id: INBOX_ID, name: "Untitled", createdAt: 0 }, { id: "p", name: "Prompts", createdAt: 1 }],
  notes: [
    { id: "a", sectionId: INBOX_ID, text: "one\ntwo", priority: "high", done: false, createdAt: 1 },
    { id: "b", sectionId: INBOX_ID, text: "done thing", priority: "low", done: true, createdAt: 2, completedAt: 3 },
    { id: "c", sectionId: "p", text: "", priority: "medium", done: false, createdAt: 4, attachments: [{ id: "x.png", name: "x.png", mime: "image/png", thumb: true, width: 1, height: 1 }] },
  ],
};

describe("export", () => {
  it("folderToMarkdown renders tasks, continuation lines and a Done section", () => {
    const md = folderToMarkdown(st, st.sections[0]);
    expect(md).toContain("# Untitled");
    expect(md).toContain("- [ ] one\n  two");
    expect(md).toContain("## Done");
    expect(md).toContain("- [x] done thing");
  });
  it("stateToJson round-trips through parseImport + normalizeState", () => {
    const back = normalizeState(parseImport(stateToJson(st)));
    expect(back.notes.map((n) => n.id)).toEqual(["a", "b", "c"]);
  });
  it("mergeImport matches folders by name, re-ids notes, drops images-only notes", () => {
    let i = 0;
    const cur = emptyState();
    const { state, notes, folders } = mergeImport(cur, st, () => `n${i++}`);
    expect(folders).toBe(1); // "Untitled" matched, "Prompts" created
    expect(notes).toBe(2);
    expect(state.notes.every((n) => n.id.startsWith("n"))).toBe(true);
    expect(state.notes.some((n) => n.attachments)).toBe(false);
  });
});
