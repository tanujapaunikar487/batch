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

mod attachments;
#[cfg(target_os = "macos")]
mod double_shift;
mod notes_file;

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
    /// True while the event tap is installed and listening.
    double_shift_active: Arc<AtomicBool>,
    /// Bumped on every focus change; a deferred blur-hide only fires if it still matches.
    blur_gen: std::sync::atomic::AtomicU64,
    /// Frame to restore when leaving "full screen" (expanded) mode.
    restore_frame: Mutex<Option<(tauri::PhysicalPosition<i32>, tauri::PhysicalSize<u32>)>>,
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

/// "Full screen": fill the current display's work area; call again to restore. Returns the new state.
#[tauri::command]
fn toggle_expand(app: AppHandle) -> bool {
    let Some(w) = main_window(&app) else {
        return false;
    };
    let state = app.state::<AppState>();
    let mut guard = match state.restore_frame.lock() {
        Ok(g) => g,
        Err(_) => return false,
    };
    if let Some((pos, size)) = guard.take() {
        let _ = w.set_size(size);
        let _ = w.set_position(pos);
        return false;
    }
    let (Ok(pos), Ok(size)) = (w.outer_position(), w.outer_size()) else {
        return false;
    };
    let monitor = w
        .current_monitor()
        .ok()
        .flatten()
        .or_else(|| w.primary_monitor().ok().flatten());
    let Some(m) = monitor else { return false };
    let area = m.work_area();
    *guard = Some((pos, size));
    let _ = w.set_position(area.position);
    let _ = w.set_size(area.size);
    true
}

#[tauri::command]
fn is_expanded(state: tauri::State<'_, AppState>) -> bool {
    state
        .restore_frame
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false)
}

/// Bring the (already visible) window to the front without repositioning — used after a drop.
#[tauri::command]
fn focus_window(app: AppHandle) {
    if let Some(w) = main_window(&app) {
        #[cfg(target_os = "macos")]
        let _ = app.show();
        let _ = w.show();
        let _ = w.set_focus();
        let _ = w.emit(SHOWN_EVENT, ());
    }
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

/// "system" | "light" | "dark" — sets NSAppearance on the window so the vibrancy
/// backdrop matches the UI theme.
#[tauri::command]
fn set_theme(app: AppHandle, theme: String) {
    let Some(w) = main_window(&app) else { return };
    let t = match theme.as_str() {
        "light" => Some(tauri::Theme::Light),
        "dark" => Some(tauri::Theme::Dark),
        _ => None,
    };
    if let Err(e) = w.set_theme(t) {
        eprintln!("[batch] set_theme({theme}) failed: {e}");
    }
}

#[tauri::command]
fn set_double_shift(state: tauri::State<'_, AppState>, enabled: bool) {
    state.double_shift.store(enabled, Ordering::Relaxed);
}

#[derive(serde::Serialize)]
struct DoubleShiftStatus {
    /// The feature switch.
    enabled: bool,
    /// The event tap is installed and listening.
    active: bool,
    /// Input Monitoring (or Accessibility) is granted for this app.
    granted: bool,
}

/// Ground truth for the UI banner / settings row.
#[tauri::command]
fn double_shift_status(state: tauri::State<'_, AppState>) -> DoubleShiftStatus {
    DoubleShiftStatus {
        enabled: state.double_shift.load(Ordering::Relaxed),
        active: state.double_shift_active.load(Ordering::Relaxed),
        granted: input_monitoring_granted(),
    }
}

fn input_monitoring_granted() -> bool {
    #[cfg(target_os = "macos")]
    {
        ax::listen_granted() || ax::trusted()
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Kept for compatibility with older UI builds.
#[tauri::command]
fn accessibility_status() -> bool {
    input_monitoring_granted()
}

/// Shows the system prompt (first time) and opens the Input Monitoring pane,
/// which is where macOS lists apps that install listen-only event taps.
#[tauri::command]
fn request_accessibility() -> bool {
    #[cfg(target_os = "macos")]
    {
        let ok = ax::request_listen();
        if !ok {
            let _ = std::process::Command::new("open")
                .arg("x-apple.systempreferences:com.apple.preference.security?Privacy_ListenEvent")
                .spawn();
        }
        ok
    }
    #[cfg(not(target_os = "macos"))]
    {
        true
    }
}

/// Input Monitoring grants only apply to a fresh process.
#[tauri::command]
fn relaunch(app: AppHandle) {
    app.restart();
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
    notes_file::notes_path(app).ok()
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
    let expanded = app
        .state::<AppState>()
        .restore_frame
        .lock()
        .map(|g| g.is_some())
        .unwrap_or(false);
    if !expanded {
        if let Err(e) = place_under_tray(app, &w) {
            eprintln!("[batch] could not position under tray: {e}");
        }
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

struct StartupSettings {
    binding: String,
    double_shift: bool,
    window: Option<(f64, f64)>,
}

/// Read `settings.json` written by the UI.
fn read_settings(app: &AppHandle) -> StartupSettings {
    let mut out = StartupSettings {
        binding: DEFAULT_TOGGLE_BINDING.to_string(),
        double_shift: true,
        window: None,
    };
    if let Ok(store) = app.store(SETTINGS_FILE) {
        if let Some(v) = store.get("state") {
            if let Some(b) = v.get("toggleShortcut").and_then(|x| x.as_str()) {
                if !b.is_empty() {
                    out.binding = b.to_string();
                }
            }
            if let Some(d) = v.get("doubleShift").and_then(|x| x.as_bool()) {
                out.double_shift = d;
            }
            if let (Some(w), Some(h)) = (
                v.pointer("/window/width").and_then(|x| x.as_f64()),
                v.pointer("/window/height").and_then(|x| x.as_f64()),
            ) {
                if w >= 320.0 && h >= 360.0 && w <= 4000.0 && h <= 4000.0 {
                    out.window = Some((w, h));
                }
            }
        }
    }
    out
}

#[cfg(target_os = "macos")]
mod mouse {
    use core_graphics::event::CGEvent;
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceButtonState(state_id: i32, button: u32) -> bool;
    }

    /// Is the left mouse button currently held anywhere on the system?
    pub fn left_down() -> bool {
        // 0 = kCGEventSourceStateCombinedSessionState, 0 = kCGMouseButtonLeft
        unsafe { CGEventSourceButtonState(0, 0) }
    }

    /// Current pointer position in global points (top-left origin of the primary display).
    pub fn location() -> Option<(f64, f64)> {
        let src = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
        let e = CGEvent::new(src).ok()?;
        let p = e.location();
        Some((p.x, p.y))
    }
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

    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        /// Input Monitoring: is this process allowed to install listen-only event taps?
        fn CGPreflightListenEventAccess() -> bool;
        /// Input Monitoring: prompt (once) and return the current status.
        fn CGRequestListenEventAccess() -> bool;
    }

    pub fn trusted() -> bool {
        unsafe { AXIsProcessTrusted() }
    }

    pub fn listen_granted() -> bool {
        unsafe { CGPreflightListenEventAccess() }
    }

    pub fn request_listen() -> bool {
        unsafe { CGRequestListenEventAccess() }
    }

    /// Accessibility prompt (kept for a future "capture selection" feature that must post events).
    #[allow(dead_code)]
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
        // Must be first: a second launch just brings the existing instance forward.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show(app);
        }))
        .manage(AppState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_drag::init())
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
            focus_window,
            toggle_expand,
            is_expanded,
            set_pinned,
            set_toggle_shortcut,
            set_double_shift,
            set_theme,
            accessibility_status,
            request_accessibility,
            double_shift_status,
            relaunch,
            open_url,
            notes_file_path,
            reveal_notes_file,
            attachments::attachments_dir,
            attachments::save_attachment,
            attachments::import_attachments,
            attachments::gc_attachments,
            attachments::open_attachment,
            attachments::attachment_paths,
            attachments::copy_rich,
            notes_file::read_notes,
            notes_file::write_notes,
            notes_file::quarantine_notes,
            notes_file::write_text_file,
            notes_file::read_text_file,
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
                        // Cancel any pending deferred hide.
                        app_handle
                            .state::<AppState>()
                            .blur_gen
                            .fetch_add(1, Ordering::Relaxed);
                    }
                    WindowEvent::Focused(false) => {
                        let state = app_handle.state::<AppState>();
                        let generation = state.blur_gen.fetch_add(1, Ordering::Relaxed) + 1;
                        let pinned = state.pinned.load(Ordering::Relaxed);
                        dlog!("[batch] blur (pinned={pinned})");
                        if pinned {
                            return;
                        }
                        #[cfg(target_os = "macos")]
                        let button_down = mouse::left_down();
                        #[cfg(not(target_os = "macos"))]
                        let button_down = false;
                        if !button_down {
                            // Plain click-away / ⌘Tab / hotkey → hide now.
                            if let Ok(mut g) = state.last_auto_hide.lock() {
                                *g = Some(Instant::now());
                            }
                            hide(&app_handle);
                            return;
                        }
                        // The mouse is held somewhere else: this may be the start of a
                        // drag into Batch. Keep the window until the button is released;
                        // hide only if it's released outside our window.
                        dlog!("[batch] blur while mouse down — deferring hide until mouse-up");
                        let h = app_handle.clone();
                        std::thread::spawn(move || {
                            #[cfg(target_os = "macos")]
                            {
                                let started = Instant::now();
                                while mouse::left_down()
                                    && started.elapsed() < Duration::from_secs(60)
                                {
                                    std::thread::sleep(Duration::from_millis(25));
                                }
                                let at = mouse::location();
                                let h2 = h.clone();
                                let _ = h.run_on_main_thread(move || {
                                    let st = h2.state::<AppState>();
                                    if st.blur_gen.load(Ordering::Relaxed) != generation {
                                        return; // refocused or superseded meanwhile
                                    }
                                    let Some(w) = main_window(&h2) else { return };
                                    if w.is_focused().unwrap_or(false)
                                        || st.pinned.load(Ordering::Relaxed)
                                    {
                                        return;
                                    }
                                    let inside = (|| {
                                        let (mx, my) = at?;
                                        let scale = w.scale_factor().ok()?;
                                        let pos = w.outer_position().ok()?.to_logical::<f64>(scale);
                                        let size = w.outer_size().ok()?.to_logical::<f64>(scale);
                                        Some(
                                            mx >= pos.x
                                                && mx <= pos.x + size.width
                                                && my >= pos.y
                                                && my <= pos.y + size.height,
                                        )
                                    })()
                                    .unwrap_or(false);
                                    dlog!(
                                        "[batch] mouse-up {} the window",
                                        if inside { "inside" } else { "outside" }
                                    );
                                    if !inside {
                                        if let Ok(mut g) = st.last_auto_hide.lock() {
                                            *g = Some(Instant::now());
                                        }
                                        hide(&h2);
                                    }
                                });
                            }
                            #[cfg(not(target_os = "macos"))]
                            {
                                let _ = (h, generation);
                            }
                        });
                    }
                    WindowEvent::CloseRequested { api, .. } => {
                        // No close button, but ⌘W / scripts: hide instead of destroying.
                        api.prevent_close();
                        hide(&app_handle);
                    }
                    _ => {}
                });
            }

            // ── settings (hotkey, double-shift flag, remembered window size) ──
            let StartupSettings {
                binding,
                double_shift: double_shift_on,
                window: saved_size,
            } = read_settings(app.handle());
            if let Some((w_pt, h_pt)) = saved_size {
                let _ = window.set_size(tauri::LogicalSize::new(w_pt, h_pt));
            }
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
                let active = app.state::<AppState>().double_shift_active.clone();
                flag.store(double_shift_on, Ordering::Relaxed);
                let handle = app.handle().clone();
                double_shift::spawn(flag, active, move || {
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
