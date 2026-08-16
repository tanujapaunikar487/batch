/**
 * Attachment I/O. In the app: bytes go to Rust (`save_attachment`, raw IPC body)
 * which writes `<app data>/attachments/<uuid>.<ext>` + a PNG thumbnail; the UI
 * shows them through the asset protocol. In the browser (dev): inline data URLs.
 */
import { convertFileSrc, invoke } from "@tauri-apps/api/core";
import { type Attachment, MAX_ATTACHMENTS } from "@/lib/notes";
import { native } from "@/lib/native";
import { isTauri } from "./persistence";

export { MAX_ATTACHMENTS };

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|tiff?|heic)$/i;
export const isImageFile = (f: { type?: string; name?: string }) =>
  (f.type ?? "").startsWith("image/") || IMAGE_EXT.test(f.name ?? "");

let dirPromise: Promise<string> | null = null;
export function attachmentsDir(): Promise<string> {
  if (!dirPromise) dirPromise = native.attachmentsDir().then((d) => d ?? "");
  return dirPromise;
}

/** URL for <img src>. Prefer the thumbnail unless `full`. */
export function attachmentSrc(a: Attachment, dir: string, full = false): string {
  if (a.dataUrl) return a.dataUrl;
  if (!dir) return "";
  const rel = !full && a.thumb ? `thumbs/${a.id}.png` : a.id;
  return convertFileSrc(`${dir}/${rel}`);
}

async function readDims(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bmp = await createImageBitmap(blob);
    const d = { width: bmp.width, height: bmp.height };
    bmp.close();
    return d;
  } catch {
    return { width: 0, height: 0 };
  }
}

const asciiName = (name: string, mime: string) => {
  if (name && /^[\x20-\x7e]+$/.test(name)) return name;
  const ext = mime.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return `image.${ext}`;
};

/** Store one image (from paste / picker / drop). */
export async function saveImage(blob: Blob, name = ""): Promise<Attachment> {
  const mime = blob.type || "image/png";
  if (isTauri()) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    return invoke<Attachment>("save_attachment", bytes, {
      headers: { "x-name": asciiName(name, mime), "x-mime": mime },
    });
  }
  // Browser dev fallback: inline.
  const dataUrl = await new Promise<string>((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });
  const dims = await readDims(blob);
  return {
    id: `${crypto.randomUUID()}.${mime.split("/")[1] ?? "png"}`,
    name: name || "image",
    mime,
    thumb: false,
    ...dims,
    dataUrl,
  };
}

/** Save several, respecting the per-note cap given how many are already there. */
export async function saveImages(files: Blob[], already: number): Promise<{ saved: Attachment[]; skipped: number }> {
  const room = Math.max(0, MAX_ATTACHMENTS - already);
  const take = files.slice(0, room);
  const saved: Attachment[] = [];
  for (const f of take) {
    try {
      saved.push(await saveImage(f, (f as File).name ?? ""));
    } catch (e) {
      console.error("[batch] save image:", e);
    }
  }
  return { saved, skipped: files.length - take.length };
}

/** Files dropped onto the native window arrive as paths. */
export async function importPaths(paths: string[], already: number): Promise<{ saved: Attachment[]; skipped: number }> {
  const room = Math.max(0, MAX_ATTACHMENTS - already);
  const take = paths.filter((p) => IMAGE_EXT.test(p)).slice(0, room);
  const saved = (await native.importAttachments(take)) ?? [];
  return { saved, skipped: paths.length - take.length };
}

/** Image blobs from a paste / HTML5 drop event. */
export function imagesFromDataTransfer(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  const out: File[] = [];
  for (const item of Array.from(dt.items ?? [])) {
    if (item.kind === "file") {
      const f = item.getAsFile();
      if (f && isImageFile(f)) out.push(f);
    }
  }
  if (out.length === 0) for (const f of Array.from(dt.files ?? [])) if (isImageFile(f)) out.push(f);
  return out;
}

/** Native drag-out of the note's image files (macOS). No-op in the browser. */
export async function dragOut(ids: string[], dir: string, iconAtt?: Attachment) {
  if (!isTauri() || ids.length === 0) return;
  const paths = (await native.attachmentPaths(ids)) ?? [];
  if (paths.length === 0) return;
  const { startDrag } = await import("@crabnebula/tauri-plugin-drag");
  const icon = iconAtt ? `${dir}/${iconAtt.thumb ? `thumbs/${iconAtt.id}.png` : iconAtt.id}` : paths[0];
  await startDrag({ item: paths, icon });
}
