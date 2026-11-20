import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function Radio({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      {...props}
      type="radio"
      data-slot="radio"
      className={cn(
        "size-4 shrink-0 accent-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:ring-3 aria-invalid:ring-destructive/20",
        className,
      )}
    />
  );
}
