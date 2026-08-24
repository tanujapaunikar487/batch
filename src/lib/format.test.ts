import { describe, expect, it } from "vitest";
import { type Note, INBOX_ID } from "./notes";
import { asList, mergeText, asPlainText, asNumberedList, forAgent, stamp } from "./format";

const n = (text: string, createdAt = 0): Note => ({
  id: text, sectionId: INBOX_ID, text, priority: "medium", done: false, createdAt,
});

describe("asList", () => {
  it("bullets in chronological order", () => {
    expect(asList([n("b", 2), n("a", 1)])).toBe("- a\n- b");
  });
  it("indents continuation lines of multi-line notes", () => {
    expect(asList([n("first line\nsecond line")])).toBe("- first line\n  second line");
  });
  it("numbered style", () => {
    expect(asList([n("a", 1), n("b", 2)], "numbered")).toBe("1. a\n2. b");
  });
  it("asPlainText: single note → its text; several → blank-line separated, chronological", () => {
    expect(asPlainText([n("only")])).toBe("only");
    expect(asPlainText([n("x", 2), n("y", 1)])).toBe("y\n\nx");
  });
  it("asNumberedList", () => {
    expect(asNumberedList([n("x", 2), n("y", 1)])).toBe("1. y\n2. x");
  });
});

describe("mergeText", () => {
  it("joins with a blank line in chronological order", () => {
    expect(mergeText([n("two", 2), n("one", 1)])).toBe("one\n\ntwo");
  });
});

describe("forAgent", () => {
  it("emits title, preamble, numbered items with priority tags, source and image footnotes", () => {
    const a: Note = { ...n("Explain caching", 1), priority: "high", source: { app: "Arc", title: "GitHub – issues", at: Date.UTC(2026, 7, 18, 10, 32) } };
    const b: Note = { ...n("Write tests\nfor parseBinding", 2), attachments: [{ id: "x.png", name: "before.png", mime: "image/png", thumb: true, width: 1, height: 1 }] };
    const h: Note = { ...n("Heading", 0), kind: "heading" };
    const md = forAgent({ name: "Prompts", preamble: "You are reviewing the onboarding flow." }, [b, a, h]);
    const lines = md.split("\n");
    expect(lines[0]).toBe("# Prompts");
    expect(md).toContain("You are reviewing the onboarding flow.\n\n2 items:");
    expect(md).toContain("1. [high] Explain caching\n   — source: Arc · “GitHub – issues” · ");
    expect(md).toContain("2. Write tests\n   for parseBinding\n   — images: before.png");
    expect(md).not.toContain("Heading");
  });
  it("stamp formats local time", () => {
    expect(stamp(new Date(2026, 0, 5, 9, 7).getTime())).toBe("2026-01-05 09:07");
  });
});
