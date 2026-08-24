//! Pure notes.json I/O keyed on the data directory (no Tauri) so both the app
//! and the `batch-mcp` sidecar share one implementation:
//!   • atomic writes (temp file + rename)
//!   • one backup per day in `backups/`, last 7 kept
//! The app's `notes_file` commands and the MCP server both call these.

use std::path::{Path, PathBuf};

pub const NOTES_FILE: &str = "notes.json";
pub const BUNDLE_ID: &str = "dev.tanuja.batch";
const KEEP_BACKUPS: usize = 7;

/// `~/Library/Application Support/dev.tanuja.batch` — where the app keeps notes.
/// Used by the sidecar, which has no Tauri `AppHandle`.
pub fn default_data_dir() -> Option<PathBuf> {
    let home = std::env::var_os("HOME")?;
    Some(
        PathBuf::from(home)
            .join("Library")
            .join("Application Support")
            .join(BUNDLE_ID),
    )
}

pub fn notes_path(dir: &Path) -> PathBuf {
    dir.join(NOTES_FILE)
}

pub fn read_notes(dir: &Path) -> std::io::Result<Option<String>> {
    let p = notes_path(dir);
    if !p.exists() {
        return Ok(None);
    }
    std::fs::read_to_string(&p).map(Some)
}

pub fn atomic_write(path: &Path, contents: &str) -> std::io::Result<()> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, contents)?;
    std::fs::rename(&tmp, path)
}

/// Copy today's first version of notes.json into `backups/` and prune old ones.
pub fn backup_daily(dir: &Path) {
    let path = notes_path(dir);
    let backups = dir.join("backups");
    if std::fs::create_dir_all(&backups).is_err() {
        return;
    }
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let target = backups.join(format!("notes-{today}.json"));
    if !target.exists() && path.exists() {
        let _ = std::fs::copy(&path, &target);
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
            let _ = std::fs::remove_file(files.remove(0));
        }
    }
}

/// Save (backing up the previous version first). Creates the dir if needed.
pub fn write_notes(dir: &Path, contents: &str) -> std::io::Result<()> {
    std::fs::create_dir_all(dir)?;
    backup_daily(dir);
    atomic_write(&notes_path(dir), contents)
}

/// FNV-1a hash of the last bytes we wrote, so a directory watcher can tell our
/// own atomic saves apart from an external edit (agent / text editor).
pub fn hash(contents: &str) -> u64 {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in contents.as_bytes() {
        h ^= *b as u64;
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    h
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn atomic_write_and_backup_prune() {
        let dir = std::env::temp_dir().join(format!("batch-io-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        write_notes(&dir, "one").unwrap();
        write_notes(&dir, "two").unwrap();
        assert_eq!(read_notes(&dir).unwrap().unwrap(), "two");
        assert!(!notes_path(&dir).with_extension("json.tmp").exists());
        let backups = dir.join("backups");
        for i in 0..10 {
            std::fs::write(
                backups.join(format!("notes-2020-01-{:02}.json", i + 1)),
                "x",
            )
            .unwrap();
        }
        backup_daily(&dir);
        assert_eq!(std::fs::read_dir(&backups).unwrap().count(), KEEP_BACKUPS);
        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn hash_differs() {
        assert_ne!(hash("a"), hash("b"));
        assert_eq!(hash("same"), hash("same"));
    }
}
