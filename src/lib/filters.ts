import { type Note, type Priority, hasAttachments } from "./notes";

export type StatusFilter = "all" | "open" | "done";
export type KindFilter = "link" | "code" | "text" | "image";
export type WhenFilter = "today" | "week";

export interface Filter {
  status: StatusFilter;
  priority?: Priority;
  kind?: KindFilter;
  when?: WhenFilter;
}

export const EMPTY_FILTER: Filter = { status: "all" };

const URL_RE = /https?:\/\/[^\s)]+/i;
const FENCE_RE = /```[\s\S]*?```/;
const INLINE_CODE_RE = /`[^`\n]+`/;

/** Cheap content classification used by the Type filter and row icons. */
export function detectKind(text: string): KindFilter {
  if (FENCE_RE.test(text) || INLINE_CODE_RE.test(text)) return "code";
  if (URL_RE.test(text)) return "link";
  return "text";
}

const DAY = 86_400_000;

export function applyFilters(notes: Note[], f: Filter, now = Date.now()): Note[] {
  return notes.filter((n) => {
    if (f.status === "open" && n.done) return false;
    if (f.status === "done" && !n.done) return false;
    if (f.priority && n.priority !== f.priority) return false;
    if (f.kind === "image") {
      if (!hasAttachments(n)) return false;
    } else if (f.kind && detectKind(n.text) !== f.kind) return false;
    if (f.when) {
      const stamp = n.done && n.completedAt ? Math.max(n.completedAt, n.createdAt) : n.createdAt;
      const horizon = f.when === "today" ? DAY : 7 * DAY;
      if (now - stamp > horizon) return false;
    }
    return true;
  });
}

export function activeFilterCount(f: Filter): number {
  return (f.status !== "all" ? 1 : 0) + (f.priority ? 1 : 0) + (f.kind ? 1 : 0) + (f.when ? 1 : 0);
}

export const isFilterActive = (f: Filter) => activeFilterCount(f) > 0;
