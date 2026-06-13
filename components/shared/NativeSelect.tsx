import { cn } from "@/lib/utils";

export function NativeSelect({
  className,
  ...props
}: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-12 rounded-xl border border-stone-200 bg-white px-4 text-base text-stone-900 outline-none transition focus:border-amber-500 disabled:cursor-not-allowed disabled:bg-stone-100",
        className,
      )}
      {...props}
    />
  );
}
