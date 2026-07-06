import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type StatusPillTone = "neutral" | "success" | "warning" | "danger";

const toneClasses: Record<StatusPillTone, string> = {
  danger: "border-rose-200 bg-rose-50 text-rose-700",
  neutral: "border-stone-200 bg-white text-stone-500",
  success: "border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border-amber-200 bg-amber-50 text-amber-700",
};

type StatusPillProps = {
  children: ReactNode;
  className?: string;
  tone?: StatusPillTone;
};

export function StatusPill({
  children,
  className,
  tone = "neutral",
}: StatusPillProps) {
  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-md border px-2 text-xs font-semibold uppercase leading-none tracking-[0.14em]",
        toneClasses[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
