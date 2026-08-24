//! ⇧⇧ capture: ask the frontmost app to copy (synthetic ⌘C), read the
//! pasteboard, and record where it came from (app + window title). Needs the
//! Accessibility permission (event posting + AX title read).

use std::time::{Duration, Instant};

/// Where a captured selection came from.
#[derive(Clone, Default, serde::Serialize)]
pub struct Source {
    pub app: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bundle_id: Option<String>,
    pub at: u64,
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

#[cfg(target_os = "macos")]
pub fn frontmost_source() -> Option<Source> {
    use objc2_app_kit::NSWorkspace;
    let ws = NSWorkspace::sharedWorkspace();
    let app = ws.frontmostApplication()?;
    let name = app
        .localizedName()
        .map(|s| s.to_string())
        .unwrap_or_default();
    if name.is_empty() {
        return None;
    }
    let bundle_id = app.bundleIdentifier().map(|s| s.to_string());
    let pid = app.processIdentifier();
    Some(Source {
        app: name,
        title: window_title(pid),
        bundle_id,
        at: now_ms(),
    })
}

/// Title of the app's focused window, via the Accessibility API.
#[cfg(target_os = "macos")]
fn window_title(pid: i32) -> Option<String> {
    use core_foundation::base::{CFType, TCFType};
    use core_foundation::string::CFString;

    type AXUIElementRef = *const std::ffi::c_void;
    type AXError = i32;
    #[link(name = "ApplicationServices", kind = "framework")]
    extern "C" {
        fn AXUIElementCreateApplication(pid: i32) -> AXUIElementRef;
        fn AXUIElementCopyAttributeValue(
            element: AXUIElementRef,
            attribute: core_foundation::string::CFStringRef,
            value: *mut core_foundation::base::CFTypeRef,
        ) -> AXError;
        fn CFRelease(cf: core_foundation::base::CFTypeRef);
    }

    if !crate::ax::trusted() {
        return None;
    }
    unsafe {
        let app = AXUIElementCreateApplication(pid);
        if app.is_null() {
            return None;
        }
        let mut out: core_foundation::base::CFTypeRef = std::ptr::null();
        let focused_attr = CFString::from_static_string("AXFocusedWindow");
        let err = AXUIElementCopyAttributeValue(app, focused_attr.as_concrete_TypeRef(), &mut out);
        if err != 0 || out.is_null() {
            CFRelease(app as core_foundation::base::CFTypeRef);
            return None;
        }
        let window = out as AXUIElementRef;
        let mut title_ref: core_foundation::base::CFTypeRef = std::ptr::null();
        let title_attr = CFString::from_static_string("AXTitle");
        let err2 =
            AXUIElementCopyAttributeValue(window, title_attr.as_concrete_TypeRef(), &mut title_ref);
        let title = if err2 == 0 && !title_ref.is_null() {
            let cf = CFType::wrap_under_create_rule(title_ref);
            cf.downcast::<CFString>().map(|s| s.to_string())
        } else {
            None
        };
        CFRelease(window as core_foundation::base::CFTypeRef);
        CFRelease(app as core_foundation::base::CFTypeRef);
        title.filter(|t| !t.trim().is_empty())
    }
}

/// The captured text plus its source. `text` is empty when nothing was selected.
#[derive(Default)]
pub struct Capture {
    pub text: Option<String>,
    pub source: Option<Source>,
}

#[cfg(target_os = "macos")]
pub fn capture_selection(want_source: bool) -> Capture {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};

    // Read the source before we steal focus / post events.
    let source = if want_source {
        frontmost_source()
    } else {
        None
    };

    if !crate::ax::trusted() {
        crate::dlog!("[batch] capture: skipped — Accessibility not granted");
        return Capture { text: None, source };
    }
    // The trigger fires on the second Shift key-DOWN; wait until Shift is up so
    // the app receives ⌘C, not ⌘⇧C.
    let t0 = Instant::now();
    while shift_held() && t0.elapsed() < Duration::from_millis(800) {
        std::thread::sleep(Duration::from_millis(10));
    }
    let pb = NSPasteboard::generalPasteboard();
    let before = pb.changeCount();

    let Some(src) = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok() else {
        return Capture { text: None, source };
    };
    const KEY_C: u16 = 8; // kVK_ANSI_C
    let (Ok(down), Ok(up)) = (
        CGEvent::new_keyboard_event(src.clone(), KEY_C, true),
        CGEvent::new_keyboard_event(src, KEY_C, false),
    ) else {
        return Capture { text: None, source };
    };
    down.set_flags(CGEventFlags::CGEventFlagCommand);
    up.set_flags(CGEventFlags::CGEventFlagCommand);
    down.post(CGEventTapLocation::HID);
    std::thread::sleep(Duration::from_millis(20));
    up.post(CGEventTapLocation::HID);

    let deadline = Instant::now() + Duration::from_millis(350);
    while pb.changeCount() == before {
        if Instant::now() > deadline {
            crate::dlog!("[batch] capture: nothing selected (pasteboard unchanged)");
            return Capture { text: None, source };
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    let text = pb
        .stringForType(unsafe { NSPasteboardTypeString })
        .map(|s| s.to_string())
        .filter(|t| !t.trim().is_empty());
    if let Some(ref t) = text {
        crate::dlog!("[batch] capture: got {} chars", t.len());
    }
    Capture { text, source }
}

#[cfg(target_os = "macos")]
fn shift_held() -> bool {
    #[link(name = "CoreGraphics", kind = "framework")]
    extern "C" {
        fn CGEventSourceFlagsState(state_id: i32) -> u64;
    }
    const SHIFT: u64 = 0x0002_0000; // kCGEventFlagMaskShift
    unsafe { CGEventSourceFlagsState(0) & SHIFT != 0 } // 0 = combined session state
}

#[cfg(not(target_os = "macos"))]
pub fn capture_selection(_want_source: bool) -> Capture {
    Capture::default()
}

#[cfg(not(target_os = "macos"))]
pub fn frontmost_source() -> Option<Source> {
    None
}
