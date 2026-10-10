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

      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <SectionShell>
          <div className="border-b border-[var(--color-divider)] px-4 py-3">
            <Bone className="h-5 w-40" />
            <Bone className="mt-1.5 h-3.5 w-56" />
          </div>
          {Array.from({ length: 4 }).map((_, index) => (
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

        <div className="space-y-5">
          <SectionShell>
            <div className="border-b border-[var(--color-divider)] px-4 py-3">
              <Bone className="h-5 w-36" />
            </div>
            {Array.from({ length: 5 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 border-b border-[var(--color-divider)] px-4 py-2.5 last:border-0"
              >
                <Bone className="h-4 flex-1" />
                <Bone className="h-5 w-8" />
                <Bone className="h-3.5 w-14" />
              </div>
            ))}
          </SectionShell>
          <SectionShell>
            <div className="border-b border-[var(--color-divider)] px-4 py-3">
              <Bone className="h-5 w-40" />
            </div>
            {Array.from({ length: 4 }).map((_, index) => (
              <div
                key={index}
                className="flex items-center gap-3 border-b border-[var(--color-divider)] px-4 py-2.5 last:border-0"
              >
                <Bone className="h-5 w-7" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Bone className="h-4 w-[60%]" />
                  <Bone className="h-3 w-[40%]" />
                </div>
              </div>
            ))}
          </SectionShell>
        </div>
      </div>

      <SectionShell>
        <div className="flex items-center justify-between border-b border-[var(--color-divider)] px-4 py-3">
          <Bone className="h-5 w-40" />
          <Bone className="h-4 w-28" />
        </div>
        {Array.from({ length: 6 }).map((_, index) => (
          <div
            key={index}
            className="grid grid-cols-[1.4fr_0.7fr_0.5fr_0.7fr_0.6fr_0.7fr] gap-3 border-b border-[var(--color-divider)] px-4 py-3 last:border-0"
          >
            <Bone className="h-4 w-[80%]" />
            <Bone className="ml-auto h-4 w-16" />
            <Bone className="ml-auto h-4 w-10" />
            <Bone className="h-4 w-20" />
            <Bone className="h-4 w-14" />
            <Bone className="h-5 w-20 rounded-full" />
          </div>
        ))}
      </SectionShell>
    </div>
  );
}
