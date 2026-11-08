import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  className?: string;
  tone?: "light" | "themed" | "customer";
};

export function SectionHeader({
  eyebrow,
  title,
  description,
  meta,
  className,
  tone = "themed",
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-6", className)}>
      <p
        className={cn(
          "text-sm font-semibold uppercase tracking-[0.3em]",
          tone === "customer"
            ? "text-teal-700"
            : tone === "themed"
              ? "text-amber-700 dark:text-amber-400"
              : "text-amber-800",
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          "mt-2 text-3xl font-semibold",
          tone === "light" ? "text-stone-900" : "text-foreground",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-3 text-sm",
            tone === "light" ? "text-stone-600" : "text-muted-foreground",
          )}
        >
          {description}
        </p>
      ) : null}
      {meta ? <div className="mt-2">{meta}</div> : null}
    </div>
  );
}
