//! Image attachments: files under `<app data>/attachments/`, PNG thumbnails
//! under `attachments/thumbs/`, and the native pasteboard writer that puts
//! text + files on the clipboard together (one paste into ChatGPT/Claude/Cursor
//! brings both).

use std::path::{Path, PathBuf};

use tauri::{ipc::Request, AppHandle, Manager};

pub const MAX_PER_NOTE: usize = 10;
const THUMB_MAX: u32 = 256;
const ALLOWED_EXT: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "bmp", "tiff", "tif", "heic",
];

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Attachment {
    /// File name inside the attachments dir (uuid + extension).
    pub id: String,
    /// Original file name, for display.
    pub name: String,
    pub mime: String,
    /// A `thumbs/<id>.png` exists.
    pub thumb: bool,
    pub width: u32,
    pub height: u32,
}

pub fn dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("attachments");
    std::fs::create_dir_all(d.join("thumbs")).map_err(|e| e.to_string())?;
    Ok(d)
}

/// Only plain file names — never paths — are accepted from the UI.
fn safe_id(id: &str) -> Result<&str, String> {
    if id.is_empty() || id.contains('/') || id.contains('\\') || id.starts_with('.') {
        return Err("invalid attachment id".into());
    }
    Ok(id)
}

fn ext_from(name: &str, mime: &str) -> Option<String> {
    let by_name = Path::new(name)
        .extension()
        .and_then(|e| e.to_str())
        .map(|e| e.to_ascii_lowercase());
    let by_mime = match mime {
        "image/png" => Some("png"),
        "image/jpeg" => Some("jpg"),
        "image/gif" => Some("gif"),
        "image/webp" => Some("webp"),
        "image/bmp" => Some("bmp"),
        "image/tiff" => Some("tiff"),
        "image/heic" | "image/heif" => Some("heic"),
        _ => None,
    }
    .map(str::to_string);
    let ext = by_name
        .filter(|e| ALLOWED_EXT.contains(&e.as_str()))
        .or(by_mime)?;
    ALLOWED_EXT.contains(&ext.as_str()).then_some(ext)
}

fn mime_for(ext: &str) -> &'static str {
    match ext {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "tiff" | "tif" => "image/tiff",
        "heic" => "image/heic",
        _ => "application/octet-stream",
    }
}

/// Decode, record dimensions, write a ≤256px PNG thumbnail. Returns (w, h, has_thumb).
fn make_thumb(bytes: &[u8], thumb_path: &Path) -> (u32, u32, bool) {
    match image::load_from_memory(bytes) {
        Ok(img) => {
            let (w, h) = (img.width(), img.height());
            let thumb = img.thumbnail(THUMB_MAX, THUMB_MAX);
            let ok = thumb
                .save_with_format(thumb_path, image::ImageFormat::Png)
                .is_ok();
            (w, h, ok)
        }
        Err(_) => (0, 0, false),
    }
}

fn store_bytes(
    app: &AppHandle,
    bytes: &[u8],
    name: &str,
    mime: &str,
) -> Result<Attachment, String> {
    let ext =
        ext_from(name, mime).ok_or_else(|| format!("unsupported image type: {name} ({mime})"))?;
    let d = dir(app)?;
    let id = format!("{}.{ext}", uuid::Uuid::new_v4());
    let path = d.join(&id);
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    let (width, height, thumb) = make_thumb(bytes, &d.join("thumbs").join(format!("{id}.png")));
    let display_name = if name.trim().is_empty() {
        id.clone()
    } else {
        name.to_string()
    };
    Ok(Attachment {
        id,
        name: display_name,
        mime: mime_for(&ext).to_string(),
        thumb,
        width,
        height,
    })
}

// ───────────────────────── commands ─────────────────────────

#[tauri::command]
pub fn attachments_dir(app: AppHandle) -> Result<String, String> {
    Ok(dir(&app)?.display().to_string())
}

/// Raw-body IPC: `invoke("save_attachment", bytes, { headers: { "x-name", "x-mime" } })`.
#[tauri::command]
pub fn save_attachment(app: AppHandle, request: Request<'_>) -> Result<Attachment, String> {
    let header = |k: &str| {
        request
            .headers()
            .get(k)
            .and_then(|v| v.to_str().ok())
            .map(|s| s.to_string())
            .unwrap_or_default()
    };
    let name = header("x-name");
    let mime = header("x-mime");
    let bytes = match request.body() {
        tauri::ipc::InvokeBody::Raw(b) => b.as_slice(),
        _ => return Err("expected raw bytes".into()),
    };
    if bytes.is_empty() {
        return Err("empty image".into());
    }
    store_bytes(&app, bytes, &name, &mime)
}

/// Files dropped onto the window (Tauri hands us paths). Non-images are skipped.
#[tauri::command]
pub fn import_attachments(app: AppHandle, paths: Vec<String>) -> Result<Vec<Attachment>, String> {
    let mut out = Vec::new();
    for p in paths.iter().take(MAX_PER_NOTE) {
        let path = Path::new(p);
        let name = path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("image")
            .to_string();
        let ext = path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| e.to_ascii_lowercase())
            .unwrap_or_default();
        if !ALLOWED_EXT.contains(&ext.as_str()) {
            continue;
        }
        let bytes = match std::fs::read(path) {
            Ok(b) => b,
            Err(e) => {
                eprintln!("[batch] cannot read {p}: {e}");
                continue;
            }
        };
        match store_bytes(&app, &bytes, &name, mime_for(&ext)) {
            Ok(a) => out.push(a),
            Err(e) => eprintln!("[batch] import {p}: {e}"),
        }
    }
    Ok(out)
}

/// Delete attachment files not referenced by any note. Called after a
/// successful load, so undo history never points at missing files mid-session.
#[tauri::command]
pub fn gc_attachments(app: AppHandle, keep: Vec<String>) -> Result<usize, String> {
    let d = dir(&app)?;
    let keep: std::collections::HashSet<String> = keep.into_iter().collect();
    let mut removed = 0;
    if let Ok(entries) = std::fs::read_dir(&d) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let Some(name) = path.file_name().and_then(|n| n.to_str()) else {
                continue;
            };
            if !keep.contains(name) && std::fs::remove_file(&path).is_ok() {
                let _ = std::fs::remove_file(d.join("thumbs").join(format!("{name}.png")));
                removed += 1;
            }
        }
    }
    Ok(removed)
}

/// Open an attachment in the default viewer (Preview).
#[tauri::command]
pub fn open_attachment(app: AppHandle, id: String) -> Result<(), String> {
    let id = safe_id(&id)?;
    let path = dir(&app)?.join(id);
    if !path.exists() {
        return Err("attachment missing".into());
    }
    std::process::Command::new("open")
        .arg(path)
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

/// Absolute paths for a set of ids (for drag-out).
#[tauri::command]
pub fn attachment_paths(app: AppHandle, ids: Vec<String>) -> Result<Vec<String>, String> {
    let d = dir(&app)?;
    Ok(ids
        .iter()
        .filter_map(|id| safe_id(id).ok())
        .map(|id| d.join(id))
        .filter(|p| p.exists())
        .map(|p| p.display().to_string())
        .collect())
}

/// Text + image files on the general pasteboard at once. Apps that accept
/// pasted files (ChatGPT, Claude, Cursor, Finder…) get the images; text fields
/// get the text.
#[tauri::command]
pub fn copy_rich(app: AppHandle, text: String, ids: Vec<String>) -> Result<(), String> {
    let d = dir(&app)?;
    let paths: Vec<PathBuf> = ids
        .iter()
        .filter_map(|id| safe_id(id).ok())
        .map(|id| d.join(id))
        .filter(|p| p.exists())
        .collect();
    write_pasteboard(&text, &paths)
}

/// Put `text` (optional) and file URLs on the general pasteboard as separate items.
#[cfg(target_os = "macos")]
pub fn write_pasteboard(text: &str, paths: &[PathBuf]) -> Result<(), String> {
    use objc2::runtime::ProtocolObject;
    use objc2_app_kit::{NSPasteboard, NSPasteboardWriting};
    use objc2_foundation::{NSArray, NSString, NSURL};

    let pb = NSPasteboard::generalPasteboard();
    pb.clearContents();
    let mut objects: Vec<objc2::rc::Retained<ProtocolObject<dyn NSPasteboardWriting>>> = Vec::new();
    if !text.is_empty() {
        objects.push(ProtocolObject::from_retained(NSString::from_str(text)));
    }
    for p in paths {
        let url = NSURL::fileURLWithPath(&NSString::from_str(&p.display().to_string()));
        objects.push(ProtocolObject::from_retained(url));
    }
    if objects.is_empty() {
        return Ok(());
    }
    let array = NSArray::from_retained_slice(&objects);
    if !pb.writeObjects(&array) {
        return Err("pasteboard write failed".into());
    }
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub fn write_pasteboard(_text: &str, _paths: &[PathBuf]) -> Result<(), String> {
    Err("rich copy is macOS-only".into())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn thumbnail_from_png_bytes() {
        let bytes = include_bytes!("../icons/128x128.png");
        let tmp = std::env::temp_dir().join("batch-test-thumb.png");
        let (w, h, ok) = make_thumb(bytes, &tmp);
        assert_eq!((w, h), (128, 128));
        assert!(ok && tmp.exists());
        let _ = std::fs::remove_file(tmp);
    }

    #[test]
    fn ext_detection() {
        assert_eq!(ext_from("shot.PNG", "").as_deref(), Some("png"));
        assert_eq!(ext_from("blob", "image/jpeg").as_deref(), Some("jpg"));
        assert_eq!(ext_from("x.svg", "image/svg+xml"), None);
        assert!(safe_id("../x.png").is_err());
        assert!(safe_id("a.png").is_ok());
    }

    #[cfg(target_os = "macos")]
    #[test]
    #[ignore = "touches the real clipboard; run explicitly"]
    fn pasteboard_text_and_files() {
        let icon = std::fs::canonicalize("icons/128x128.png").unwrap();
        write_pasteboard("hello from batch", &[icon]).unwrap();
    }
}
