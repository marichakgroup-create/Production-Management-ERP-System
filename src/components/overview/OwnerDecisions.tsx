"use client";

import { useState } from "react";
import Link from "next/link";
import { SidePanel } from "@/components/ui/Overlay";
import { IconAlert, IconCheck, IconCheckCircle, IconChevronRight } from "@/components/ui/Icons";
import { cn, formatMoneyShort } from "@/lib/utils";
import type { OwnerDecision } from "@/server/domains/overview/dashboard";

export function OwnerDecisions({
  decisions,
  openCount,
}: {
  decisions: OwnerDecision[];
  openCount?: number;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const open = decisions.find((row) => row.id === openId) ?? null;
  const badge = openCount ?? decisions.length;

  return (
    <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
        <div>
          <h2 className="type-subsection">Що зробити зараз</h2>
          <p className="type-caption mt-0.5">Блокери й рішення по активних замовленнях</p>
        </div>
        <span
          className={cn(
            "tabular text-[12.5px] font-semibold",
            badge > 0
              ? "text-[var(--color-warning-text)]"
              : "text-[var(--color-text-tertiary)]",
          )}
        >
          {badge}
        </span>
      </div>

      {decisions.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 px-4 py-10">
          <IconCheckCircle size={20} className="text-[var(--color-success-text)]" />
          <p className="text-center text-[13.5px] text-[var(--color-text-secondary)]">
            Немає рішень, що блокують роботу
          </p>
        </div>
      ) : (
        <ul>
          {decisions.map((row) => (
            <li
              key={row.id}
              className="flex items-center gap-2 border-b border-[var(--color-divider)] px-4 py-2.5 last:border-0"
            >
              <span
                className={cn(
                  "grid w-6 shrink-0 place-items-center",
                  row.tone === "danger" && "text-[var(--color-danger-text)]",
                  row.tone === "warning" && "text-[var(--color-warning-text)]",
                  row.tone === "success" && "text-[var(--color-success-text)]",
                )}
              >
                {row.tone === "success" ? <IconCheck size={16} /> : <IconAlert size={16} />}
              </span>
              <button
                type="button"
                onClick={() => setOpenId(row.id)}
                className="min-w-0 flex-1 rounded-[var(--radius-control)] text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-500)]"
              >
                <span className="block truncate text-[13.5px] font-medium text-[var(--color-text-primary)]">
                  {row.title}
                </span>
                <span className="type-caption block truncate">{row.context}</span>
              </button>
              <button
                type="button"
                onClick={() => setOpenId(row.id)}
                className="inline-flex h-7 min-w-[4.75rem] shrink-0 items-center justify-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-2.5 text-[12.5px] font-semibold text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-hover)]"
              >
                {row.actionLabel}
              </button>
            </li>
          ))}
        </ul>
      )}

      <SidePanel
        open={Boolean(open)}
        onClose={() => setOpenId(null)}
        title={open?.title ?? "Рішення"}
        description={open ? `${open.number} · ${open.clientName}` : undefined}
        width="sm"
        footer={
          open ? (
            <Link href={open.href} className="btn-primary">
              {open.actionLabel}
              <IconChevronRight size={16} />
            </Link>
          ) : null
        }
      >
        {open ? (
          <div className="space-y-3">
            <p className="text-[14px] text-[var(--color-text-primary)]">
              Сума продажу:{" "}
              <span className="font-semibold tabular">
                {open.amount > 0 ? formatMoneyShort(open.amount) : "—"}
              </span>
            </p>
            <ul className="space-y-2">
              {open.issues.map((issue) => (
                <li
                  key={issue}
                  className="flex gap-2 text-[13px] leading-[18px] text-[var(--color-text-secondary)]"
                >
                  <IconAlert
                    size={16}
                    className="mt-0.5 shrink-0 text-[var(--color-warning-text)]"
                  />
                  {issue}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </SidePanel>
    </section>
  );
}
