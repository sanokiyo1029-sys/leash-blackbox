"use client";

import { useSyncExternalStore } from "react";
import { DARK_QUERY as DARK, THEME_KEY as KEY } from "@/lib/theme-script";

export type ThemeChoice = "system" | "light" | "dark";

function read(): ThemeChoice {
  try {
    const c = localStorage.getItem(KEY);
    return c === "light" || c === "dark" ? c : "system";
  } catch {
    return "system";
  }
}

function apply() {
  const c = read();
  document.documentElement.classList.toggle("dark", c === "dark" || (c === "system" && matchMedia(DARK).matches));
}

const listeners = new Set<() => void>();

/** System clears the stored choice, so the page follows the OS again. */
export function setTheme(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, choice);
  } catch {
    /* storage blocked: the choice still applies to this page */
  }
  document.documentElement.classList.toggle("dark", choice === "dark" || (choice === "system" && matchMedia(DARK).matches));
  listeners.forEach((f) => f());
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const mq = matchMedia(DARK);
  const onOs = () => read() === "system" && apply();
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    apply();
    onChange();
  };
  mq.addEventListener("change", onOs);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    mq.removeEventListener("change", onOs);
    window.removeEventListener("storage", onStorage);
  };
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "system");
}
