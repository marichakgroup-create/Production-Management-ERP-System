"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Select";
import { IconPlus } from "@/components/ui/Icons";
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
    <div className="flex flex-wrap items-center justify-end gap-2">
      <div className="inline-flex h-10 items-center rounded-[9px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-1">
        {RANGES.map((item) => {
          const on = range === item.id;
          return (
            <Link
              key={item.id}
              href={dashboardQuery({ range: item.id, managerId, focus, view })}
              className={cn(
                "inline-flex h-8 items-center rounded-[8px] px-3 text-[14px] font-semibold transition-colors duration-150",
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

      <Select
        size="md"
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
        className="w-[168px]"
        options={[
          { value: "", label: "Усі менеджери" },
          ...managers.map((manager) => ({ value: manager.id, label: manager.name })),
        ]}
      />

      <Link href="/orders/new" className="btn-primary h-10 px-[18px]">
        <IconPlus size={18} />
        Нове замовлення
      </Link>
    </div>
  );
}
