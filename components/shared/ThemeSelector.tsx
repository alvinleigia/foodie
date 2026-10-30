"use client";

import { useSyncExternalStore } from "react";
import { LaptopIcon, MoonIcon, SunIcon, type LucideIcon } from "lucide-react";
import { useTheme } from "next-themes";

import { cn } from "@/lib/utils";

type ThemeOption = {
  icon: LucideIcon;
  label: string;
  value: "light" | "dark" | "system";
};

const themeOptions: ThemeOption[] = [
  { icon: SunIcon, label: "Light", value: "light" },
  { icon: MoonIcon, label: "Dark", value: "dark" },
  { icon: LaptopIcon, label: "System", value: "system" },
];

export function ThemeSelector({ compact = false }: { compact?: boolean }) {
  const { setTheme, theme } = useTheme();
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  return (
    <div
      aria-label="Theme preference"
      className={cn(
        "grid grid-cols-3 gap-1 rounded-lg border p-1",
        compact
          ? "border-white/10 bg-white/5"
          : "border-border bg-muted",
      )}
      role="group"
    >
      {themeOptions.map((option) => {
        const Icon = option.icon;
        const isSelected = mounted && theme === option.value;

        return (
          <button
            key={option.value}
            aria-pressed={isSelected}
            className={cn(
              "flex flex-col items-center justify-center rounded-md text-sm font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-amber-500 focus-visible:ring-offset-2",
              compact ? "min-h-12 gap-1 px-2 py-1.5 focus-visible:ring-offset-stone-950" : "min-h-16 gap-1.5 px-3 py-2 focus-visible:ring-offset-background",
              compact && isSelected && "bg-white text-stone-950 shadow-sm",
              compact && !isSelected && "text-stone-400 hover:bg-white/10 hover:text-white",
              !compact && isSelected && "bg-card text-card-foreground shadow-sm ring-1 ring-border",
              !compact && !isSelected && "text-muted-foreground hover:bg-card/70 hover:text-foreground",
            )}
            disabled={!mounted}
            onClick={() => setTheme(option.value)}
            type="button"
          >
            <Icon className="size-4" />
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
