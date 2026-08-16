import { type Priority } from "@/lib/notes";

/** Visual treatment per priority. Kept out of todos.ts so the domain stays UI-free. */
export const PRIORITY_UI: Record<
  Priority,
  { label: string; dot: string; text: string; ring: string; shortcut: string }
> = {
  high: {
    label: "High",
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    ring: "ring-red-500/40",
    shortcut: "⌘1",
  },
  medium: {
    label: "Medium",
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    ring: "ring-amber-500/40",
    shortcut: "⌘2",
  },
  low: {
    label: "Low",
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    ring: "ring-sky-500/40",
    shortcut: "⌘3",
  },
};
