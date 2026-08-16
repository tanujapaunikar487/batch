import { describe, expect, it } from "vitest";
import { type Note, INBOX_ID } from "./notes";
import { EMPTY_FILTER, applyFilters, detectKind, isFilterActive, activeFilterCount } from "./filters";

const DAY = 86_400_000;
const NOW = 10 * DAY + 5000;
const n = (over: Partial<Note>): Note => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  sectionId: INBOX_ID,
  text: "text",
  priority: "medium",
  done: false,
  createdAt: NOW,
  ...over,
});

describe("detectKind", () => {
  it("link: text is (mostly) a URL", () => {
    expect(detectKind("https://example.com/a?b=1")).toBe("link");
    expect(detectKind("see https://x.io")).toBe("link");
  });
  it("code: fenced or inline code", () => {
    expect(detectKind("```ts\nconst a = 1\n```")).toBe("code");
    expect(detectKind("run `bun install` first")).toBe("code");
  });
  it("text otherwise", () => {
    expect(detectKind("Ask about caching")).toBe("text");
  });
});

describe("applyFilters", () => {
  const notes = [
    n({ id: "a", done: false, priority: "high", text: "https://a.io", createdAt: NOW - 1000 }),
    n({ id: "b", done: true, completedAt: NOW, priority: "low", text: "`code`", createdAt: NOW - 3 * DAY }),
    n({ id: "c", done: false, priority: "medium", text: "plain", createdAt: NOW - 20 * DAY }),
  ];
  it("empty filter keeps everything", () => {
    expect(applyFilters(notes, EMPTY_FILTER, NOW).map((x) => x.id)).toEqual(["a", "b", "c"]);
  });
  it("status", () => {
    expect(applyFilters(notes, { ...EMPTY_FILTER, status: "open" }, NOW).map((x) => x.id)).toEqual(["a", "c"]);
    expect(applyFilters(notes, { ...EMPTY_FILTER, status: "done" }, NOW).map((x) => x.id)).toEqual(["b"]);
  });
  it("priority / kind / when combine (AND)", () => {
    expect(applyFilters(notes, { ...EMPTY_FILTER, priority: "high" }, NOW).map((x) => x.id)).toEqual(["a"]);
    expect(applyFilters(notes, { ...EMPTY_FILTER, kind: "code" }, NOW).map((x) => x.id)).toEqual(["b"]);
    expect(applyFilters(notes, { ...EMPTY_FILTER, when: "today" }, NOW).map((x) => x.id)).toEqual(["a", "b"]); // b completed today
    expect(applyFilters(notes, { ...EMPTY_FILTER, when: "week" }, NOW).map((x) => x.id)).toEqual(["a", "b"]);
    expect(applyFilters(notes, { ...EMPTY_FILTER, when: "week", status: "done" }, NOW).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("isFilterActive / activeFilterCount", () => {
  it("counts non-default fields", () => {
    expect(isFilterActive(EMPTY_FILTER)).toBe(false);
    expect(activeFilterCount({ ...EMPTY_FILTER, status: "open", kind: "link" })).toBe(2);
  });
});
