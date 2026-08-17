import { type Note, type NotesState, type Section, notesInSection, doneInSection, isHeading, sortKey } from "./notes";

/** Markdown export of one folder: task list, images referenced by attachment id. */
export function folderToMarkdown(state: NotesState, section: Section): string {
  const line = (n: Note) => {
    if (isHeading(n)) return `\n## ${n.text}\n`;
    const body = n.text ? n.text.split("\n").join("\n  ") : "";
    const imgs = (n.attachments ?? []).map((a) => `![${a.name}](attachments/${a.id})`).join(" ");
    const content = [body, imgs].filter(Boolean).join(body && imgs ? "\n  " : "");
    return `- [${n.done ? "x" : " "}] ${content}`;
  };
  const open = notesInSection(state, section.id).map(line);
  const done = doneInSection(state, section.id).map(line);
  return [`# ${section.name}`, "", ...open, ...(done.length ? ["", "## Done", "", ...done] : []), ""].join("\n");
}

/** Markdown export of everything, folder by folder. */
export function allToMarkdown(state: NotesState): string {
  return state.sections.map((s) => folderToMarkdown(state, s)).join("\n");
}

/** JSON export: the state itself, with an envelope for future-proofing. */
export function stateToJson(state: NotesState): string {
  return JSON.stringify({ app: "batch", exportedAt: new Date().toISOString(), version: state.version, state }, null, 2);
}

/**
 * Merge an imported state into the current one. Folders are matched by name;
 * notes get fresh ids; attachments are dropped (their files aren't on this Mac).
 */
export function mergeImport(
  current: NotesState,
  incoming: NotesState,
  newId: () => string,
): { state: NotesState; notes: number; folders: number } {
  const sections = [...current.sections];
  const idMap = new Map<string, string>();
  let folders = 0;
  for (const s of incoming.sections) {
    const existing = sections.find((x) => x.name.toLowerCase() === s.name.toLowerCase());
    if (existing) idMap.set(s.id, existing.id);
    else {
      const id = newId();
      sections.push({ id, name: s.name, createdAt: Date.now() });
      idMap.set(s.id, id);
      folders++;
    }
  }
  const notes = [...current.notes];
  let count = 0;
  for (const n of [...incoming.notes].sort((a, b) => sortKey(a) - sortKey(b))) {
    const sectionId = idMap.get(n.sectionId) ?? sections[0].id;
    if (!n.text) continue; // images-only notes can't come along without their files
    const copy: Note = {
      id: newId(),
      sectionId,
      text: n.text,
      priority: n.priority,
      done: n.done,
      createdAt: n.createdAt,
    };
    if (n.done) copy.completedAt = n.completedAt ?? n.createdAt;
    if (n.order !== undefined) copy.order = n.order;
    notes.push(copy);
    count++;
  }
  return { state: { version: 2, sections, notes }, notes: count, folders };
}

/** Parse either our export envelope or a bare notes.json. */
export function parseImport(text: string): unknown {
  const parsed = JSON.parse(text);
  if (parsed && typeof parsed === "object") {
    if ("state" in parsed) return (parsed as { state: unknown }).state;
  }
  return parsed;
}
