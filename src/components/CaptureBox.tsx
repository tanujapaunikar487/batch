import { forwardRef, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { CornerDownLeft, FolderPlus, ImagePlus, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { type Attachment, MAX_ATTACHMENTS } from "@/lib/notes";
import { imagesFromDataTransfer, saveImages } from "@/store/attachments";
import { AttachmentStrip } from "./AttachmentStrip";

interface Props {
  placeholder: string;
  attachmentsDir: string;
  /** Return true when accepted (clears the box). */
  onSubmit: (text: string, attachments: Attachment[]) => boolean;
  /** ↑ on the first line — hand focus to the list (which sits above the box). */
  onArrowUpOut: () => void;
  onNewFolder: () => void;
  onNotice: (msg: string) => void;
  /** A drag is hovering over the box (App owns drop handling). */
  dropTarget?: boolean;
}

export interface CaptureBoxHandle {
  focus: () => void;
  isEmpty: () => boolean;
  clear: () => void;
  /** Add already-stored attachments (e.g. from a native file drop). */
  addAttachments: (atts: Attachment[], skipped?: number) => void;
  /** Store + add image files (paste / picker / HTML5 drop). */
  addFiles: (files: File[]) => Promise<void>;
  count: () => number;
}

const MAX_ROWS = 6;

export const CaptureBox = forwardRef<CaptureBoxHandle, Props>(function CaptureBox(
  { placeholder, attachmentsDir, onSubmit, onArrowUpOut, onNewFolder, onNotice, dropTarget },
  ref,
) {
  const [value, setValue] = useState("");
  const [atts, setAtts] = useState<Attachment[]>([]);
  const [busy, setBusy] = useState(false);
  const ta = useRef<HTMLTextAreaElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const attsRef = useRef(atts);
  attsRef.current = atts;

  const addAttachments = (more: Attachment[], skipped = 0) => {
    setAtts((cur) => {
      const room = Math.max(0, MAX_ATTACHMENTS - cur.length);
      const next = [...cur, ...more.slice(0, room)];
      const dropped = skipped + Math.max(0, more.length - room);
      if (dropped > 0) onNotice(`Up to ${MAX_ATTACHMENTS} images per note — ${dropped} skipped`);
      return next;
    });
  };

  const addFiles = async (files: File[]) => {
    if (files.length === 0) return;
    setBusy(true);
    try {
      const { saved, skipped } = await saveImages(files, attsRef.current.length);
      addAttachments(saved, skipped);
    } finally {
      setBusy(false);
      ta.current?.focus();
    }
  };

  useImperativeHandle(ref, () => ({
    focus: () => ta.current?.focus(),
    isEmpty: () => value.trim().length === 0 && atts.length === 0,
    clear: () => {
      setValue("");
      setAtts([]);
    },
    addAttachments,
    addFiles,
    count: () => attsRef.current.length,
  }));

  useLayoutEffect(() => {
    const el = ta.current;
    if (!el) return;
    el.style.height = "0px";
    const line = 20;
    const max = MAX_ROWS * line + 16;
    el.style.height = Math.min(el.scrollHeight, max) + "px";
    el.style.overflowY = el.scrollHeight > max ? "auto" : "hidden";
  }, [value]);

  const submit = () => {
    if (busy) return;
    if (onSubmit(value, atts)) {
      setValue("");
      setAtts([]);
    }
  };
  const canSubmit = !busy && (value.trim().length > 0 || atts.length > 0);

  return (
    <div className="border-t border-border/60 px-3 pb-2 pt-2" data-dropzone="capture">
      <div
        className={cn(
          "rounded-lg border border-input bg-background/60 transition-colors dark:bg-input/40",
          "focus-within:border-ring/50 focus-within:ring-[3px] focus-within:ring-ring/10",
          dropTarget && "border-ring ring-[3px] ring-ring/25",
        )}
      >
        {atts.length > 0 && (
          <AttachmentStrip
            attachments={atts}
            dir={attachmentsDir}
            size="md"
            onRemove={(id) => setAtts((cur) => cur.filter((a) => a.id !== id))}
            className="px-2 pt-2"
          />
        )}
        <div className="flex items-start gap-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Add"
                title="Attach images · New folder"
                className="mt-1.5 ml-1.5 grid size-6 shrink-0 place-items-center rounded-full border border-muted-foreground/40 text-muted-foreground transition-colors hover:border-foreground hover:text-foreground aria-expanded:text-foreground"
              >
                <Plus className="size-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="min-w-44">
              <DropdownMenuItem onSelect={() => fileInput.current?.click()}>
                <ImagePlus /> Attach images…
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onNewFolder}>
                <FolderPlus /> New folder
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              e.target.value = "";
              void addFiles(files);
            }}
          />
          <textarea
            ref={ta}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onPaste={(e) => {
              const files = imagesFromDataTransfer(e.clipboardData);
              if (files.length) {
                e.preventDefault();
                void addFiles(files);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape") {
                // With content: clear it here. Empty: let it bubble to the app-level Esc cascade.
                if (value || atts.length) {
                  e.preventDefault();
                  e.stopPropagation();
                  setValue("");
                  setAtts([]);
                }
              } else if (e.key === "ArrowUp" && !e.metaKey && !e.altKey) {
                const el = e.currentTarget;
                const beforeCaret = el.value.slice(0, el.selectionStart);
                if (!beforeCaret.includes("\n")) {
                  e.preventDefault();
                  onArrowUpOut();
                }
              }
            }}
            rows={1}
            placeholder={busy ? "Saving image…" : placeholder}
            aria-label="Capture"
            autoComplete="off"
            spellCheck
            className="block min-w-0 flex-1 resize-none bg-transparent py-2 pr-8 text-sm leading-5 outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            aria-label="Add note"
            className="mr-1.5 mt-1.5 grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground/60 transition-colors hover:text-foreground disabled:opacity-40"
          >
            <CornerDownLeft className="size-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
});
