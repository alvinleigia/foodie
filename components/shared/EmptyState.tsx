import { cn } from "@/lib/utils";

type EmptyStateProps = {
  title: string;
  description?: string;
  className?: string;
};

export function EmptyState({ title, description, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "rounded-xl border border-dashed border-stone-200 bg-stone-50 px-5 py-6 text-center",
        className,
      )}
    >
      <p className="text-sm font-semibold text-stone-800">{title}</p>
      {description ? <p className="mt-2 text-sm text-stone-500">{description}</p> : null}
    </div>
  );
}
