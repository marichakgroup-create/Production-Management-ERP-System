import Link from "next/link";
import { IconAlert, IconCheck, IconInfo } from "@/components/ui/Icons";
import { orderStatusLabel } from "@/lib/order-status";
import { cn, formatMoneyShort } from "@/lib/utils";
import { hintFor } from "@/lib/ui-hints";
import {
  dashboardQuery,
  formatCompactUah,
  type DashboardView,
} from "@/app/(app)/overview/dashboard-model";
import { ordersWord, type OwnerDashboardData } from "@/server/domains/overview/dashboard";
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

export function DashboardKpiStrip({
  data,
  focus,
  view,
  showMoney = true,
}: {
  data: OwnerDashboardData;
  focus: string;
  view: DashboardView;
  showMoney?: boolean;
}) {
  const { range, managerId, kpis, pricing } = data;
  const marginDanger =
    kpis.avgMargin != null && kpis.avgMargin < pricing.minimumMarginPercent;
  const actionCount = Math.max(kpis.atRiskCount, data.decisions.length);

  const kpisRow = [
    {
      key: "portfolio",
      label: "Портфель",
      hint: "dashPortfolio" as const,
      href: dashboardQuery({ range, managerId, view: "portfolio", focus: "all" }),
      value: showMoney
        ? kpis.orderCount === 0 && kpis.portfolio === 0
          ? null
          : moneyParts(kpis.portfolio)
        : kpis.orderCount === 0
          ? null
          : String(kpis.orderCount),
      suffix: showMoney ? "₴" : undefined,
      secondary:
        kpis.orderCount === 0
          ? "Немає активних"
          : showMoney
            ? `${kpis.orderCount} ${ordersWord(kpis.orderCount)}`
            : "Активні замовлення",
      danger: false,
      selected: view === "portfolio" && (focus === "all" || focus === ""),
    },
    {
      key: "profit",
      label: "Очікуваний прибуток",
      hint: "dashProfit" as const,
      href: dashboardQuery({ range, managerId, view: "money" }),
      value: kpis.profitShare == null ? null : moneyParts(kpis.profit),
      suffix: "₴",
      secondary:
        kpis.profitShare == null
          ? "Немає погодженої калькуляції"
          : `${(kpis.profitShare * 100).toFixed(1).replace(".", ",")} % від портфеля`,
      danger: false,
      selected: view === "money",
    },
    {
      key: "margin",
      label: "Середня маржа",
      hint: "dashMargin" as const,
      href: dashboardQuery({ range, managerId, view: "money" }),
      value: kpis.avgMargin == null ? null : kpis.avgMargin.toFixed(1).replace(".", ","),
      suffix: "%",
      secondary: `мінімум ${pricing.minimumMarginPercent}%`,
      danger: marginDanger,
      selected: view === "money",
    },
    {
      key: "risk",
      label: "Потрібна дія",
      hint: "dashAtRisk" as const,
      href: dashboardQuery({ range, managerId, view: "attention" }),
      value: String(actionCount),
      suffix: actionCount === 1 ? "пункт" : "пунктів",
      secondary:
        actionCount === 0
          ? "Усе під контролем"
          : showMoney && kpis.atRisk > 0
            ? `${formatCompactUah(kpis.atRisk)} під ризиком`
            : "Потребують уваги",
      danger: actionCount > 0,
      selected: view === "attention",
    },
  ].filter((item) => showMoney || item.key === "portfolio" || item.key === "risk");

  return (
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
  );
}

export function AttentionPanel({
  data,
  showMoney = true,
}: {
  data: OwnerDashboardData;
  showMoney?: boolean;
}) {
  const openActions =
    data.decisions.length + data.readiness.filter((r) => r.percent < 100).length;

  return (
    <div className="space-y-5">
      <OwnerDecisions
        decisions={data.decisions}
        openCount={openActions}
        showAmount={showMoney}
      />

      <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
          <div>
            <h2 className="type-subsection">Готовність до цеху</h2>
            <p className="type-caption mt-0.5">Погоджені замовлення перед передачею</p>
          </div>
          <span className="type-caption tabular">{data.readiness.length}</span>
        </div>
        {data.readiness.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-[var(--color-text-secondary)]">
            Немає погоджених замовлень, що чекають на цех.
          </p>
        ) : (
          <ul>
            {data.readiness.slice(0, 8).map((row) => {
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
        )}
      </section>
    </div>
  );
}

export function PortfolioFunnel({
  data,
  focus,
  showMoney = true,
}: {
  data: OwnerDashboardData;
  focus: string;
  showMoney?: boolean;
}) {
  const { range, managerId } = data;
  const q = (nextFocus: string) =>
    dashboardQuery({
      range,
      managerId,
      view: "portfolio",
      focus: nextFocus,
    });

  return (
    <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
      <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
        <div>
          <h2 className="type-subsection">Воронка замовлень</h2>
          <p className="type-caption mt-0.5">Натисніть етап — відфільтрує таблицю нижче</p>
        </div>
      </div>
      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5">
        {data.stages.map((stage, index) => {
          const selected = focus === stage.key;
          return (
            <li
              key={stage.key}
              className={cn(
                "border-b border-[var(--color-divider)] sm:border-b-0",
                index < data.stages.length - 1 &&
                  "xl:border-r xl:border-[var(--color-divider)]",
                index % 2 === 0 && "sm:max-xl:border-r sm:max-xl:border-[var(--color-divider)]",
                index < 2 && "sm:max-xl:border-b sm:max-xl:border-[var(--color-divider)]",
              )}
            >
              <Link
                href={withOrdersHash(q(selected ? "all" : stage.key))}
                className={cn(
                  "flex h-full flex-col gap-1 px-4 py-3 transition-colors hover:bg-[var(--color-surface-subtle)]",
                  selected && "bg-[var(--color-surface-subtle)]",
                  stage.delayed && !selected && "bg-[var(--color-warning-bg)]/40",
                )}
              >
                <span
                  className={cn(
                    "truncate text-[13px] font-medium",
                    selected
                      ? "text-[var(--color-primary-700)]"
                      : "text-[var(--color-text-primary)]",
                  )}
                >
                  {stage.label}
                </span>
                <span className="tabular text-[22px] font-[650] tracking-[-0.02em] text-[var(--color-text-primary)]">
                  {stage.count}
                </span>
                {showMoney ? (
                  <span className="type-caption tabular">
                    {stage.amount > 0 ? formatCompactUah(stage.amount) : "—"}
                  </span>
                ) : null}
                {stage.delayLabel ? (
                  <span className="text-[11.5px] font-medium text-[var(--color-warning-text)]">
                    {stage.delayLabel}
                  </span>
                ) : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function sumOf(
  rows: OwnerDashboardData["tableOrders"],
  key: "amount" | "cost" | "profit",
) {
  return rows.reduce((sum, row) => sum + row[key], 0);
}

function percentLabel(value: number) {
  return `${value.toFixed(1).replace(".", ",")} %`;
}

function moneyText(value: number) {
  return `${moneyParts(value)} ₴`;
}

function clientShares(orders: OwnerDashboardData["tableOrders"]) {
  const totals = new Map<string, number>();
  for (const order of orders) {
    totals.set(order.clientName, (totals.get(order.clientName) ?? 0) + order.amount);
  }
  const ranked = [...totals.entries()]
    .map(([name, amount]) => ({ name, amount }))
    .sort((a, b) => b.amount - a.amount || a.name.localeCompare(b.name, "uk"));
  const total = ranked.reduce((sum, row) => sum + row.amount, 0) || 1;
  const head = ranked.slice(0, 5);
  const rest = ranked.slice(5);
  if (rest.length > 0) {
    head.push({ name: "Інші клієнти", amount: rest.reduce((sum, row) => sum + row.amount, 0) });
  }
  return head.map((row) => ({ ...row, share: row.amount / total }));
}

function ResultMix({
  revenue,
  cost,
  profit,
}: {
  revenue: number;
  cost: number;
  profit: number;
}) {
  if (revenue <= 0) {
    return <p className="type-caption">Немає виручки в портфелі.</p>;
  }
  const costShare = Math.min(100, Math.max(0, (cost / revenue) * 100));
  const profitShare = profit > 0 ? Math.min(100 - costShare, (profit / revenue) * 100) : 0;
  return (
    <div>
      <div
        className="flex h-3 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]"
        role="img"
        aria-label={`Собівартість ${costShare.toFixed(0)}%, валовий прибуток ${profit > 0 ? profitShare.toFixed(0) : 0}%`}
      >
        <div className="h-full bg-[var(--color-primary-200)]" style={{ width: `${costShare}%` }} />
        <div className="h-full bg-[var(--color-primary-600)]" style={{ width: `${profitShare}%` }} />
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-text-secondary)]">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[var(--color-primary-200)]" />
          Собівартість
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-sm bg-[var(--color-primary-600)]" />
          Валовий прибуток
        </span>
      </div>
    </div>
  );
}

export function MoneyPanel({ data }: { data: OwnerDashboardData }) {
  const { kpis, pricing } = data;
  const active = data.tableOrders.filter(
    (order) => order.status !== "CLOSED" && order.status !== "CANCELLED",
  );
  const thinMargin = active.filter(
    (order) => order.margin != null && order.margin < pricing.minimumMarginPercent,
  );
  const unpriced = active.filter((order) => order.amount <= 0);
  const closed = data.stages.find((stage) => stage.key === "CLOSED");
  const rows = [...active].sort((a, b) => b.amount - a.amount || a.number.localeCompare(b.number));
  const clients = clientShares(active);
  const maxStage = Math.max(...data.stages.map((stage) => Math.max(stage.amount, stage.cost, stage.profit)), 1);
  const marginDanger = kpis.avgMargin != null && kpis.avgMargin < pricing.minimumMarginPercent;
  const statement = [
    {
      key: "revenue",
      sign: "",
      label: "Виручка",
      hint: "Сума продажу за останньою калькуляцією",
      value: kpis.portfolio,
    },
    {
      key: "cost",
      sign: "−",
      label: "Собівартість",
      hint: "Матеріали, операції та нанесення",
      value: kpis.cost,
    },
    {
      key: "profit",
      sign: "=",
      label: "Валовий прибуток",
      hint: "Виручка − собівартість",
      value: kpis.profit,
    },
  ];

  const notes = [
    unpriced.length > 0
      ? `${unpriced.length} ${ordersWord(unpriced.length)} без калькуляції не входять у виручку`
      : null,
    thinMargin.length > 0
      ? `${thinMargin.length} ${ordersWord(thinMargin.length)} з маржею нижче ${pricing.minimumMarginPercent}% · ${moneyText(sumOf(thinMargin, "amount"))}`
      : null,
    kpis.atRiskCount > 0
      ? `Під ризиком ${moneyText(kpis.atRisk)} · ${kpis.atRiskCount} ${ordersWord(kpis.atRiskCount)}`
      : null,
    closed && closed.count > 0
      ? `Закриті за період: виручка ${moneyText(closed.amount)}, прибуток ${moneyText(closed.profit)}`
      : null,
  ].filter((note): note is string => Boolean(note));

  return (
    <div className="space-y-4">
      <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="grid gap-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(16rem,0.9fr)]">
          <div className="border-b border-[var(--color-divider)] lg:border-r lg:border-b-0">
            <div className="border-b border-[var(--color-divider)] px-4 py-3">
              <h2 className="type-subsection">Звіт про валовий результат</h2>
              <p className="type-caption mt-0.5">Поточний портфель. Період змінює лише рядок закритих.</p>
            </div>
            <ul>
              {statement.map((line) => {
                const emphasis = line.key === "profit";
                const negative = line.key === "profit" && line.value < 0;
                return (
                  <li
                    key={line.key}
                    className={cn(
                      "flex items-baseline justify-between gap-4 border-b border-[var(--color-divider)] px-4 py-3 last:border-0",
                      emphasis && "bg-[var(--color-primary-50)]",
                    )}
                  >
                    <span className="min-w-0">
                      <span className="block text-[13.5px] font-medium text-[var(--color-text-primary)]">
                        {line.sign ? <span className="mr-2 tabular text-[var(--color-text-tertiary)]">{line.sign}</span> : null}
                        {line.label}
                      </span>
                      <span className="type-caption mt-0.5 block">{line.hint}</span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 tabular text-[18px] font-[650] tracking-[-0.02em]",
                        negative
                          ? "text-[var(--color-danger-text)]"
                          : emphasis
                            ? "text-[var(--color-primary-700)]"
                            : "text-[var(--color-text-primary)]",
                      )}
                    >
                      {moneyText(line.value)}
                    </span>
                  </li>
                );
              })}
              <li className="flex items-baseline justify-between gap-4 px-4 py-3">
                <span className="text-[13.5px] font-medium text-[var(--color-text-primary)]">Валова маржа</span>
                <span className="text-right">
                  <span
                    className={cn(
                      "block tabular text-[18px] font-[650]",
                      marginDanger ? "text-[var(--color-danger-text)]" : "text-[var(--color-text-primary)]",
                    )}
                  >
                    {kpis.avgMargin == null ? "—" : percentLabel(kpis.avgMargin)}
                  </span>
                  <span className="type-caption">мінімум {pricing.minimumMarginPercent}%</span>
                </span>
              </li>
            </ul>
          </div>
          <div className="px-4 py-4">
            <p className="type-caption">Структура виручки</p>
            <div className="mt-3">
              <ResultMix revenue={kpis.portfolio} cost={kpis.cost} profit={kpis.profit} />
            </div>
            {notes.length > 0 ? (
              <ul className="mt-4 space-y-1.5 border-t border-[var(--color-divider)] pt-3">
                {notes.map((note) => (
                  <li key={note} className="text-[12.5px] leading-4 text-[var(--color-text-secondary)]">
                    {note}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="type-caption mt-4 border-t border-[var(--color-divider)] pt-3">
                Усі активні замовлення пораховані, маржа не нижче мінімуму.
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          <div className="border-b border-[var(--color-divider)] px-4 py-3">
            <h2 className="type-subsection">Результат за етапами</h2>
            <p className="type-caption mt-0.5">Виручка, собівартість і валовий прибуток</p>
          </div>
          <div className="px-4 py-4">
            <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-[var(--color-text-secondary)]">
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-[var(--color-primary-300)]" />
                Виручка
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-[var(--color-primary-200)]" />
                Собівартість
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="size-2 rounded-sm bg-[var(--color-primary-600)]" />
                Прибуток
              </span>
            </div>
            <div className="grid grid-cols-5 gap-2">
              {data.stages.map((stage) => (
                <div key={stage.key} className="min-w-0">
                  <div className="flex h-28 items-end justify-center gap-1">
                    {[
                      { value: stage.amount, className: "bg-[var(--color-primary-300)]" },
                      { value: stage.cost, className: "bg-[var(--color-primary-200)]" },
                      { value: Math.max(stage.profit, 0), className: "bg-[var(--color-primary-600)]" },
                    ].map((bar) => (
                      <div key={bar.className} className="flex h-full items-end">
                        <div
                          className={cn("w-2 rounded-t-sm", bar.className)}
                          style={{ height: `${bar.value > 0 ? Math.max(6, (bar.value / maxStage) * 100) : 0}%` }}
                          title={moneyText(bar.value)}
                        />
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-center text-[11px] leading-3 text-[var(--color-text-secondary)]">
                    {stage.label}
                  </p>
                  <p className="mt-1 text-center tabular text-[11px] font-semibold text-[var(--color-text-primary)]">
                    {stage.amount > 0 ? moneyText(stage.amount) : "—"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
          <div className="border-b border-[var(--color-divider)] px-4 py-3">
            <h2 className="type-subsection">Виручка за клієнтами</h2>
            <p className="type-caption mt-0.5">Частка поточного портфеля</p>
          </div>
          {clients.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13.5px] text-[var(--color-text-secondary)]">
              Немає виручки для розподілу.
            </p>
          ) : (
            <ul className="px-4 py-3">
              {clients.map((client) => (
                <li key={client.name} className="py-2">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-[13px] font-medium text-[var(--color-text-primary)]">
                      {client.name}
                    </span>
                    <span className="shrink-0 tabular text-[13px] font-semibold text-[var(--color-text-primary)]">
                      {moneyText(client.amount)}
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-subtle)]">
                    <div
                      className="h-full rounded-full bg-[var(--color-primary-600)]"
                      style={{ width: `${Math.max(4, client.share * 100)}%` }}
                    />
                  </div>
                  <p className="type-caption mt-1">{Math.round(client.share * 100)}% виручки</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--color-divider)] px-4 py-3">
          <h2 className="type-subsection">Реєстр замовлень</h2>
          <p className="type-caption mt-0.5">Ті самі рядки, з яких зібрано валовий результат</p>
        </div>
        {rows.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-[var(--color-text-secondary)]">
            Активних замовлень немає.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] border-collapse text-left">
              <thead>
                <tr className="border-b border-[var(--color-divider)] text-[11.5px] font-semibold uppercase tracking-[0.04em] text-[var(--color-text-tertiary)]">
                  <th className="px-4 py-2 font-semibold">Замовлення</th>
                  <th className="px-3 py-2 font-semibold">Клієнт</th>
                  <th className="px-3 py-2 font-semibold">Етап</th>
                  <th className="px-3 py-2 text-right font-semibold">Виручка</th>
                  <th className="px-3 py-2 text-right font-semibold">Собівартість</th>
                  <th className="px-3 py-2 text-right font-semibold">Прибуток</th>
                  <th className="px-4 py-2 text-right font-semibold">Маржа</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((order) => {
                  const name = order.title?.trim() || order.productName;
                  const thin = order.margin != null && order.margin < pricing.minimumMarginPercent;
                  return (
                    <tr key={order.id} className="border-b border-[var(--color-divider)]">
                      <td className="max-w-[16rem] px-4 py-2.5">
                        <Link href={`/orders/${order.id}`} className="block min-w-0 hover:underline">
                          <span className="block truncate text-[13.5px] font-medium text-[var(--color-text-primary)]">
                            {name}
                          </span>
                          <span className="type-caption tabular block truncate">{order.number}</span>
                        </Link>
                      </td>
                      <td className="max-w-[10rem] px-3 py-2.5">
                        <span className="block truncate text-[13px] text-[var(--color-text-primary)]">
                          {order.clientName}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-[13px] text-[var(--color-text-secondary)]">
                        {orderStatusLabel[order.status] ?? order.status}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular text-[13.5px] font-semibold text-[var(--color-text-primary)]">
                        {order.amount > 0 ? moneyText(order.amount) : "—"}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular text-[13px] text-[var(--color-text-primary)]">
                        {order.amount > 0 ? moneyText(order.cost) : "—"}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5 text-right tabular text-[13px] font-semibold",
                          order.profit < 0 ? "text-[var(--color-danger-text)]" : "text-[var(--color-text-primary)]",
                        )}
                      >
                        {order.amount > 0 ? moneyText(order.profit) : "—"}
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-4 py-2.5 text-right tabular text-[13px] font-semibold",
                          thin ? "text-[var(--color-danger-text)]" : "text-[var(--color-text-primary)]",
                        )}
                      >
                        {order.margin == null ? "—" : percentLabel(order.margin)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--color-surface-subtle)]">
                  <td className="px-4 py-2.5 text-[13px] font-semibold text-[var(--color-text-primary)]" colSpan={3}>
                    Разом
                  </td>
                  <td className="px-3 py-2.5 text-right tabular text-[13px] font-semibold">{moneyText(sumOf(rows, "amount"))}</td>
                  <td className="px-3 py-2.5 text-right tabular text-[13px] font-semibold">{moneyText(sumOf(rows, "cost"))}</td>
                  <td className="px-3 py-2.5 text-right tabular text-[13px] font-semibold">{moneyText(sumOf(rows, "profit"))}</td>
                  <td className="px-4 py-2.5 text-right tabular text-[13px] font-semibold">
                    {kpis.avgMargin == null ? "—" : percentLabel(kpis.avgMargin)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export function QualityPanel({ data }: { data: OwnerDashboardData }) {
  return (
    <div className="space-y-5">
      <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="flex items-baseline justify-between gap-3 border-b border-[var(--color-divider)] px-4 py-3">
          <div>
            <h2 className="type-subsection">Ризики калькуляцій</h2>
            <p className="type-caption mt-0.5">Якість довідників і актуальних цін</p>
          </div>
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
                href={
                  row.key === "stale"
                    ? dashboardQuery({
                        range: data.range,
                        managerId: data.managerId,
                        view: "portfolio",
                        focus: "stale",
                      })
                    : row.href
                }
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-surface-subtle)]"
              >
                <span
                  className={cn(
                    "w-8 shrink-0 text-right tabular text-[15px] font-semibold",
                    row.count > 0
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-quiet)]",
                  )}
                >
                  {row.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium text-[var(--color-text-primary)]">
                    {row.label}
                  </span>
                  <span className="type-caption block truncate">{row.hint}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] shadow-[var(--shadow-card)]">
        <div className="border-b border-[var(--color-divider)] px-4 py-3">
          <h2 className="type-subsection">Останні зміни</h2>
        </div>
        {data.changes.length === 0 ? (
          <p className="px-4 py-8 text-center text-[13.5px] text-[var(--color-text-secondary)]">
            За обраний період критичних змін немає.
          </p>
        ) : (
          <ul>
            {data.changes.slice(0, 10).map((row) => {
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
                      className="flex items-center gap-2 px-4 py-2.5 transition-colors hover:bg-[var(--color-surface-subtle)]"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="flex items-center gap-2 px-4 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

export function DashboardHeader({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex min-h-14 flex-nowrap items-center justify-between gap-x-4">
      <div className="min-w-0">
        <h1 className="type-page-title">Центр управління</h1>
        <p className="type-body-secondary mt-1 max-w-xl">
          Пульс портфеля й те, що вимагає рішення власника.
        </p>
      </div>
      {children}
    </div>
  );
}

/** @deprecated Use tab panels instead. */
export function OwnerDashboard({
  data,
  focus,
  view = "attention",
}: {
  data: OwnerDashboardData;
  focus: string;
  view?: DashboardView;
}) {
  return (
    <div className="space-y-5">
      <DashboardKpiStrip data={data} focus={focus} view={view} />
      {view === "attention" ? <AttentionPanel data={data} /> : null}
      {view === "money" ? <MoneyPanel data={data} /> : null}
      {view === "quality" ? <QualityPanel data={data} /> : null}
      {view === "portfolio" ? <PortfolioFunnel data={data} focus={focus} /> : null}
    </div>
  );
}

export function formatDashboardMoney(value: number) {
  return formatMoneyShort(value);
}
