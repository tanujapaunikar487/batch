//! notes.json I/O with the guarantees the UI relies on:
//!   • atomic writes (temp file + rename) — a crash mid-save never truncates the file
//!   • one backup per day in `backups/`, last 7 kept
//!   • quarantine instead of overwrite when the UI can't parse what's on disk
//! Import/export helpers live here too.

use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager};

const NOTES_FILE: &str = "notes.json";
const KEEP_BACKUPS: usize = 7;

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

pub fn notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(data_dir(app)?.join(NOTES_FILE))
}

fn atomic_write(path: &Path, contents: &str) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, contents).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, path).map_err(|e| e.to_string())
}

/// Copy today's first version of notes.json into backups/ and prune old ones.
fn backup_daily(dir: &Path, path: &Path) {
    let backups = dir.join("backups");
    if std::fs::create_dir_all(&backups).is_err() {
        return;
    }
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let target = backups.join(format!("notes-{today}.json"));
    if !target.exists() && path.exists() {
        let _ = std::fs::copy(path, &target);
    }
    if let Ok(entries) = std::fs::read_dir(&backups) {
        let mut files: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| {
                p.file_name()
                    .and_then(|n| n.to_str())
                    .map(|n| n.starts_with("notes-") && n.ends_with(".json"))
                    .unwrap_or(false)
            })
            .collect();
        files.sort();
        while files.len() > KEEP_BACKUPS {
            let oldest = files.remove(0);
            let _ = std::fs::remove_file(oldest);
        }
    }
}

// ───────────────────────── commands ─────────────────────────

/// Raw contents of notes.json, or None if it doesn't exist yet.
#[tauri::command]
pub fn read_notes(app: AppHandle) -> Result<Option<String>, String> {
    let path = notes_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&path)
        .map(Some)
        .map_err(|e| e.to_string())
}

/// Atomic save (+ daily backup of the previous version).
#[tauri::command]
pub fn write_notes(app: AppHandle, contents: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let path = dir.join(NOTES_FILE);
    backup_daily(&dir, &path);
    atomic_write(&path, &contents)
}

/// Move an unreadable notes.json aside so a fresh start doesn't destroy it.
#[tauri::command]
pub fn quarantine_notes(app: AppHandle) -> Result<String, String> {
    let dir = data_dir(&app)?;
    let path = dir.join(NOTES_FILE);
    if !path.exists() {
        return Ok(String::new());
    }
    let stamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let target = dir.join(format!("notes.corrupt-{stamp}.json"));
    std::fs::rename(&path, &target).map_err(|e| e.to_string())?;
    Ok(target.display().to_string())
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_replaces_and_leaves_no_tmp() {
        let dir = std::env::temp_dir().join(format!("batch-nf-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let p = dir.join("notes.json");
        atomic_write(&p, "one").unwrap();
        atomic_write(&p, "two").unwrap();
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "two");
        assert!(!p.with_extension("json.tmp").exists());
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn backups_pruned_to_keep_limit() {
        let dir = std::env::temp_dir().join(format!("batch-bk-{}", std::process::id()));
        let backups = dir.join("backups");
        std::fs::create_dir_all(&backups).unwrap();
        for i in 0..10 {
            std::fs::write(
                backups.join(format!("notes-2020-01-{:02}.json", i + 1)),
                "x",
            )
            .unwrap();
        }
        let p = dir.join("notes.json");
        std::fs::write(&p, "current").unwrap();
        backup_daily(&dir, &p);
        let n = std::fs::read_dir(&backups).unwrap().count();
        assert_eq!(n, KEEP_BACKUPS);
        let _ = std::fs::remove_dir_all(dir);
    }
}
