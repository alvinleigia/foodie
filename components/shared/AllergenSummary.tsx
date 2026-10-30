import { ShieldAlertIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import type { MenuAllergenDeclarationRecord } from "@/types/menu";

type AllergenSummaryProps = {
  allergens?: MenuAllergenDeclarationRecord[];
  className?: string;
};

export function AllergenSummary({
  allergens = [],
  className,
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

  return (
    <div className={cn("flex items-start gap-2 text-xs", className)}>
      <ShieldAlertIcon className="mt-0.5 size-3.5 shrink-0 text-amber-600 dark:text-amber-400" />
      <div className="grid gap-0.5">
        {contains.length > 0 ? (
          <p className="text-rose-700 dark:text-rose-300">
            <span className="font-semibold">Contains:</span> {contains.join(", ")}
          </p>
        ) : null}
        {mayContain.length > 0 ? (
          <p className="text-amber-800 dark:text-amber-300">
            <span className="font-semibold">May contain:</span> {mayContain.join(", ")}
          </p>
        ) : null}
      </div>
    </div>
  );
}
