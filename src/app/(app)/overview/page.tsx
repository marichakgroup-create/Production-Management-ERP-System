import Link from "next/link";
import { getOwnerDashboard, type DashboardRange } from "@/server/domains/overview/dashboard";
import {
  CellStack,
  Table,
  TableCard,
  TableEmpty,
  TableToolbar,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { Hint } from "@/components/ui/Hint";
import { IconClose, IconOrders, IconPlus } from "@/components/ui/Icons";
import { cn, formatDateUk, formatMoneyShort } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import {
  AttentionPanel,
  DashboardHeader,
  DashboardKpiStrip,
  MoneyPanel,
  PortfolioFunnel,
  QualityPanel,
} from "@/components/overview/OwnerDashboard";
import { DashboardToolbar } from "@/components/overview/DashboardToolbar";
import { ViewTabs } from "@/components/ui/Tabs";
import { canViewOrderCosts, getCurrentUserAccess } from "@/server/auth/access";
import {
  PORTFOLIO_STAGES,
  dashboardQuery,
  daysLeft,
  parseDashboardView,
  type DashboardView,
} from "./dashboard-model";

const PORTFOLIO_FOCUS_KEYS = PORTFOLIO_STAGES.map((stage) => stage.key);
type PortfolioFocusKey = (typeof PORTFOLIO_STAGES)[number]["key"];
type FocusView = "all" | "overdue" | "dueSoon" | "risk" | "stale" | PortfolioFocusKey;

function normalizeFocus(raw: string | undefined): string | undefined {
  if (raw === "calc") return "CALCULATION";
  if (raw === "handover") return "APPROVED";
  return raw;
}

function parseFocus(raw: string | undefined): FocusView {
  const value = normalizeFocus(raw);
  if (value === "overdue" || value === "dueSoon" || value === "risk" || value === "stale") {
    return value;
  }
  if (value && (PORTFOLIO_FOCUS_KEYS as readonly string[]).includes(value)) {
    return value as PortfolioFocusKey;
  }
  return "all";
}

function parseRange(raw: string | undefined): DashboardRange {
  if (raw === "week" || raw === "quarter" || raw === "month") return raw;
  return "month";
}

function focusLabel(view: FocusView) {
  if (view === "overdue") return "Прострочені";
  if (view === "dueSoon") return "Здати за 7 днів";
  if (view === "risk") return "Під ризиком";
  if (view === "stale") return "Застарілі калькуляції";
  if (view === "all") return "Активні замовлення";
  return PORTFOLIO_STAGES.find((stage) => stage.key === view)?.label ?? "Активні замовлення";
}

function emptyTitleFor(view: FocusView) {
  switch (view) {
    case "overdue":
      return "Прострочених немає";
    case "dueSoon":
      return "Немає здачі на найближчі 7 днів";
    case "risk":
      return "Замовлень під ризиком немає";
    case "stale":
      return "Немає застарілих калькуляцій";
    case "CALCULATION":
      return "Немає замовлень у розрахунку";
    case "PENDING_APPROVAL":
      return "Немає на погодженні";
    case "APPROVED":
      return "Немає готових до цеху";
    case "HANDED_TO_PRODUCTION":
      return "Немає у виробництві";
    case "CLOSED":
      return "Немає готових за період";
    default:
      return "Активних замовлень немає";
  }
}

function PortfolioOrdersTable({
  focus,
  range,
  managerId,
  view,
  orders,
  showAmounts,
}: {
  focus: FocusView;
  range: DashboardRange;
  managerId: string | null;
  view: DashboardView;
  orders: Awaited<ReturnType<typeof getOwnerDashboard>>["tableOrders"];
  showAmounts: boolean;
}) {
  const stageKeys = new Set(PORTFOLIO_FOCUS_KEYS as readonly string[]);
  const tableOrders = orders.filter((order) => {
    if (focus === "overdue") return order.overdue;
    if (focus === "dueSoon") return order.dueSoon;
    if (focus === "risk") return order.atRisk;
    if (focus === "stale") return order.stale;
    if (stageKeys.has(focus)) {
      const stage = PORTFOLIO_STAGES.find((row) => row.key === focus);
      return stage ? (stage.statuses as readonly string[]).includes(order.status) : true;
    }
    return order.status !== "CLOSED";
  });

  const sorted = [...tableOrders].sort((a, b) => {
    const aOver = a.overdue ? 0 : 1;
    const bOver = b.overdue ? 0 : 1;
    if (aOver !== bOver) return aOver - bOver;
    return (daysLeft(a.deadline) ?? 9999) - (daysLeft(b.deadline) ?? 9999);
  });

  const resetHref = dashboardQuery({ range, managerId, view, focus: "all" });

  return (
    <TableCard id="orders" className="min-w-0 scroll-mt-20">
      <TableToolbar
        left={
          <div className="min-w-0">
            <span className="type-subsection">{focusLabel(focus)}</span>
            <span className="type-caption ml-2 tabular">{sorted.length}</span>
          </div>
        }
        right={
          <div className="flex flex-wrap items-center gap-2.5">
            {focus !== "all" ? (
              <Hint hint="resetFilter">
                <Link
                  href={`${resetHref}#orders`}
                  className="inline-flex items-center gap-1 type-caption font-medium text-[var(--color-primary-700)] hover:underline"
                >
                  <IconClose size={14} />
                  Скинути фільтр
                </Link>
              </Hint>
            ) : null}
            <Hint hint="allOrders">
              <Link
                href="/orders"
                className="inline-flex items-center gap-1 type-caption text-[var(--color-text-quiet)] hover:text-[var(--color-primary-700)]"
              >
                <IconOrders size={14} />
                Усі замовлення
              </Link>
            </Hint>
          </div>
        }
      />
      <Table>
        <THead>
          <TH>Замовлення</TH>
          {showAmounts ? (
            <TH
              align="right"
              title="Ціна для клієнта вже з урахуванням маржі — це не собівартість"
            >
              Сума продажу
            </TH>
          ) : null}
          {showAmounts ? (
            <TH
              align="right"
              title="Частка прибутку в сумі продажу, % (не додається зверху до суми)"
            >
              Маржа %
            </TH>
          ) : null}
          <TH>Дедлайн</TH>
          <TH>Менеджер</TH>
          <TH>Статус</TH>
        </THead>
        <TBody>
          {sorted.length === 0 ? (
            <TableEmpty
              colSpan={showAmounts ? 6 : 4}
              title={emptyTitleFor(focus)}
              description={
                focus !== "all"
                  ? "Скиньте фільтр або оберіть інший етап воронки."
                  : "Створіть перше замовлення — воно зʼявиться тут із сумою та маржею."
              }
              action={
                focus !== "all" ? (
                  <Link href={`${resetHref}#orders`} className="btn-primary btn-primary-sm">
                    Показати всі активні
                  </Link>
                ) : (
                  <Link href="/orders/new" className="btn-primary btn-primary-sm">
                    <IconPlus size={15} />
                    Нове замовлення
                  </Link>
                )
              }
            />
          ) : (
            sorted.slice(0, 12).map((order) => {
              const href = `/orders/${order.id}`;
              const days = daysLeft(order.deadline);

              return (
                <TR
                  key={order.id}
                  className={cn(order.overdue && "bg-[var(--color-tint-rose)]/70")}
                >
                  <TD>
                    <CellStack
                      href={href}
                      title={order.number}
                      subtitle={`${order.clientName} · ${order.productName}${order.extraItems > 0 ? ` +${order.extraItems}` : ""}`}
                      maxWidth="220px"
                    />
                  </TD>
                  {showAmounts ? (
                    <TD align="right" nowrap>
                      <span className="tabular font-medium text-[var(--color-text-primary)]">
                        {order.amount > 0 ? formatMoneyShort(order.amount) : "—"}
                      </span>
                    </TD>
                  ) : null}
                  {showAmounts ? (
                    <TD align="right" nowrap>
                      <span className="tabular font-medium text-[var(--color-text-secondary)]">
                        {order.margin != null ? `${order.margin.toFixed(1)}%` : "—"}
                      </span>
                    </TD>
                  ) : null}
                  <TD nowrap>
                    {order.deadline ? (
                      <span
                        className={cn(
                          "tabular text-[13px] text-[var(--color-text-secondary)]",
                          order.overdue && "font-medium text-[var(--color-danger-text)]",
                        )}
                      >
                        {formatDateUk(order.deadline)}
                        {days != null && days < 0 ? (
                          <span className="type-caption block text-[var(--color-danger-text)]">
                            −{Math.abs(days)} дн.
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="type-caption">—</span>
                    )}
                  </TD>
                  <TD nowrap>
                    <span className="text-[13px] text-[var(--color-text-quiet)]">
                      {order.managerName?.split(" ")[0] ?? "—"}
                    </span>
                  </TD>
                  <TD nowrap>
                    <OrderStatusBadge status={order.status} dot />
                  </TD>
                </TR>
              );
            })
          )}
        </TBody>
      </Table>
    </TableCard>
  );
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; range?: string; manager?: string; view?: string }>;
}) {
  const params = await searchParams;
  const focus = parseFocus(params.focus);
  const range = parseRange(params.range);
  const managerId = params.manager || null;
  const view = parseDashboardView(params.view);
  const access = await getCurrentUserAccess();
  const showAmounts = canViewOrderCosts(access);

  let data: Awaited<ReturnType<typeof getOwnerDashboard>> | null = null;
  try {
    data = await getOwnerDashboard({ range, managerId });
  } catch {
    data = null;
  }

  if (!data) {
    return (
      <div className="rounded-[12px] border border-[#E1E6E3] bg-white p-8 text-[14px] text-[#66717D]">
        Не вдалося завантажити показники. Перевірте підключення до бази і спробуйте ще раз.
      </div>
    );
  }

  const attentionCount =
    data.decisions.length + data.readiness.filter((row) => row.percent < 100).length;
  const activeOrderCount = data.kpis.orderCount;
  const qualityRiskCount = data.risks.reduce((sum, row) => sum + row.count, 0);
  const moneyBadge = data.kpis.atRiskCount > 0 ? data.kpis.atRiskCount : undefined;

  const tabHref = (nextView: DashboardView) =>
    dashboardQuery({
      range,
      managerId,
      view: nextView,
      focus: nextView === "portfolio" ? focus : "all",
    });

  return (
    <div className="space-y-6">
      <DashboardHeader>
        <DashboardToolbar
          range={range}
          managerId={managerId}
          focus={focus}
          view={view}
          managers={data.managers}
        />
      </DashboardHeader>

      <DashboardKpiStrip data={data} focus={focus} view={view} />

      <ViewTabs
        active={view}
        items={[
          {
            key: "attention",
            label: "Увага",
            href: tabHref("attention"),
            count: attentionCount,
            attention: attentionCount > 0,
          },
          {
            key: "portfolio",
            label: "Портфель",
            href: tabHref("portfolio"),
            count: activeOrderCount,
          },
          {
            key: "money",
            label: "Фінанси",
            href: tabHref("money"),
            count: moneyBadge,
          },
          {
            key: "quality",
            label: "Якість",
            href: tabHref("quality"),
            count: qualityRiskCount > 0 ? qualityRiskCount : undefined,
          },
        ]}
      />

      {view === "attention" ? <AttentionPanel data={data} /> : null}
      {view === "money" ? <MoneyPanel data={data} /> : null}
      {view === "quality" ? <QualityPanel data={data} /> : null}
      {view === "portfolio" ? (
        <div className="space-y-5">
          <PortfolioFunnel data={data} focus={focus} />
          <PortfolioOrdersTable
            focus={focus}
            range={range}
            managerId={managerId}
            view={view}
            orders={data.tableOrders}
            showAmounts={showAmounts}
          />
        </div>
      ) : null}
    </div>
  );
}
