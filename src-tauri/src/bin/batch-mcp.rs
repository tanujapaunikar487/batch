//! batch-mcp — a local Model Context Protocol server (stdio, JSON-RPC 2.0) that
//! lets an AI coding agent read and update your Batch notes. It reads/writes the
//! same `notes.json` the app uses (atomic, with daily backups); the app watches
//! that file and refreshes live. Everything stays on this Mac.
//!
//! Wire it up (Claude Code):
//!   claude mcp add batch -- /Applications/Batch.app/Contents/MacOS/batch-mcp

use std::io::{BufRead, Write};
use std::path::PathBuf;

use serde_json::{json, Value};

#[path = "../notes_io.rs"]
mod notes_io;

const PROTOCOL: &str = "2024-11-05";

fn data_dir() -> PathBuf {
    notes_io::default_data_dir().unwrap_or_else(|| PathBuf::from("."))
}

fn load() -> Value {
    match notes_io::read_notes(&data_dir()) {
        Ok(Some(s)) => serde_json::from_str(&s).unwrap_or_else(|_| empty_state()),
        _ => empty_state(),
    }
}

fn save(state: &Value) -> Result<(), String> {
    let s = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    notes_io::write_notes(&data_dir(), &s).map_err(|e| e.to_string())
}

fn empty_state() -> Value {
    json!({ "version": 2, "sections": [{ "id": "inbox", "name": "Untitled", "createdAt": 0 }], "notes": [] })
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

fn new_id() -> String {
    // Time + counter; unique enough for a single-process sidecar.
    use std::sync::atomic::{AtomicU64, Ordering};
    static N: AtomicU64 = AtomicU64::new(0);
    format!("mcp-{}-{}", now_ms(), N.fetch_add(1, Ordering::Relaxed))
}

fn section_name(state: &Value, id: &str) -> String {
    state["sections"]
        .as_array()
        .and_then(|a| a.iter().find(|s| s["id"] == id))
        .and_then(|s| s["name"].as_str())
        .unwrap_or("Untitled")
        .to_string()
}

/// Resolve a folder argument (id or name, case-insensitive) → section id.
fn resolve_folder(state: &Value, arg: Option<&str>) -> Option<String> {
    let sections = state["sections"].as_array()?;
    match arg {
        None => sections
            .first()
            .and_then(|s| s["id"].as_str())
            .map(String::from),
        Some(q) => sections
            .iter()
            .find(|s| {
                s["id"] == q
                    || s["name"]
                        .as_str()
                        .map(|n| n.eq_ignore_ascii_case(q))
                        .unwrap_or(false)
            })
            .and_then(|s| s["id"].as_str())
            .map(String::from),
    }
}

fn note_summary(state: &Value, n: &Value) -> Value {
    json!({
        "id": n["id"],
        "text": n["text"],
        "folder": section_name(state, n["sectionId"].as_str().unwrap_or("")),
        "priority": n["priority"],
        "done": n["done"].as_bool().unwrap_or(false),
        "hasImages": n["attachments"].as_array().map(|a| !a.is_empty()).unwrap_or(false),
        "outcome": n.get("outcome").cloned().unwrap_or(Value::Null),
    })
}

// ───────────────────────── tools ─────────────────────────

fn tool_defs() -> Value {
    json!([
        { "name": "list_folders", "description": "List Batch folders (name + open/total note counts).",
          "inputSchema": { "type": "object", "properties": {} } },
        { "name": "list_notes", "description": "List notes, optionally filtered by folder and status.",
          "inputSchema": { "type": "object", "properties": {
            "folder": { "type": "string", "description": "Folder id or name (default: all folders)" },
            "status": { "type": "string", "enum": ["all","open","done"], "description": "default open" } } } },
        { "name": "get_note", "description": "Get one note by id.",
          "inputSchema": { "type": "object", "properties": { "id": { "type": "string" } }, "required": ["id"] } },
        { "name": "add_note", "description": "Add a note to a folder.",
          "inputSchema": { "type": "object", "properties": {
            "folder": { "type": "string" }, "text": { "type": "string" },
            "priority": { "type": "string", "enum": ["high","medium","low"] } }, "required": ["text"] } },
        { "name": "mark_done", "description": "Mark notes done by id.",
          "inputSchema": { "type": "object", "properties": { "ids": { "type": "array", "items": { "type": "string" } } }, "required": ["ids"] } },
        { "name": "mark_open", "description": "Mark notes not-done by id.",
          "inputSchema": { "type": "object", "properties": { "ids": { "type": "array", "items": { "type": "string" } } }, "required": ["ids"] } },
        { "name": "reply", "description": "Attach an outcome/answer to a note (shown under it in Batch).",
          "inputSchema": { "type": "object", "properties": { "id": { "type": "string" }, "text": { "type": "string" } }, "required": ["id","text"] } }
    ])
}

fn text_result(s: String) -> Value {
    json!({ "content": [{ "type": "text", "text": s }] })
}

fn call_tool(name: &str, args: &Value) -> Result<Value, String> {
    let mut state = load();
    match name {
        "list_folders" => {
            let notes = state["notes"].as_array().cloned().unwrap_or_default();
            let folders: Vec<Value> = state["sections"]
                .as_array()
                .cloned()
                .unwrap_or_default()
                .iter()
                .map(|s| {
                    let id = s["id"].as_str().unwrap_or("");
                    let total = notes
                        .iter()
                        .filter(|n| n["sectionId"] == id && n["kind"] != "heading")
                        .count();
                    let open = notes
                        .iter()
                        .filter(|n| {
                            n["sectionId"] == id
                                && n["kind"] != "heading"
                                && !n["done"].as_bool().unwrap_or(false)
                        })
                        .count();
                    json!({ "id": id, "name": s["name"], "open": open, "total": total })
                })
                .collect();
            Ok(text_result(
                serde_json::to_string_pretty(&folders).unwrap_or_default(),
            ))
        }
        "list_notes" => {
            let folder = args["folder"].as_str();
            let status = args["status"].as_str().unwrap_or("open");
            let fid = folder.and_then(|f| resolve_folder(&state, Some(f)));
            let notes = state["notes"].as_array().cloned().unwrap_or_default();
            let out: Vec<Value> = notes
                .iter()
                .filter(|n| {
                    if n["kind"] == "heading" {
                        return false;
                    }
                    if let Some(ref f) = fid {
                        if n["sectionId"] != *f {
                            return false;
                        }
                    }
                    let done = n["done"].as_bool().unwrap_or(false);
                    match status {
                        "open" => !done,
                        "done" => done,
                        _ => true,
                    }
                })
                .map(|n| note_summary(&state, n))
                .collect();
            Ok(text_result(
                serde_json::to_string_pretty(&out).unwrap_or_default(),
            ))
        }
        "get_note" => {
            let id = args["id"].as_str().ok_or("id required")?;
            let notes = state["notes"].as_array().cloned().unwrap_or_default();
            let n = notes.iter().find(|n| n["id"] == id).ok_or("no such note")?;
            Ok(text_result(
                serde_json::to_string_pretty(&note_summary(&state, n)).unwrap_or_default(),
            ))
        }
        "add_note" => {
            let text = args["text"]
                .as_str()
                .ok_or("text required")?
                .trim()
                .to_string();
            if text.is_empty() {
                return Err("text is empty".into());
            }
            let fid = resolve_folder(&state, args["folder"].as_str()).ok_or("unknown folder")?;
            let priority = match args["priority"].as_str() {
                Some("high") => "high",
                Some("low") => "low",
                _ => "medium",
            };
            let id = new_id();
            let note = json!({ "id": id, "sectionId": fid, "text": text, "priority": priority, "done": false, "createdAt": now_ms() });
            state["notes"].as_array_mut().ok_or("bad state")?.push(note);
            save(&state)?;
            Ok(text_result(format!("Added note {id}")))
        }
        "mark_done" | "mark_open" => {
            let done = name == "mark_done";
            let ids: Vec<String> = args["ids"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|v| v.as_str().map(String::from))
                        .collect()
                })
                .unwrap_or_default();
            let mut changed = 0;
            if let Some(arr) = state["notes"].as_array_mut() {
                for n in arr.iter_mut() {
                    if n["kind"] == "heading" {
                        continue;
                    }
                    if ids.iter().any(|id| n["id"] == id.as_str()) {
                        n["done"] = json!(done);
                        if done {
                            n["completedAt"] = json!(now_ms());
                        } else {
                            n.as_object_mut().map(|o| o.remove("completedAt"));
                        }
                        changed += 1;
                    }
                }
            }
            save(&state)?;
            Ok(text_result(format!(
                "{} {changed} note(s)",
                if done { "Completed" } else { "Reopened" }
            )))
        }
        "reply" => {
            let id = args["id"].as_str().ok_or("id required")?;
            let text = args["text"]
                .as_str()
                .ok_or("text required")?
                .trim()
                .to_string();
            if text.is_empty() {
                return Err("text is empty".into());
            }
            let mut ok = false;
            if let Some(arr) = state["notes"].as_array_mut() {
                for n in arr.iter_mut() {
                    if n["id"] == id {
                        n["outcome"] = json!({ "text": text, "at": now_ms(), "by": "agent" });
                        ok = true;
                        break;
                    }
                }
            }
            if !ok {
                return Err("no such note".into());
            }
            save(&state)?;
            Ok(text_result(format!("Replied to {id}")))
        }
        other => Err(format!("unknown tool: {other}")),
    }
}

// ───────────────────────── JSON-RPC loop ─────────────────────────

fn respond(id: &Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}
fn respond_err(id: &Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}

fn main() {
    let stdin = std::io::stdin();
    let mut stdout = std::io::stdout();
    for line in stdin.lock().lines() {
        let Ok(line) = line else { break };
        if line.trim().is_empty() {
            continue;
        }
        let msg: Value = match serde_json::from_str(&line) {
            Ok(v) => v,
            Err(_) => continue,
        };
        let method = msg["method"].as_str().unwrap_or("");
        let id = msg.get("id").cloned();
        // Notifications (no id) get no response.
        let reply: Option<Value> = match method {
            "initialize" => Some(respond(
                id.as_ref().unwrap_or(&Value::Null),
                json!({
                    "protocolVersion": PROTOCOL,
                    "capabilities": { "tools": {} },
                    "serverInfo": { "name": "batch", "version": "1.1.0" }
                }),
            )),
            "notifications/initialized" => None,
            "ping" => Some(respond(id.as_ref().unwrap_or(&Value::Null), json!({}))),
            "tools/list" => Some(respond(
                id.as_ref().unwrap_or(&Value::Null),
                json!({ "tools": tool_defs() }),
            )),
            "tools/call" => {
                let idref = id.clone().unwrap_or(Value::Null);
                let tname = msg["params"]["name"].as_str().unwrap_or("");
                let args = msg["params"].get("arguments").cloned().unwrap_or(json!({}));
                Some(match call_tool(tname, &args) {
                    Ok(mut r) => {
                        r["isError"] = json!(false);
                        respond(&idref, r)
                    }
                    Err(e) => respond(
                        &idref,
                        json!({ "content": [{ "type": "text", "text": e }], "isError": true }),
                    ),
                })
            }
            _ if id.is_some() => Some(respond_err(&id.unwrap(), -32601, "method not found")),
            _ => None,
        };
        if let Some(r) = reply {
            let _ = writeln!(stdout, "{}", serde_json::to_string(&r).unwrap());
            let _ = stdout.flush();
        }
    }
}
