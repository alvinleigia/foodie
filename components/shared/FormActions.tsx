import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

type FormActionsProps = {
  children: ReactNode;
  className?: string;
};

export function FormActions({ children, className }: FormActionsProps) {
  return (
    <div className={cn("flex flex-wrap gap-3 border-t border-border pt-5", className)}>
      {children}
    </div>
  );
}
