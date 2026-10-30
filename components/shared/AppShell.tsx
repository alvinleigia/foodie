import { cn } from "@/lib/utils";

type AppShellProps = {
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  topSpacing?: "default" | "compact" | "none";
  variant?: "warm" | "neutral" | "dark";
};

const shellVariants = {
  warm:
    "min-h-screen bg-[radial-gradient(circle_at_top,_rgba(251,191,36,0.22),_transparent_38%),linear-gradient(180deg,_#fff8ef_0%,_#f8f2ea_55%,_#f4ede4_100%)] text-stone-900 dark:bg-[linear-gradient(180deg,_#1c1917_0%,_#292524_45%,_#44403c_100%)] dark:text-stone-50",
  neutral:
    "min-h-screen bg-[linear-gradient(180deg,_#f7f7f6_0%,_#eeeeec_52%,_#e7e5e4_100%)] text-stone-900 dark:bg-[linear-gradient(180deg,_#1c1917_0%,_#292524_45%,_#44403c_100%)] dark:text-stone-50",
  dark:
    "min-h-screen bg-[linear-gradient(180deg,_#f7f7f6_0%,_#eeeeec_52%,_#e7e5e4_100%)] text-stone-900 dark:bg-[linear-gradient(180deg,_#1c1917_0%,_#292524_45%,_#44403c_100%)] dark:text-stone-50",
} as const;

export function AppShell({
  children,
  className,
  contentClassName,
  topSpacing = "default",
  variant = "warm",
}: AppShellProps) {
  return (
    <main
      className={cn(
        shellVariants[variant],
        "px-4 pb-10",
        topSpacing === "default" && "pt-10",
        topSpacing === "compact" && "pt-4",
        topSpacing === "none" && "pt-0",
        className,
      )}
    >
      <div className={cn("theme-adaptive mx-auto max-w-6xl", contentClassName)}>
        {children}
      </div>
    </main>
  );
}
