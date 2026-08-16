import { describe, expect, it } from "vitest";
import { type Note, INBOX_ID } from "./notes";
import { asList, mergeText, asPlainText, asNumberedList } from "./format";

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
