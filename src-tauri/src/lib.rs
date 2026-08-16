//! Batch — native shell for the menu-bar checklist.
//!
//! Responsibilities (everything else lives in the React UI):
//!   • menu-bar tray icon (left-click toggles the popover, right-click menu)
//!   • global hotkey (default ⌥⇧Space, user-configurable) to toggle from anywhere
//!   • double-tap Shift to toggle (CGEventTap; needs Accessibility) — `double_shift.rs`
//!   • positioning the popover centred under the tray icon
//!   • hide-on-blur unless the UI has asked to be "pinned"
//!   • small native helpers: open links, reveal the notes file, accessibility prompt
//!   • macOS niceties: no Dock icon, vibrancy backdrop, focus hand-back on hide

use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex,
};
use std::time::{Duration, Instant};

use tauri::{
    image::Image,
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, Manager, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{GlobalShortcutExt, Shortcut, ShortcutState};
use tauri_plugin_store::StoreExt;

#[cfg(target_os = "macos")]
mod double_shift;

const MAIN_WINDOW: &str = "main";
const TRAY_ID: &str = "main-tray";
/// Event the UI listens to so it can focus the capture input.
const SHOWN_EVENT: &str = "batch://shown";
/// Gap between the menu bar and the top of the popover, in points.
const TRAY_GAP: f64 = 8.0;
/// If the window was auto-hidden this recently, a tray click is treated as the
/// click that closed it (blur fires before the click event), not a reopen.
const REOPEN_GUARD: Duration = Duration::from_millis(300);

/// Debug-only diagnostics: stderr + `$TMPDIR/batch-dev.log` (so an app launched
/// via Finder/`open`, where stderr goes nowhere, can still be inspected).
#[macro_export]
macro_rules! dlog {
    ($($arg:tt)*) => {{
        #[cfg(debug_assertions)]
        {
            let line = format!($($arg)*);
            eprintln!("{line}");
            use std::io::Write;
            if let Ok(mut f) = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(std::env::temp_dir().join("batch-dev.log"))
            {
                let _ = writeln!(f, "{line}");
            }
        }
    }};
}

/// Default system-wide toggle hotkey (binding syntax as stored in settings.json).
const DEFAULT_TOGGLE_BINDING: &str = "alt+shift+Space";
const SETTINGS_FILE: &str = "settings.json";
const NOTES_FILE: &str = "notes.json";

/// UI binding syntax ("mod+shift+KeyN") → global-hotkey syntax ("Cmd+Shift+KeyN").
fn binding_to_shortcut(binding: &str) -> Result<Shortcut, String> {
    let converted: Vec<String> = binding
        .split('+')
        .map(|t| match t.trim().to_ascii_lowercase().as_str() {
            "mod" => "Cmd".to_string(),
            "ctrl" => "Ctrl".to_string(),
            "alt" => "Alt".to_string(),
            "shift" => "Shift".to_string(),
            _ => t.trim().to_string(),
        })
        .collect();
    converted
        .join("+")
        .parse::<Shortcut>()
        .map_err(|e| format!("{e:?}"))
}

#[derive(Default)]
struct AppState {
    /// When pinned the popover ignores blur and stays open.
    pinned: AtomicBool,
    last_auto_hide: Mutex<Option<Instant>>,
    /// Currently registered system-wide toggle hotkey.
    toggle_shortcut: Mutex<Option<Shortcut>>,
    /// Feature flag read by the double-shift thread.
    double_shift: Arc<AtomicBool>,
}

// ───────────────────────── commands (called from the UI) ─────────────────────────

#[tauri::command]
fn hide_window(app: AppHandle) {
    hide(&app);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_pinned(state: tauri::State<'_, AppState>, pinned: bool) {
    state.pinned.store(pinned, Ordering::Relaxed);
}

/// Re-register the system-wide toggle hotkey. Async so it never runs on the
/// main thread (the plugin round-trips through it and would deadlock).
#[tauri::command]
async fn set_toggle_shortcut(app: AppHandle, shortcut: String) -> bool {
    let parsed = match binding_to_shortcut(&shortcut) {
        Ok(s) => s,
        Err(e) => {
            eprintln!("[batch] bad shortcut {shortcut:?}: {e}");
            return false;
        }
    };
    let gs = app.global_shortcut();
    let previous = app
        .state::<AppState>()
        .toggle_shortcut
        .lock()
        .ok()
        .and_then(|g| *g);
    if let Some(prev) = previous {
        let _ = gs.unregister(prev);
    }
    match gs.register(parsed) {
        Ok(()) => {
            if let Ok(mut g) = app.state::<AppState>().toggle_shortcut.lock() {
                *g = Some(parsed);
            }
            dlog!("[batch] toggle hotkey → {shortcut}");
            true
        }
        Err(e) => {
            eprintln!("[batch] could not register {shortcut}: {e}");
            // Put the previous one back so the user isn't left without a hotkey.
            if let Some(prev) = previous {
                let _ = gs.register(prev);
            }
            false
        }
    }
}

#[tauri::command]
fn set_double_shift(state: tauri::State<'_, AppState>, enabled: bool) {
    state.double_shift.store(enabled, Ordering::Relaxed);
}

#[tauri::command]
fn accessibility_status() -> bool {
    #[cfg(target_os = "macos")]
    {
        ax::trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Shows the system prompt (first time) and opens the Accessibility pane.
#[tauri::command]
fn request_accessibility() -> bool {
    #[cfg(target_os = "macos")]
    {
        let ok = ax::request();
        if !ok {
            let _ = std::process::Command::new("open")
                .arg(
                    "x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility",
                )
                .spawn();
        }
        ok
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Open http(s)/mailto links in the default browser (validated; no shell).
#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    let lower = url.trim().to_ascii_lowercase();
    if !(lower.starts_with("http://")
        || lower.starts_with("https://")
        || lower.starts_with("mailto:"))
    {
        return Err("only http, https and mailto links can be opened".into());
    }
    if url.chars().any(|c| c.is_control() || c.is_whitespace()) {
        return Err("invalid url".into());
    }
    std::process::Command::new("open")
        .arg(url.trim())
        .spawn()
        .map(|_| ())
        .map_err(|e| e.to_string())
}

fn notes_path(app: &AppHandle) -> Option<std::path::PathBuf> {
    app.path().app_data_dir().ok().map(|d| d.join(NOTES_FILE))
}

#[tauri::command]
fn notes_file_path(app: AppHandle) -> String {
    notes_path(&app)
        .map(|p| p.display().to_string())
        .unwrap_or_default()
}

#[tauri::command]
fn reveal_notes_file(app: AppHandle) {
    let Some(path) = notes_path(&app) else { return };
    let target = if path.exists() {
        path
    } else {
        path.parent().map(|p| p.to_path_buf()).unwrap_or(path)
    };
    let _ = std::process::Command::new("open")
        .arg("-R")
        .arg(target)
        .spawn();
}

/// Dev builds only: lets the webview write to the terminal running `tauri dev`.
#[tauri::command]
fn dev_log(msg: String) {
    dlog!("[batch:ui] {msg}");
    #[cfg(not(debug_assertions))]
    let _ = msg;
}

// ───────────────────────── window helpers ─────────────────────────

fn main_window(app: &AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window(MAIN_WINDOW)
}

fn hide(app: &AppHandle) {
    if let Some(w) = main_window(app) {
        let _ = w.hide();
        dlog!("[batch] hidden: visible={:?}", w.is_visible());
    }
    // Hand activation back to whatever app was in front before us.
    #[cfg(target_os = "macos")]
    let _ = app.hide();
}

fn show(app: &AppHandle) {
    let Some(w) = main_window(app) else {
        dlog!("[batch] show: main window missing");
        return;
    };
    dlog!("[batch] show");
    #[cfg(target_os = "macos")]
    let _ = app.show();
    if let Err(e) = place_under_tray(app, &w) {
        eprintln!("[batch] could not position under tray: {e}");
    }
    let _ = w.show();
    let _ = w.set_focus();
    let _ = w.emit(SHOWN_EVENT, ());
    // macOS activation is asynchronous and occasionally ignores the first
    // request when another app is frontmost; ask once more a beat later.
    {
        let handle = app.clone();
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(120));
            let h = handle.clone();
            let _ = handle.run_on_main_thread(move || {
                if let Some(w) = main_window(&h) {
                    if !w.is_focused().unwrap_or(false) {
                        let _ = w.set_focus();
                    }
                    dlog!(
                        "[batch] shown: visible={:?} focused={:?}",
                        w.is_visible(),
                        w.is_focused()
                    );
                }
            });
        });
    }
}

/// Show if hidden; focus if visible-but-unfocused (pinned case); hide if focused.
fn toggle(app: &AppHandle) {
    let Some(w) = main_window(app) else { return };
    let visible = w.is_visible().unwrap_or(false);
    let focused = w.is_focused().unwrap_or(false);
    if visible && focused {
        hide(app);
    } else if visible {
        let _ = w.set_focus();
        let _ = w.emit(SHOWN_EVENT, ());
    } else {
        show(app);
    }
}

/// Centre the window horizontally under the tray icon, just below the menu bar,
/// clamped to the monitor the tray icon lives on.
fn place_under_tray(app: &AppHandle, w: &WebviewWindow) -> tauri::Result<()> {
    let Some(tray) = app.tray_by_id(TRAY_ID) else {
        dlog!("[batch] tray '{TRAY_ID}' not found");
        return Ok(());
    };
    let Some(rect) = tray.rect()? else {
        dlog!("[batch] tray rect unavailable; leaving window where it is");
        return Ok(());
    };

    // Work out which monitor the tray icon is on so we use the right scale factor.
    let monitors = w.available_monitors().unwrap_or_default();
    let probe = rect.position.to_physical::<i32>(1.0);
    let monitor = monitors
        .iter()
        .find(|m| {
            let p = m.position();
            let s = m.size();
            probe.x >= p.x
                && probe.x < p.x + s.width as i32
                && probe.y >= p.y
                && probe.y < p.y + s.height as i32
        })
        .cloned()
        // available_monitors() can come back empty when called from inside the
        // event loop; primary/current still answer, and the menu bar's status
        // items live on the primary display.
        .or_else(|| w.primary_monitor().ok().flatten())
        .or_else(|| w.current_monitor().ok().flatten());

    let scale = monitor
        .as_ref()
        .map(|m| m.scale_factor())
        .unwrap_or_else(|| w.scale_factor().unwrap_or(1.0));

    let tray_pos = rect.position.to_logical::<f64>(scale);
    let tray_size = rect.size.to_logical::<f64>(scale);
    let win = w.outer_size()?.to_logical::<f64>(scale);

    let mut x = tray_pos.x + tray_size.width / 2.0 - win.width / 2.0;
    let y = tray_pos.y + tray_size.height + TRAY_GAP;

    // Keep the popover on-screen horizontally.
    if let Some(m) = &monitor {
        let mon_pos = m.position().to_logical::<f64>(scale);
        let mon_size = m.size().to_logical::<f64>(scale);
        let margin = 8.0;
        let min_x = mon_pos.x + margin;
        let max_x = mon_pos.x + mon_size.width - win.width - margin;
        x = x.clamp(min_x.min(max_x), max_x.max(min_x));
    }

    dlog!(
        "[batch] tray ({:.0},{:.0}) {:.0}x{:.0} · scale {scale} · monitor {:?} → window ({x:.0},{y:.0}) {:.0}x{:.0}",
        tray_pos.x, tray_pos.y, tray_size.width, tray_size.height,
        monitor.as_ref().map(|m| m.size().to_logical::<f64>(scale)).map(|s| (s.width, s.height)),
        win.width, win.height
    );

    w.set_position(LogicalPosition::new(x, y))
}

/// Read `settings.json` written by the UI: (toggle binding, doubleShift flag).
fn read_settings(app: &AppHandle) -> (String, bool) {
    let mut binding = DEFAULT_TOGGLE_BINDING.to_string();
    let mut double_shift = true;
    if let Ok(store) = app.store(SETTINGS_FILE) {
        if let Some(v) = store.get("state") {
            if let Some(b) = v.get("toggleShortcut").and_then(|x| x.as_str()) {
                if !b.is_empty() {
                    binding = b.to_string();
                }
            }
            if let Some(d) = v.get("doubleShift").and_then(|x| x.as_bool()) {
                double_shift = d;
            }
        }
    }
    (binding, double_shift)
}

#[cfg(target_os = "macos")]
mod ax {
    use core_foundation::base::TCFType;
    use core_foundation::boolean::CFBoolean;
    use core_foundation::dictionary::{CFDictionary, CFDictionaryRef};
    use core_foundation::string::{CFString, CFStringRef};

    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXIsProcessTrusted() -> bool;
        fn AXIsProcessTrustedWithOptions(options: CFDictionaryRef) -> bool;
        static kAXTrustedCheckOptionPrompt: CFStringRef;
    }

    pub fn trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    /// Prompts the user (macOS shows the dialog once per app) and returns the current status.
    pub fn request() -> bool {
        unsafe {
            let key = CFString::wrap_under_get_rule(kAXTrustedCheckOptionPrompt);
            let dict = CFDictionary::from_CFType_pairs(&[(
                key.as_CFType(),
                CFBoolean::true_value().as_CFType(),
            )]);
            AXIsProcessTrustedWithOptions(dict.as_concrete_TypeRef())
        }
    }
}

// ───────────────────────── app ─────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    // Only one shortcut is ever registered: the toggle.
                    if event.state == ShortcutState::Pressed {
                        toggle(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            hide_window,
            quit_app,
            set_pinned,
            set_toggle_shortcut,
            set_double_shift,
            accessibility_status,
            request_accessibility,
            open_url,
            notes_file_path,
            reveal_notes_file,
            dev_log
        ])
        .setup(|app| {
            // Menu-bar-only app: no Dock icon, no app switcher entry.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            // ── tray ──
            let show_item = MenuItem::with_id(app, "show", "Show Batch", true, None::<&str>)?;
            let quit_item =
                MenuItem::with_id(app, "quit", "Quit Batch", true, Some("CmdOrCtrl+Q"))?;
            let menu = Menu::with_items(
                app,
                &[&show_item, &PredefinedMenuItem::separator(app)?, &quit_item],
            )?;

            TrayIconBuilder::with_id(TRAY_ID)
                .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .tooltip("Batch")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => show(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        let app = tray.app_handle();
                        let state = app.state::<AppState>();
                        let recently_hidden = state
                            .last_auto_hide
                            .lock()
                            .ok()
                            .and_then(|g| *g)
                            .map(|t| t.elapsed() < REOPEN_GUARD)
                            .unwrap_or(false);
                        if !recently_hidden {
                            toggle(app);
                        }
                    }
                })
                .build(app)?;

            // ── window ──
            let window = app
                .get_webview_window(MAIN_WINDOW)
                .expect("main window is declared in tauri.conf.json");

            #[cfg(target_os = "macos")]
            {
                use window_vibrancy::{
                    apply_vibrancy, NSVisualEffectMaterial, NSVisualEffectState,
                };
                if let Err(e) = apply_vibrancy(
                    &window,
                    NSVisualEffectMaterial::Popover,
                    Some(NSVisualEffectState::Active),
                    Some(12.0),
                ) {
                    eprintln!("[batch] vibrancy unavailable: {e}");
                }
            }

            {
                let app_handle = app.handle().clone();
                window.on_window_event(move |event| match event {
                    WindowEvent::Focused(true) => {
                        dlog!("[batch] focus");
                    }
                    WindowEvent::Focused(false) => {
                        let state = app_handle.state::<AppState>();
                        dlog!(
                            "[batch] blur (pinned={})",
                            state.pinned.load(Ordering::Relaxed)
                        );
                        if !state.pinned.load(Ordering::Relaxed) {
                            if let Ok(mut g) = state.last_auto_hide.lock() {
                                *g = Some(Instant::now());
                            }
                            hide(&app_handle);
                        }
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        // No close button, but ⌘W / scripts: hide instead of destroying.
                        api.prevent_close();
                        hide(&app_handle);
                    }
                    _ => {}
                });
            }

            // ── settings (hotkey + double-shift flag) ──
            let (binding, double_shift_on) = read_settings(app.handle());
            match binding_to_shortcut(&binding) {
                Ok(sc) => match app.global_shortcut().register(sc) {
                    Ok(()) => {
                        if let Ok(mut g) = app.state::<AppState>().toggle_shortcut.lock() {
                            *g = Some(sc);
                        }
                        dlog!("[batch] toggle hotkey registered: {binding}");
                    }
                    Err(e) => eprintln!(
                        "[batch] could not register {binding} (in use by another app?): {e}"
                    ),
                },
                Err(e) => eprintln!("[batch] invalid toggle hotkey in settings ({binding}): {e}"),
            }

            #[cfg(target_os = "macos")]
            {
                let flag = app.state::<AppState>().double_shift.clone();
                flag.store(double_shift_on, Ordering::Relaxed);
                let handle = app.handle().clone();
                double_shift::spawn(flag, move || {
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || {
                        dlog!("[batch] double-shift → toggle");
                        toggle(&h);
                    });
                });
            }

            // In dev builds pop the window straight away so `tauri dev` is useful.
            // Deferred a beat so the tray's status item exists and positioning is real.
            #[cfg(debug_assertions)]
            {
                let handle = app.handle().clone();
                std::thread::spawn(move || {
                    std::thread::sleep(Duration::from_millis(400));
                    let h = handle.clone();
                    let _ = handle.run_on_main_thread(move || show(&h));
                });
            }

            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Batch");
}
