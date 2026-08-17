import { useEffect } from "react";
import { native } from "@/lib/native";
import { type ThemePref } from "@/store/useSettings";

/**
 * Apply the appearance preference: "system" mirrors macOS, "light"/"dark" force it.
 * Toggles <html class="dark"> for the theme tokens and tells the native window so the
 * vibrancy backdrop follows. Dev override: ?theme=dark|light in the URL.
 */
export function useTheme(pref: ThemePref) {
  useEffect(() => {
    const forced = new URLSearchParams(location.search).get("theme");
    const effective: ThemePref = forced === "dark" || forced === "light" ? forced : pref;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = effective === "system" ? mq.matches : effective === "dark";
      document.documentElement.classList.toggle("dark", dark);
      document.documentElement.style.colorScheme = dark ? "dark" : "light";
    };
    apply();
    void native.setTheme(effective);
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [pref]);
}
