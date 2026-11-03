"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { cn } from "@/lib/utils";
import {
  dashboardQuery,
  type DashboardRange,
  type DashboardView,
} from "@/app/(app)/overview/dashboard-model";

const RANGES: Array<{ id: DashboardRange; label: string }> = [
  { id: "week", label: "Тиждень" },
  { id: "month", label: "Місяць" },
  { id: "quarter", label: "Квартал" },
];

export function DashboardToolbar({
  range,
  managerId,
  focus,
  view,
  managers,
}: {
  range: DashboardRange;
  managerId: string | null;
  focus: string;
  view: DashboardView;
  managers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();

  return (
    <div className="flex shrink-0 flex-nowrap items-center justify-end gap-2">
      <div className="inline-flex h-8 items-center rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-0.5">
        {RANGES.map((item) => {
          const on = range === item.id;
          return (
            <Link
              key={item.id}
              href={dashboardQuery({ range: item.id, managerId, focus, view })}
              className={cn(
                "inline-flex h-7 items-center rounded-[6px] px-2.5 text-[13px] font-semibold transition-colors duration-150",
                on
                  ? "bg-[var(--color-surface)] text-[var(--color-text-primary)] shadow-[var(--shadow-card)]"
                  : "text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]",
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>

      <div className="w-[9.5rem] shrink-0">
        <Select
          size="sm"
          value={managerId ?? ""}
          onChange={(event) =>
            router.push(
              dashboardQuery({
                range,
                managerId: event.target.value || null,
                focus,
                view,
              }),
            )
          }
          options={[
            { value: "", label: "Усі менеджери" },
            ...managers.map((manager) => ({ value: manager.id, label: manager.name })),
          ]}
        />
      </div>

    </div>
  );
}
