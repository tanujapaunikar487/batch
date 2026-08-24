import { type Note, type Section, isHeading, sortKey } from "./notes";

/** Display order (manual position, else chronological); headings are not tasks. */
const chrono = (notes: Note[]) => notes.filter((n) => !isHeading(n)).sort((a, b) => sortKey(a) - sortKey(b));

/** Markdown list; multi-line notes keep their extra lines indented under the bullet. */
export function asList(notes: Note[], style: "bullet" | "numbered" = "bullet"): string {
  return chrono(notes)
    .map((n, i) => {
      const marker = style === "numbered" ? `${i + 1}. ` : "- ";
      const indent = " ".repeat(marker.length);
      const [first, ...rest] = n.text.split("\n");
      return [marker + first, ...rest.map((l) => (l ? indent + l : ""))].join("\n");
    })
    .join("\n");
}

/** What ⌘C puts on the clipboard: one note → its text, several → texts separated by blank lines. */
export function asPlainText(notes: Note[]): string {
  return chrono(notes)
    .map((n) => n.text)
    .filter(Boolean)
    .join("\n\n");
}

/** "Copy as List": numbered, chronological — ready to paste into a chat. */
export function asNumberedList(notes: Note[]): string {
  return asList(notes, "numbered");
}

export function mergeText(notes: Note[]): string {
  return chrono(notes)
    .map((n) => n.text)
    .join("\n\n");
}

const pad = (n: number) => String(n).padStart(2, "0");
/** 2026-08-18 10:32 (local time) */
export function stamp(ms: number): string {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * "Copy for agent": a structured Markdown block an AI agent can act on —
 * folder title, optional instructions (preamble), numbered items tagged with
 * priority, plus source and image footnotes.
 */
export function forAgent(folder: Pick<Section, "name" | "preamble">, notes: Note[]): string {
  const items = chrono(notes);
  const lines: string[] = [`# ${folder.name}`, ""];
  if (folder.preamble) lines.push(folder.preamble, "");
  lines.push(`${items.length} item${items.length === 1 ? "" : "s"}:`, "");
  items.forEach((n, i) => {
    const marker = `${i + 1}. `;
    const indent = " ".repeat(marker.length);
    const tag = n.priority === "medium" ? "" : `[${n.priority}] `;
    const [first, ...rest] = (n.text || "(images only)").split("\n");
    lines.push(marker + tag + first, ...rest.map((l) => (l ? indent + l : "")));
    if (n.source) {
      const where = [n.source.app, n.source.title ? `“${n.source.title}”` : ""].filter(Boolean).join(" · ");
      lines.push(`${indent}— source: ${where} · ${stamp(n.source.at)}`);
    }
    if (n.attachments?.length) lines.push(`${indent}— images: ${n.attachments.map((a) => a.name).join(", ")}`);
  });
  return lines.join("\n");
}
