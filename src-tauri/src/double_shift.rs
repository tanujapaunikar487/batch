//! Double-tap-Shift detection via a listen-only CGEventTap.
//!
//! Runs on its own thread with its own CFRunLoop. Requires Accessibility (or
//! Input Monitoring) permission; without it `CGEventTap::new` fails and we
//! retry every few seconds until the user grants access or the feature is
//! turned off.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use core_foundation::runloop::{kCFRunLoopDefaultMode, CFRunLoop};
use core_graphics::event::{
    CGEventFlags, CGEventTap, CGEventTapLocation, CGEventTapOptions, CGEventTapPlacement,
    CGEventType, CallbackResult,
};

/// Two Shift presses within this window (with nothing else in between) = trigger.
const DOUBLE_TAP_WINDOW: Duration = Duration::from_millis(350);
const RETRY_WITHOUT_ACCESS: Duration = Duration::from_secs(3);

/// Modifier bits we care about (device-independent flags only).
const SHIFT: u64 = CGEventFlags::CGEventFlagShift.bits();
const OTHER_MODS: u64 = CGEventFlags::CGEventFlagControl.bits()
    | CGEventFlags::CGEventFlagAlternate.bits()
    | CGEventFlags::CGEventFlagCommand.bits()
    | CGEventFlags::CGEventFlagSecondaryFn.bits();

#[derive(Default)]
struct TapState {
    shift_down: bool,
    last_shift_press: Option<Instant>,
    /// A non-modifier key was pressed since the last Shift press → not a double tap.
    interrupted: bool,
}

/// Start the listener thread. `enabled` can be flipped at any time; when it goes
/// false the tap is torn down and the thread idles (cheaply) until re-enabled.
pub fn spawn(enabled: Arc<AtomicBool>, on_trigger: impl Fn() + Send + Sync + 'static) {
    let on_trigger = Arc::new(on_trigger);
    std::thread::Builder::new()
        .name("batch-double-shift".into())
        .spawn(move || {
            let mut warned = false;
            loop {
                if !enabled.load(Ordering::Relaxed) {
                    std::thread::sleep(Duration::from_millis(500));
                    continue;
                }
                match run_tap(&enabled, on_trigger.clone()) {
                    Ok(()) => warned = false, // disabled → loop back to idle
                    Err(()) => {
                        if !warned {
                            crate::dlog!("[batch] double-shift: event tap unavailable (no Accessibility?) — will keep retrying");
                            warned = true;
                        }
                        std::thread::sleep(RETRY_WITHOUT_ACCESS);
                    }
                }
            }
        })
        .expect("spawn double-shift thread");
}

/// Blocks while enabled. Err(()) if the tap couldn't be created.
fn run_tap(enabled: &AtomicBool, on_trigger: Arc<dyn Fn() + Send + Sync>) -> Result<(), ()> {
    let state = Arc::new(Mutex::new(TapState::default()));
    let disabled_by_system = Arc::new(AtomicBool::new(false));

    let tap = {
        let state = state.clone();
        let disabled_by_system = disabled_by_system.clone();
        CGEventTap::new(
            CGEventTapLocation::HID,
            CGEventTapPlacement::HeadInsertEventTap,
            CGEventTapOptions::ListenOnly,
            // Note: TapDisabledBy* are delivered regardless of the mask (and must
            // NOT be listed here — the crate builds the mask with `1 << type`).
            vec![CGEventType::FlagsChanged, CGEventType::KeyDown],
            move |_proxy, etype, event| {
                match etype {
                    CGEventType::TapDisabledByTimeout | CGEventType::TapDisabledByUserInput => {
                        disabled_by_system.store(true, Ordering::Relaxed);
                    }
                    CGEventType::KeyDown => {
                        if let Ok(mut s) = state.lock() {
                            s.interrupted = true;
                        }
                    }
                    CGEventType::FlagsChanged => {
                        let flags = event.get_flags().bits();
                        let shift_now = flags & SHIFT != 0;
                        let others = flags & OTHER_MODS != 0;
                        if let Ok(mut s) = state.lock() {
                            if shift_now && !s.shift_down {
                                // Shift just went down.
                                let now = Instant::now();
                                let is_double = !others
                                    && !s.interrupted
                                    && s.last_shift_press
                                        .map(|t| now.duration_since(t) < DOUBLE_TAP_WINDOW)
                                        .unwrap_or(false);
                                s.shift_down = true;
                                s.interrupted = others;
                                if is_double {
                                    s.last_shift_press = None;
                                    drop(s);
                                    on_trigger();
                                } else {
                                    s.last_shift_press = Some(now);
                                }
                            } else if !shift_now && s.shift_down {
                                s.shift_down = false;
                            } else if others {
                                // Another modifier changed while Shift is held/idle.
                                s.interrupted = true;
                            }
                        }
                    }
                    _ => {}
                }
                CallbackResult::Keep
            },
        )
        .map_err(|_| ())?
    };

    let source = tap.mach_port().create_runloop_source(0).map_err(|_| ())?;
    let run_loop = CFRunLoop::get_current();
    unsafe { run_loop.add_source(&source, kCFRunLoopDefaultMode) };
    tap.enable();
    crate::dlog!("[batch] double-shift: event tap active");

    while enabled.load(Ordering::Relaxed) {
        // Pump the run loop in short slices so we can react to enable/disable
        // and re-arm the tap if the system disabled it.
        CFRunLoop::run_in_mode(
            unsafe { kCFRunLoopDefaultMode },
            Duration::from_millis(500),
            false,
        );
        if disabled_by_system.swap(false, Ordering::Relaxed) {
            tap.enable();
        }
    }
    unsafe { run_loop.remove_source(&source, kCFRunLoopDefaultMode) };
    crate::dlog!("[batch] double-shift: event tap stopped");
    Ok(())
}
