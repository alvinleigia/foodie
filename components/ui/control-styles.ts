import { cva } from "class-variance-authority";

// Shared by editable controls and searchable/select triggers.
export const controlStyles = cva(
  "min-w-0 rounded-lg border border-input bg-background text-foreground outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
  {
    variants: {
      controlSize: {
        sm: "h-8 px-2.5 text-sm",
        compact: "h-9 px-3 text-sm",
        default: "h-10 px-3 text-sm",
        lg: "h-11 px-3.5 text-base",
        xl: "h-12 px-4 text-base",
      },
    },
  },
);

export type ControlSize = "compact" | "default" | "lg" | "xl";
