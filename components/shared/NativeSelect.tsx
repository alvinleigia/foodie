import { cn } from "@/lib/utils";

export function NativeSelect({
  className,
  density = "default",
  ...props
}: React.ComponentProps<"select"> & {
  density?: "compact" | "default";
}) {
  return (
    <select
      className={cn(
        "border border-input bg-background text-foreground outline-none transition focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        density === "default" && "h-12 rounded-xl px-4 text-base",
        density === "compact" && "h-9 rounded-lg px-3 text-sm",
        className,
      )}
      {...props}
    />
  );
}
