import { AppShell } from "@/components/app-shell";

type PageSkeletonProps = {
  title: string;
  description: string;
  variant?: "dashboard" | "list" | "detail";
};

function SkeletonBlock({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-2xl bg-surface-strong ${className}`} />;
}

function MetricSkeleton() {
  return (
    <section className="rounded-[28px] border border-border/80 bg-white p-6 shadow-panel">
      <SkeletonBlock className="h-4 w-28" />
      <SkeletonBlock className="mt-4 h-8 w-16" />
    </section>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 5 }).map((_, index) => (
        <article key={index} className="rounded-3xl border border-border/80 bg-white p-5 shadow-panel">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex-1">
              <SkeletonBlock className="h-4 w-32" />
              <SkeletonBlock className="mt-4 h-5 w-3/4" />
              <SkeletonBlock className="mt-3 h-4 w-1/2" />
            </div>
            <SkeletonBlock className="h-14 w-56" />
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <SkeletonBlock className="h-16" />
            <SkeletonBlock className="h-16" />
          </div>
        </article>
      ))}
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <section className="rounded-3xl bg-white p-6 shadow-panel">
        <SkeletonBlock className="h-4 w-36" />
        <SkeletonBlock className="mt-4 h-8 w-3/4" />
        <SkeletonBlock className="mt-4 h-4 w-1/2" />
        <div className="mt-6 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="h-20" />
          ))}
        </div>
      </section>
      <div className="grid gap-6 xl:grid-cols-2">
        <SkeletonBlock className="h-80" />
        <SkeletonBlock className="h-80" />
      </div>
    </div>
  );
}

export function PageSkeleton({ title, description, variant = "dashboard" }: PageSkeletonProps) {
  return (
    <AppShell title={title} description={description}>
      <div className="space-y-6" aria-busy="true" aria-live="polite">
        <div className="grid gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, index) => (
            <MetricSkeleton key={index} />
          ))}
        </div>
        {variant === "detail" ? (
          <DetailSkeleton />
        ) : variant === "list" ? (
          <ListSkeleton />
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
            <SkeletonBlock className="h-80" />
            <SkeletonBlock className="h-80" />
          </div>
        )}
      </div>
    </AppShell>
  );
}
