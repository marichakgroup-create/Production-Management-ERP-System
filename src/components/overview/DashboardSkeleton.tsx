import { Bone } from "@/components/ui/Skeleton";

function SectionShell({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={`overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)] ${className ?? ""}`}
    >
      {children}
    </section>
  );
}

export function DashboardSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="flex min-h-14 flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <Bone className="h-9 w-[260px] rounded-[10px]" />
          <Bone className="h-5 w-[320px] max-w-full" />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Bone className="h-10 w-[200px] rounded-[9px]" />
          <Bone className="h-10 w-[160px]" />
          <Bone className="h-10 w-[160px]" />
        </div>
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div key={index} className="min-h-[96px] space-y-2 px-5 py-4">
            <Bone className="h-4 w-20" />
            <Bone className="h-8 w-24 rounded-[8px]" />
            <Bone className="h-3.5 w-28" />
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-4 border-b border-[var(--color-border)] pb-2">
        {Array.from({ length: 4 }).map((_, index) => (
          <Bone key={index} className="h-5 w-20" />
        ))}
      </div>

      <SectionShell>
        <div className="border-b border-[var(--color-divider)] px-4 py-3">
          <Bone className="h-5 w-40" />
          <Bone className="mt-1.5 h-3.5 w-56" />
        </div>
        {Array.from({ length: 5 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-2 border-b border-[var(--color-divider)] px-4 py-2.5 last:border-0"
          >
            <Bone className="size-4 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bone className="h-4 w-[70%]" />
              <Bone className="h-3 w-[45%]" />
            </div>
            <Bone className="h-7 w-20 rounded-[8px]" />
          </div>
        ))}
      </SectionShell>

      <SectionShell>
        <div className="border-b border-[var(--color-divider)] px-4 py-3">
          <Bone className="h-5 w-44" />
          <Bone className="mt-1.5 h-3.5 w-52" />
        </div>
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="flex items-center gap-3 border-b border-[var(--color-divider)] px-4 py-2.5 last:border-0"
          >
            <Bone className="size-4 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bone className="h-4 w-[65%]" />
              <Bone className="h-3 w-[40%]" />
            </div>
            <Bone className="h-4 w-10" />
            <Bone className="h-7 w-16 rounded-[8px]" />
          </div>
        ))}
      </SectionShell>
    </div>
  );
}
