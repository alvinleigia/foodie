import { cn } from "@/lib/utils";

type SectionHeaderProps = {
  eyebrow: string;
  title: string;
  description?: string;
  meta?: React.ReactNode;
  className?: string;
  tone?: "light" | "themed";
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
          tone === "themed" ? "text-amber-700 dark:text-amber-400" : "text-amber-800",
        )}
      >
        {eyebrow}
      </p>
      <h2
        className={cn(
          "mt-2 text-3xl font-semibold",
          tone === "themed" ? "text-foreground" : "text-stone-900",
        )}
      >
        {title}
      </h2>
      {description ? (
        <p
          className={cn(
            "mt-3 text-sm",
            tone === "themed" ? "text-muted-foreground" : "text-stone-600",
          )}
        >
          {description}
        </p>
      ) : null}
      {meta ? <div className="mt-2">{meta}</div> : null}
    </div>
  );
}
