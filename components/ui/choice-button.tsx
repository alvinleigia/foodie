import type { ComponentProps } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ChoiceButton({
  className,
  selected,
  role,
  ...props
}: Omit<ComponentProps<typeof Button>, "variant" | "asChild"> & { selected: boolean }) {
  return (
    <Button
      type="button"
      variant="outline"
      role={role}
      aria-checked={role === "radio" ? selected : undefined}
      aria-pressed={role === "radio" ? undefined : selected}
      data-selected={selected}
      className={cn(
        "whitespace-normal",
        selected && "border-primary bg-accent text-accent-foreground ring-1 ring-primary/20 hover:bg-accent dark:bg-accent dark:hover:bg-accent",
        className,
      )}
      {...props}
    />
  );
}
