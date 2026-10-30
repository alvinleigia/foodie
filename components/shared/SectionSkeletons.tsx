import { AppShell } from "@/components/shared/AppShell";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

type SkeletonTone = "light" | "themed";

function LoadingStatus({ label }: { label: string }) {
  return label ? <span className="sr-only">{label}</span> : null;
}

export function SummaryGridSkeleton({
  count = 6,
  tone = "themed",
}: {
  count?: number;
  tone?: SkeletonTone;
}) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {Array.from({ length: count }).map((_, index) => (
        <Card
          key={index}
          tone={tone}
          className={cn(
            "rounded-xl border-border",
            tone === "themed" ? "bg-card" : "bg-background",
          )}
        >
          <CardContent className="space-y-3 px-5 py-4">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-8 w-16" />
            <Skeleton className="h-4 w-4/5" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function ListSectionSkeleton({
  className,
  label = "Loading list",
  rows = 4,
}: {
  className?: string;
  label?: string;
  rows?: number;
}) {
  return (
    <div
      aria-busy="true"
      aria-live="polite"
      className={cn("grid gap-3", className)}
      role="status"
    >
      <LoadingStatus label={label} />
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="grid gap-4 rounded-lg border border-border bg-muted/40 p-4 sm:grid-cols-[1fr_auto] sm:items-center"
        >
          <div className="space-y-2">
            <Skeleton className="h-4 w-40 max-w-full" />
            <Skeleton className="h-3 w-64 max-w-[85%]" />
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="size-8" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSectionSkeleton({
  label = "Loading table",
  rows = 5,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-2" role="status">
      <LoadingStatus label={label} />
      <div className="grid grid-cols-4 gap-3 border-y border-border py-3">
        {Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-3 w-full max-w-28" />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className="grid grid-cols-[1.4fr_1fr_1fr_auto] items-center gap-3 border-b border-border py-3"
        >
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="size-8" />
        </div>
      ))}
    </div>
  );
}

export function OrderCardsSkeleton({
  count = 3,
  label = "Loading orders",
}: {
  count?: number;
  label?: string;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-4" role="status">
      <LoadingStatus label={label} />
      {Array.from({ length: count }).map((_, index) => (
        <Card tone="themed" key={index} className="rounded-xl border-border bg-card shadow-none">
          <CardContent className="space-y-4 px-5 py-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-3">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-7 w-36" />
                <Skeleton className="h-4 w-44 max-w-full" />
              </div>
              <Skeleton className="h-7 w-20" />
            </div>
            <Skeleton className="h-4 w-2/3" />
            <div className="flex gap-3">
              <Skeleton className="h-9 w-32" />
              <Skeleton className="h-9 w-24" />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export function MenuSectionSkeleton({
  label = "Loading menu",
  sections = 2,
}: {
  label?: string;
  sections?: number;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-4" role="status">
      <LoadingStatus label={label} />
      {Array.from({ length: sections }).map((_, sectionIndex) => (
        <div
          key={sectionIndex}
          className="rounded-xl border border-border bg-muted/40 p-4"
        >
          <Skeleton className="h-5 w-36" />
          <div className="mt-4 grid gap-4">
            {Array.from({ length: 3 }).map((__, itemIndex) => (
              <div
                key={itemIndex}
                className="grid grid-cols-[1fr_76px] gap-4 border-b border-border pb-4 last:border-b-0"
              >
                <div className="space-y-2">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-3 w-full" />
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-8 w-24" />
                </div>
                <Skeleton className="aspect-square w-full" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ReportsSectionSkeleton({
  label = "Loading reports",
  tone = "themed",
}: {
  label?: string;
  tone?: SkeletonTone;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-4" role="status">
      <LoadingStatus label={label} />
      <SummaryGridSkeleton count={3} tone={tone} />
      <div className="grid gap-4 xl:grid-cols-2">
        {Array.from({ length: 2 }).map((_, index) => (
          <Card
            key={index}
            tone={tone}
            className={cn(
              "rounded-xl border-border",
              tone === "themed" ? "bg-card" : "bg-background",
            )}
          >
            <CardContent className="space-y-4 px-5 py-5">
              <Skeleton className="h-6 w-48 max-w-full" />
              <Skeleton className="h-4 w-3/4" />
              <ListSectionSkeleton label="" rows={3} />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

export function DashboardSectionSkeleton({
  label = "Loading dashboard",
  showReports = true,
  summaryCards = 6,
  tone = "themed",
}: {
  label?: string;
  showReports?: boolean;
  summaryCards?: number;
  tone?: SkeletonTone;
}) {
  return (
    <div aria-busy="true" aria-live="polite" className="grid gap-6" role="status">
      <LoadingStatus label={label} />
      <SummaryGridSkeleton count={summaryCards} tone={tone} />
      {showReports ? <ReportsSectionSkeleton label="" tone={tone} /> : null}
    </div>
  );
}

export function AppRouteSkeleton() {
  return (
    <AppShell variant="neutral" contentClassName="max-w-7xl">
      <div aria-busy="true" aria-live="polite" className="grid gap-10" role="status">
        <LoadingStatus label="Loading page" />
        <Card tone="themed" className="rounded-xl border-border bg-card/95">
          <CardContent className="flex items-center justify-between gap-6 px-6 py-5">
            <div className="flex items-center gap-4">
              <Skeleton className="size-12" />
              <div className="space-y-2">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
            <Skeleton className="h-12 w-48 max-w-[45%]" />
          </CardContent>
        </Card>
        <Card tone="themed" className="rounded-xl border-border bg-card/95">
          <CardContent className="space-y-6 px-6 py-7">
            <div className="space-y-3">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-64 max-w-full" />
              <Skeleton className="h-4 w-full max-w-xl" />
            </div>
            <SummaryGridSkeleton count={6} tone="themed" />
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
