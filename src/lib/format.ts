import { type Note, isHeading, sortKey } from "./notes";

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
