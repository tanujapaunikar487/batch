//! "Capture the selection": ask the frontmost app to copy (synthetic ⌘C), then
//! read the pasteboard. Needs the Accessibility permission (event posting).

use std::time::{Duration, Instant};

#[cfg(target_os = "macos")]
pub fn selected_text() -> Option<String> {
    use core_graphics::event::{CGEvent, CGEventFlags, CGEventTapLocation};
    use core_graphics::event_source::{CGEventSource, CGEventSourceStateID};
    use objc2_app_kit::{NSPasteboard, NSPasteboardTypeString};

    if !crate::ax::trusted() {
        crate::dlog!("[batch] capture: skipped — Accessibility not granted");
        return None;
    }
    // The trigger fires on the second Shift key-DOWN; wait until Shift is up so
    // the app receives ⌘C, not ⌘⇧C.
    let t0 = Instant::now();
    while shift_held() && t0.elapsed() < Duration::from_millis(800) {
        std::thread::sleep(Duration::from_millis(10));
    }
    let pb = NSPasteboard::generalPasteboard();
    let before = pb.changeCount();

    let src = CGEventSource::new(CGEventSourceStateID::CombinedSessionState).ok()?;
    const KEY_C: u16 = 8; // kVK_ANSI_C
    let down = CGEvent::new_keyboard_event(src.clone(), KEY_C, true).ok()?;
    down.set_flags(CGEventFlags::CGEventFlagCommand);
    let up = CGEvent::new_keyboard_event(src, KEY_C, false).ok()?;
    up.set_flags(CGEventFlags::CGEventFlagCommand);
    down.post(CGEventTapLocation::HID);
    std::thread::sleep(Duration::from_millis(20));
    up.post(CGEventTapLocation::HID);

    // Give the app a moment to service the copy.
    let deadline = Instant::now() + Duration::from_millis(350);
    while pb.changeCount() == before {
        if Instant::now() > deadline {
            crate::dlog!("[batch] capture: nothing selected (pasteboard unchanged)");
            return None; // nothing selected (or the app ignored ⌘C)
        }
        std::thread::sleep(Duration::from_millis(15));
    }
    let s = pb.stringForType(unsafe { NSPasteboardTypeString })?;
    let text = s.to_string();
    if text.trim().is_empty() {
        None
    } else {
        crate::dlog!("[batch] capture: got {} chars", text.len());
        Some(text)
    }
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
pub fn selected_text() -> Option<String> {
    None
}
