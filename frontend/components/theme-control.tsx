"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { setTheme, useThemeChoice, type ThemeChoice } from "@/lib/theme";
import { cn } from "@/lib/utils";

const OPTIONS: { value: ThemeChoice; label: string; Icon: typeof Sun }[] = [
  { value: "system", label: "System", Icon: Monitor },
  { value: "light", label: "Light", Icon: Sun },
  { value: "dark", label: "Dark", Icon: Moon },
];

/** System / Light / Dark as a native radio group: arrow keys, focus and announcements come from the browser. */
export function ThemeControl({ name, labels = false }: { name: string; labels?: boolean }) {
  const choice = useThemeChoice();
  return (
    <fieldset className="flex shrink-0 items-center gap-0.5 rounded-md border border-border bg-card p-0.5">
      <legend className="sr-only">Appearance</legend>
      {OPTIONS.map(({ value, label, Icon }) => (
        <label
          key={value}
          title={label}
          className={cn(
            "flex h-7 cursor-pointer items-center gap-1.5 rounded-[3px] px-1.5 text-muted-foreground transition-colors hover:text-foreground has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
            labels && "px-2.5 text-xs font-medium",
            choice === value && "bg-background text-foreground shadow-[inset_0_0_0_1px_var(--border)]",
          )}
        >
          <input type="radio" name={name} value={value} checked={choice === value} onChange={() => setTheme(value)} className="sr-only" />
          <Icon className="size-4" aria-hidden />
          <span className={labels ? undefined : "sr-only"}>{label}</span>
        </label>
      ))}
    </fieldset>
  );
}
