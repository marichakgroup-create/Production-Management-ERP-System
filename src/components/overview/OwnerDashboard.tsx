import Link from "next/link";
import { IconAlert, IconCheck, IconInfo } from "@/components/ui/Icons";
import { cn, formatMoneyShort } from "@/lib/utils";
import { hintFor } from "@/lib/ui-hints";
import { formatCompactUah } from "@/app/(app)/overview/dashboard-model";
import { ordersWord, type OwnerDashboardData } from "@/server/domains/overview/dashboard";
import { dashboardQuery } from "@/app/(app)/overview/dashboard-model";
import { OwnerDecisions } from "@/components/overview/OwnerDecisions";

function moneyParts(value: number) {
  return new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value);
}

function withOrdersHash(href: string) {
  return `${href}#orders`;
}

function KpiValue({
  value,
  suffix,
  danger,
}: {
  value: string | null;
  suffix?: string;
  danger?: boolean;
}) {
  if (value == null) {
    return (
      <span className="text-[26px] font-[650] leading-8 tracking-[-0.02em] text-[var(--color-text-primary)]">
        —
      </span>
    );
  }
  return (
    <span
      className={cn(
        "tabular text-[26px] font-[650] leading-8 tracking-[-0.02em]",
        danger ? "text-[var(--color-danger-text)]" : "text-[var(--color-text-primary)]",
      )}
    >
      {value}
      {suffix ? (
        <span className="ml-1 text-[13px] font-medium text-[var(--color-text-tertiary)]">
          {suffix}
        </span>
      ) : null}
    </span>
  );
}

export function OwnerDashboard({
  data,
  focus,
}: {
  data: OwnerDashboardData;
  focus: string;
}) {
  const { range, managerId, kpis, pricing } = data;
  const q = (nextFocus: string) => dashboardQuery({ range, managerId, focus: nextFocus });

  const marginDanger =
    kpis.avgMargin != null && kpis.avgMargin < pricing.minimumMarginPercent;

  const kpisRow = [
    {
      key: "portfolio",
      label: "Портфель",
      hint: "dashPortfolio" as const,
      href: withOrdersHash(q("all")),
      value:
        kpis.orderCount === 0 && kpis.portfolio === 0 ? null : moneyParts(kpis.portfolio),
      suffix: "₴",
      secondary:
        kpis.orderCount === 0
          ? "Немає активних"
          : `${kpis.orderCount} ${ordersWord(kpis.orderCount)}`,
      danger: false,
      selected: focus === "all" || focus === "",
    },
    {
      key: "profit",
      label: "Очікуваний прибуток",
      hint: "dashProfit" as const,
      href: withOrdersHash(q("all")),
      value: kpis.profitShare == null ? null : moneyParts(kpis.profit),
      suffix: "₴",
      secondary:
        kpis.profitShare == null
          ? "Немає погодженої калькуляції"
          : `${(kpis.profitShare * 100).toFixed(1).replace(".", ",")} % від портфеля`,
      danger: false,
      selected: false,
    },
    {
      key: "margin",
      label: "Середня маржа",
      hint: "dashMargin" as const,
      href: withOrdersHash(q("all")),
      value: kpis.avgMargin == null ? null : kpis.avgMargin.toFixed(1).replace(".", ","),
      suffix: "%",
      secondary: `мінімум ${pricing.minimumMarginPercent}%`,
      danger: marginDanger,
      selected: false,
    },
    {
      key: "risk",
      label: "Потрібна дія",
      hint: "dashAtRisk" as const,
      href: withOrdersHash(q("risk")),
      value: String(kpis.atRiskCount),
      suffix: ordersWord(kpis.atRiskCount),
      secondary:
        kpis.atRiskCount === 0
          ? "Усе під контролем"
          : kpis.atRisk > 0
            ? `${formatCompactUah(kpis.atRisk)} під ризиком`
            : "Потребують уваги",
      danger: kpis.atRiskCount > 0,
      selected: focus === "risk",
    },
  ];

  const openActions = data.decisions.length + data.readiness.filter((r) => r.percent < 100).length;

  return (
    <div className="space-y-5">
      {/* KPI report strip — one row, no icon clutter */}
      <section
        aria-label="Ключові показники"
        className="overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]"
      >
        <div className="grid grid-cols-2 xl:grid-cols-4">
          {kpisRow.map((item, index) => (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                "relative min-h-[96px] px-5 py-4 transition-colors hover:bg-[var(--color-surface-subtle)] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-[var(--color-primary-500)]",
                item.selected && "bg-[var(--color-surface-subtle)]",
                index % 2 === 0 && "max-xl:border-r max-xl:border-[var(--color-divider)]",
                index < 2 && "max-xl:border-b max-xl:border-[var(--color-divider)]",
                index < 3 && "xl:border-r xl:border-[var(--color-divider)]",
              )}
            >
              <span className="flex items-center gap-1.5">
                <span className="type-caption font-medium text-[var(--color-text-secondary)]">
                  {item.label}
                </span>
                <span
                  className="text-[var(--color-text-quiet)]"
                  title={hintFor(item.hint).description}
                  aria-hidden
                >
                  <IconInfo size={13} />
                </span>
              </span>
              <span className="mt-1.5 block">
                <KpiValue value={item.value} suffix={item.suffix} danger={item.danger} />
              </span>
              <span
                className={cn(
                  "mt-1 block truncate text-[12.5px] leading-4",
                  item.danger
                    ? "text-[var(--color-danger-text)]"
                    : "text-[var(--color-text-tertiary)]",
                )}
              >
                {item.secondary}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* Primary work: actions + pipeline */}
      <div className="grid grid-cols-1 gap-5 min-[1100px]:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <div className="space-y-5">
          <OwnerDecisions decisions={data.decisions} openCount={openActions} />

          {data.readiness.length > 0 ? (
            <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
              <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
                <h2 className="type-subsection">Готовність до цеху</h2>
                <span className="type-caption tabular">{data.readiness.length}</span>
              </div>
              <ul>
                {data.readiness.slice(0, 5).map((row) => {
                  const tone =
                    row.percent >= 100 ? "success" : row.percent >= 60 ? "warning" : "danger";
                  return (
                    <li
                      key={row.orderId}
                      className="flex items-center gap-3 border-b border-[var(--color-divider)] px-4 py-2.5 last:border-0"
                    >
                      <span
                        className={cn(
                          "grid size-4 shrink-0 place-items-center",
                          tone === "success" && "text-[var(--color-success-text)]",
                          tone === "warning" && "text-[var(--color-warning-text)]",
                          tone === "danger" && "text-[var(--color-danger-text)]",
                        )}
                      >
                        {tone === "success" ? <IconCheck size={15} /> : <IconAlert size={15} />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13.5px] font-medium text-[var(--color-text-primary)]">
                          {row.number}
                          <span className="ml-1.5 font-normal text-[var(--color-text-tertiary)]">
                            {row.clientName}
                          </span>
                        </p>
                        <p className="type-caption truncate">{row.missing}</p>
                      </div>
                      <span className="type-caption tabular shrink-0">{row.percent}%</span>
                      <Link
                        href={row.href}
                        className="inline-flex h-7 shrink-0 items-center rounded-[var(--radius-control)] border border-[var(--color-border-strong)] px-2.5 text-[12.5px] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                      >
                        {row.actionLabel}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>

        <div className="space-y-5">
          <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
              <div>
                <h2 className="type-subsection">Воронка замовлень</h2>
                <p className="type-caption mt-0.5">Натисніть етап — відфільтрує таблицю</p>
              </div>
            </div>
            <ul>
              {data.stages.map((stage) => {
                const selected = focus === stage.key;
                return (
                  <li key={stage.key} className="border-b border-[var(--color-divider)] last:border-0">
                    <Link
                      href={withOrdersHash(q(selected ? "all" : stage.key))}
                      className={cn(
                        "flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-surface-subtle)]",
                        selected && "bg-[var(--color-surface-subtle)]",
                        stage.delayed && !selected && "bg-[var(--color-warning-bg)]/40",
                      )}
                    >
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-[13.5px] font-medium",
                          selected
                            ? "text-[var(--color-primary-700)]"
                            : "text-[var(--color-text-primary)]",
                        )}
                      >
                        {stage.label}
                      </span>
                      <span className="tabular text-[15px] font-semibold text-[var(--color-text-primary)]">
                        {stage.count}
                      </span>
                      <span className="w-[4.5rem] shrink-0 text-right type-caption tabular">
                        {stage.amount > 0 ? formatCompactUah(stage.amount) : "—"}
                      </span>
                      {stage.delayLabel ? (
                        <span className="hidden w-[5.5rem] shrink-0 text-right text-[11.5px] font-medium text-[var(--color-warning-text)] sm:block">
                          {stage.delayLabel}
                        </span>
                      ) : (
                        <span className="hidden w-[5.5rem] sm:block" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
            <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
              <h2 className="type-subsection">Ризики калькуляцій</h2>
              <Link
                href="/settings/resources"
                className="type-caption font-semibold text-[var(--color-primary-700)] hover:underline"
              >
                Довідники
              </Link>
            </div>
            <ul>
              {data.risks.map((row) => (
                <li key={row.key} className="border-b border-[var(--color-divider)] last:border-0">
                  <Link
                    href={row.href}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-[var(--color-surface-subtle)]"
                  >
                    <span
                      className={cn(
                        "w-7 shrink-0 text-right tabular text-[14px] font-semibold",
                        row.count > 0
                          ? "text-[var(--color-text-primary)]"
                          : "text-[var(--color-text-quiet)]",
                      )}
                    >
                      {row.count}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13.5px] text-[var(--color-text-primary)]">
                        {row.label}
                      </span>
                      <span className="type-caption block truncate">{row.hint}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>

          {data.changes.length > 0 ? (
            <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
              <div className="border-b border-[var(--color-divider)] px-4 py-3">
                <h2 className="type-subsection">Останні зміни</h2>
              </div>
              <ul>
                {data.changes.slice(0, 6).map((row) => {
                  const body = (
                    <>
                      <span className="w-[3.25rem] shrink-0 tabular type-caption">
                        {changeTime(row.at)}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--color-text-primary)]">
                        {row.text}
                      </span>
                    </>
                  );
                  return (
                    <li key={row.id} className="border-b border-[var(--color-divider)] last:border-0">
                      {row.href ? (
                        <Link
                          href={row.href}
                          className="flex items-center gap-2 px-4 py-2 transition-colors hover:bg-[var(--color-surface-subtle)]"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex items-center gap-2 px-4 py-2">{body}</div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function changeTime(iso: string) {
  const date = new Date(iso);
  const today = new Date();
  const sameDay =
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate();
  if (sameDay) {
    return new Intl.DateTimeFormat("uk-UA", { hour: "2-digit", minute: "2-digit" }).format(date);
  }
  return new Intl.DateTimeFormat("uk-UA", { day: "2-digit", month: "2-digit" }).format(date);
}

/** @deprecated Lower triple-card block removed — content folded into OwnerDashboard. */
export function DashboardLowerBlocks(_props: { data: OwnerDashboardData }) {
  return null;
}

export function DashboardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex min-h-14 flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="type-page-title">Центр управління</h1>
        <p className="type-body-secondary mt-1 max-w-xl">
          Цифри портфеля й список того, що вимагає рішення власника.
        </p>
      </div>
      {children}
    </div>
  );
}

/** Kept for possible print/export reuse. */
export function formatDashboardMoney(value: number) {
  return formatMoneyShort(value);
}
