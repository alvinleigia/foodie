import { CircleAlertIcon, ShieldAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MenuAllergenDeclarationRecord } from "@/types/menu";

type AllergenSummaryProps = {
  allergens?: MenuAllergenDeclarationRecord[];
  className?: string;
  tone?: "default" | "light";
  layout?: "stacked" | "inline";
};

export function AllergenSummary({
  allergens = [],
  className,
  tone = "default",
  layout = "stacked",
}: AllergenSummaryProps) {
  const contains = allergens
    .filter((allergen) => allergen.declaration === "CONTAINS")
    .map((allergen) => allergen.name);
  const mayContain = allergens
    .filter((allergen) => allergen.declaration === "MAY_CONTAIN")
    .map((allergen) => allergen.name);

  if (contains.length === 0 && mayContain.length === 0) {
    return null;
  }

  if (layout === "inline") {
    return (
      <div className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs sm:text-sm", className)}>
        {contains.length > 0 ? (
          <p className="flex items-start gap-1.5 text-rose-700">
            <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>Contains: {contains.join(", ")}</span>
          </p>
        ) : null}
        {mayContain.length > 0 ? (
          <p className="flex items-start gap-1.5 text-amber-800">
            <CircleAlertIcon className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            <span>May contain: {mayContain.join(", ")}</span>
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className={cn("flex items-start gap-2 text-xs", className)}>
      <ShieldAlertIcon className={cn(
        "mt-0.5 size-3.5 shrink-0 text-amber-600",
        tone === "default" && "dark:text-amber-400",
      )} />
      <div className="grid gap-0.5">
        {contains.length > 0 ? (
          <p className={cn("text-rose-700", tone === "default" && "dark:text-rose-300")}>
            <span className="font-semibold">Contains:</span> {contains.join(", ")}
          </p>
        ) : null}
        {mayContain.length > 0 ? (
          <p className={cn("text-amber-800", tone === "default" && "dark:text-amber-300")}>
            <span className="font-semibold">May contain:</span> {mayContain.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
