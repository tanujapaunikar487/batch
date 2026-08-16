import { useEffect } from "react";

/**
 * Mirror the macOS appearance onto <html class="dark"> so shadcn tokens follow it.
 * Dev override: append ?theme=dark or ?theme=light to the URL.
 */
export function useSystemTheme() {
  useEffect(() => {
    const forced = new URLSearchParams(location.search).get("theme");
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const dark = forced ? forced === "dark" : mq.matches;
      document.documentElement.classList.toggle("dark", dark);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
}
