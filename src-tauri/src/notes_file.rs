//! notes.json I/O with the guarantees the UI relies on:
//!   • atomic writes (temp file + rename) — a crash mid-save never truncates the file
//!   • one backup per day in `backups/`, last 7 kept
//!   • quarantine instead of overwrite when the UI can't parse what's on disk
//! Import/export helpers live here too.

use std::path::PathBuf;

use tauri::{AppHandle, Manager};

use crate::notes_io;

pub fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

pub fn notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(notes_io::notes_path(&data_dir(app)?))
}

// ───────────────────────── commands ─────────────────────────

/// Raw contents of notes.json, or None if it doesn't exist yet.
#[tauri::command]
pub fn read_notes(app: AppHandle) -> Result<Option<String>, String> {
    notes_io::read_notes(&data_dir(&app)?).map_err(|e| e.to_string())
}

/// Atomic save (+ daily backup of the previous version).
#[tauri::command]
pub fn write_notes(app: AppHandle, contents: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    crate::note_last_write_hash(&app, notes_io::hash(&contents));
    notes_io::write_notes(&dir, &contents).map_err(|e| e.to_string())
}

/// Move an unreadable notes.json aside so a fresh start doesn't destroy it.
#[tauri::command]
pub fn quarantine_notes(app: AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?;
    let path = dir.join(notes_io::NOTES_FILE);
    if !path.exists() {
        return Ok(String::new());
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let target = dir.join(format!("notes.corrupt-{stamp}.json"));
    std::fs::rename(&path, &target).map_err(|e| e.to_string())?;
    Ok(target.display().to_string())
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupInfo {
    pub name: String,
    pub path: String,
    pub bytes: u64,
    /// YYYY-MM-DD taken from the file name.
    pub date: String,
}

/// Daily backups, newest first.
#[tauri::command]
pub fn list_backups(app: AppHandle) -> Result<Vec<BackupInfo>, String> {
    let dir = data_dir(&app)?.join("backups");
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&dir) {
        for e in entries.flatten() {
            let path = e.path();
            let Some(name) = path
                .file_name()
                .and_then(|n| n.to_str())
                .map(|s| s.to_string())
            else {
                continue;
            };
            if !(name.starts_with("notes-") && name.ends_with(".json")) {
                continue;
            }
            let bytes = e.metadata().map(|m| m.len()).unwrap_or(0);
            let date = name
                .trim_start_matches("notes-")
                .trim_end_matches(".json")
                .to_string();
            out.push(BackupInfo {
                name,
                path: path.display().to_string(),
                bytes,
                date,
            });
        }
    }
    out.sort_by(|a, b| b.name.cmp(&a.name));
    Ok(out)
}

/// Markdown export with images: `<dest>/<folder_name>/notes.md` + `attachments/<id>` copies.
#[tauri::command]
pub fn export_bundle(
    app: AppHandle,
    dest_dir: String,
    folder_name: String,
    markdown: String,
    attachment_ids: Vec<String>,
) -> Result<String, String> {
    let dest = PathBuf::from(&dest_dir);
    if !dest.is_absolute() {
        return Err("destination must be absolute".into());
    }
    let safe_name: String = folder_name
        .chars()
        .map(|c| {
            if c == '/' || c == ':' || c == '\\' {
                '-'
            } else {
                c
            }
        })
        .collect();
    let root = dest.join(safe_name.trim());
    let att_out = root.join("attachments");
    std::fs::create_dir_all(&att_out).map_err(|e| e.to_string())?;
    std::fs::write(root.join("notes.md"), markdown).map_err(|e| e.to_string())?;
    let src = crate::attachments::dir(&app)?;
    let mut copied = 0;
    for id in attachment_ids {
        if id.contains('/') || id.contains('\\') || id.starts_with('.') {
            continue;
        }
        let from = src.join(&id);
        if from.exists() && std::fs::copy(&from, att_out.join(&id)).is_ok() {
            copied += 1;
        }
    }
    let _ = copied;
    Ok(root.display().to_string())
}

/// Write arbitrary text to a user-chosen path (export). Only absolute paths.
#[tauri::command]
pub fn write_text_file(path: String, contents: String) -> Result<(), String> {
    let p = PathBuf::from(&path);
    if !p.is_absolute() {
        return Err("path must be absolute".into());
    }
    std::fs::write(&p, contents).map_err(|e| e.to_string())
}

/// Read a user-chosen text file (import), capped at 50 MB.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let p = PathBuf::from(&path);
    if !p.is_absolute() {
        return Err("path must be absolute".into());
    }
    let meta = std::fs::metadata(&p).map_err(|e| e.to_string())?;
    if meta.len() > 50 * 1024 * 1024 {
        return Err("file too large".into());
    }
    std::fs::read_to_string(&p).map_err(|e| e.to_string())
}
