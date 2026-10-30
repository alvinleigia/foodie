import type { LucideIcon } from "lucide-react";
import { AlertTriangleIcon, BanIcon, CheckCircle2Icon } from "lucide-react";

import type { IntegrationMode } from "@/lib/organization-integration-types";
import { cn } from "@/lib/utils";

type IntegrationPanelProps = {
  children: React.ReactNode;
  description: string;
  icon: LucideIcon;
  status: React.ReactNode;
  title: string;
};

type IntegrationStatusProps = {
  detail?: React.ReactNode;
  title: string;
  tone: "success" | "warning" | "neutral";
};

type IntegrationModeOption = {
  description: string;
  icon: LucideIcon;
  label: string;
  value: IntegrationMode;
};

type IntegrationModeSelectorProps = {
  ariaLabel: string;
  isOptionDisabled?: (option: IntegrationModeOption) => boolean;
  label: string;
  onChange: (value: IntegrationMode) => void;
  options: IntegrationModeOption[];
  value: IntegrationMode;
};

export function IntegrationPanel({
  children,
  description,
  icon: Icon,
  status,
  title,
}: IntegrationPanelProps) {
  return (
    <section className="mb-5 overflow-hidden rounded-lg border border-border bg-card text-card-foreground shadow-sm last:mb-0">
      <div className="grid gap-5 border-b border-border p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(22rem,1.1fr)] lg:items-center lg:p-6">
        <div className="flex min-w-0 items-start gap-4">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-amber-500/12 text-amber-700 dark:text-amber-400">
            <Icon className="size-5" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p>
          </div>
        </div>
        {status}
      </div>
      <div className="p-5 lg:p-6">{children}</div>
    </section>
  );
}

export function IntegrationStatus({
  detail,
  title,
  tone,
}: IntegrationStatusProps) {
  const Icon =
    tone === "success"
      ? CheckCircle2Icon
      : tone === "warning"
        ? AlertTriangleIcon
        : BanIcon;

  return (
    <div
      className={cn(
        "flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3",
        tone === "success" &&
          "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300",
        tone === "warning" &&
          "border-amber-500/35 bg-amber-500/10 text-amber-900 dark:text-amber-300",
        tone === "neutral" && "border-border bg-muted/60 text-muted-foreground",
      )}
    >
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          tone === "success" && "bg-emerald-500/15",
          tone === "warning" && "bg-amber-500/15",
          tone === "neutral" && "bg-background",
        )}
      >
        <Icon className="size-5" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{title}</p>
        {detail ? <div className="mt-0.5 break-words text-sm opacity-85">{detail}</div> : null}
      </div>
    </div>
  );
}

export function IntegrationModeSelector({
  ariaLabel,
  isOptionDisabled,
  label,
  onChange,
  options,
  value,
}: IntegrationModeSelectorProps) {
  return (
    <fieldset className="grid gap-3">
      <legend className="text-sm font-semibold text-foreground">{label}</legend>
      <div className="grid gap-3 md:grid-cols-3" role="radiogroup" aria-label={ariaLabel}>
        {options.map((option) => {
          const Icon = option.icon;
          const isSelected = value === option.value;
          const isDisabled = isOptionDisabled?.(option) ?? false;

          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={isSelected}
              disabled={isDisabled}
              onClick={() => onChange(option.value)}
              className={cn(
                "relative flex min-h-20 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
                isSelected
                  ? "border-amber-500 bg-amber-500/10 ring-1 ring-amber-500/20"
                  : "border-border bg-background/40 hover:border-foreground/20 hover:bg-muted/60",
                isDisabled && "cursor-not-allowed opacity-50",
              )}
            >
              <Icon
                className={cn(
                  "size-5 shrink-0",
                  isSelected ? "text-amber-700 dark:text-amber-400" : "text-muted-foreground",
                )}
              />
              <span className="min-w-0 pr-5">
                <span className="block text-sm font-semibold text-foreground">{option.label}</span>
                <span
                  className={cn(
                    "mt-0.5 block text-xs leading-5",
                    isSelected ? "text-foreground/80" : "text-muted-foreground",
                  )}
                >
                  {option.description}
                </span>
              </span>
              <span
                aria-hidden="true"
                className={cn(
                  "absolute right-3 top-3 size-4 rounded-full border",
                  isSelected
                    ? "border-amber-500 bg-amber-500 shadow-[inset_0_0_0_3px_var(--card)]"
                    : "border-muted-foreground/60",
                )}
              />
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
