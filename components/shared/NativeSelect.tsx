import { cn } from "@/lib/utils";

export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 rounded-xl border border-input bg-background px-4 text-base text-foreground outline-none transition focus:border-amber-500 focus:ring-3 focus:ring-amber-500/20 disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground",
        className,
      )}
      {...props}
    />
  );
}
