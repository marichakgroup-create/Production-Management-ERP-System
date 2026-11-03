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
import {
  IconAlert,
  IconCheckCircle,
  IconClose,
  IconGrid,
  IconOrders,
  IconPlus,
  IconPricing,
} from "@/components/ui/Icons";
import { cn, formatDateUk, formatMoneyShort } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import {
  AttentionPanel,
  DashboardHeader,
  MoneyPanel,
  PortfolioFunnel,
  QualityPanel,
} from "@/components/overview/OwnerDashboard";
import { DashboardToolbar } from "@/components/overview/DashboardToolbar";
import { SegmentedTabs } from "@/components/ui/Tabs";
import { OrderStageBoard } from "@/components/overview/OrderStageBoard";
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
  page,
}: {
  focus: FocusView;
  range: DashboardRange;
  managerId: string | null;
  view: DashboardView;
  orders: Awaited<ReturnType<typeof getOwnerDashboard>>["tableOrders"];
  showAmounts: boolean;
  page: number;
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

  const pageSize = 50;
  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(Math.max(page, 1), pageCount);
  const pageRows = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const pageHref = (next: number) => {
    const params = new URLSearchParams();
    if (range !== "month") params.set("range", range);
    if (managerId) params.set("manager", managerId);
    if (view !== "attention") params.set("view", view);
    if (focus !== "all") params.set("focus", focus);
    if (next > 1) params.set("page", String(next));
    const query = params.toString();
    return `${query ? `/overview?${query}` : "/overview"}#orders`;
  };
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
            pageRows.map((order) => {
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
                      title={order.title?.trim() || order.productName}
                      subtitle={`${order.number} · ${order.clientName}`}
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
      {pageCount > 1 ? (
        <div className="flex items-center justify-between gap-3 border-t border-[var(--color-divider)] px-4 py-3">
          <span className="type-caption tabular">
            {safePage} / {pageCount}
          </span>
          <div className="flex items-center gap-2">
            {safePage > 1 ? (
              <Link href={pageHref(safePage - 1)} className="btn-secondary !h-8">
                Назад
              </Link>
            ) : null}
            {safePage < pageCount ? (
              <Link href={pageHref(safePage + 1)} className="btn-secondary !h-8">
                Далі
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </TableCard>
  );
}

function parsePage(raw: string | undefined) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 1;
}

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: Promise<{ focus?: string; range?: string; manager?: string; view?: string; page?: string }>;
}) {
  const params = await searchParams;
  const focus = parseFocus(params.focus);
  const range = parseRange(params.range);
  const managerId = params.manager || null;
  const view = parseDashboardView(params.view);
  const page = parsePage(params.page);
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

  const visible = showAmounts
    ? data
    : {
        ...data,
        kpis: {
          ...data.kpis,
          portfolio: 0,
          cost: 0,
          profit: 0,
          profitShare: null,
          avgMargin: null,
          atRisk: 0,
        },
        pricing: { ...data.pricing, minimumMarginPercent: 0 },
        stages: data.stages.map((stage) => ({ ...stage, amount: 0, cost: 0, profit: 0, share: 0 })),
        decisions: data.decisions.map((row) => ({
          ...row,
          amount: 0,
          context: row.context.replace(/ · (?:[\d\s\u00a0]+ ₴|без суми)$/, ""),
        })),
        tableOrders: data.tableOrders.map((row) => ({
          ...row,
          amount: 0,
          cost: 0,
          profit: 0,
          margin: null,
        })),
      };
  const dashboardView = !showAmounts && view === "money" ? "attention" : view;

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

  const stageOrders = visible.tableOrders
    .filter((order) => order.status !== "CLOSED" && order.status !== "CANCELLED")
    .map((order) => ({
      id: order.id,
      number: order.number,
      status: order.status,
      deadline: order.deadline,
      clientName: order.clientName,
      managerName: order.managerName,
      title: order.title,
      productName: order.productName,
      products: order.products,
      amount: order.amount,
      overdue: order.overdue,
    }));

  return (
    <div
      className={
        dashboardView === "stages"
          ? "flex h-[calc(100dvh-6rem)] min-h-[24rem] flex-col gap-3"
          : "space-y-5"
      }
    >
      <DashboardHeader>
        <Link href="/orders/new" className="btn-primary h-8 shrink-0 px-3 text-[13px]">
          <IconPlus size={15} />
          Нове замовлення
        </Link>
      </DashboardHeader>

      <SegmentedTabs
        className="shrink-0"
        active={dashboardView}
        items={[
          {
            key: "stages",
            label: "Замовлення за етапами",
            href: tabHref("stages"),
            icon: <IconGrid size={15} />,
            count: activeOrderCount,
          },
          {
            key: "attention",
            label: "Увага",
            href: tabHref("attention"),
            icon: <IconAlert size={15} />,
            count: attentionCount,
            attention: attentionCount > 0,
          },
          {
            key: "portfolio",
            label: "Портфель",
            href: tabHref("portfolio"),
            icon: <IconOrders size={15} />,
            count: activeOrderCount,
          },
          ...(showAmounts
            ? [
                {
                  key: "money" as const,
                  label: "Фінанси",
                  href: tabHref("money"),
                  icon: <IconPricing size={15} />,
                  count: moneyBadge,
                },
              ]
            : []),
          {
            key: "quality",
            label: "Якість",
            href: tabHref("quality"),
            icon: <IconCheckCircle size={15} />,
            count: qualityRiskCount > 0 ? qualityRiskCount : undefined,
          },
        ]}
      />

      {dashboardView === "stages" ? (
        <OrderStageBoard showAmounts={showAmounts} orders={stageOrders} fill />
      ) : null}
      {dashboardView === "attention" ? (
        <AttentionPanel data={visible} showMoney={showAmounts} />
      ) : null}
      {dashboardView === "money" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <h2 className="type-subsection">Валовий результат</h2>
              <p className="type-caption mt-0.5">
                Виручка, собівартість і прибуток за калькуляцією поточного портфеля
              </p>
            </div>
            <DashboardToolbar
              range={range}
              managerId={managerId}
              focus={focus}
              view={dashboardView}
              managers={visible.managers}
            />
          </div>
          <MoneyPanel data={visible} />
        </div>
      ) : null}
      {dashboardView === "quality" ? <QualityPanel data={visible} /> : null}
      {dashboardView === "portfolio" ? (
        <div className="space-y-5">
          <PortfolioFunnel data={visible} focus={focus} showMoney={showAmounts} />
          <PortfolioOrdersTable
            focus={focus}
            range={range}
            managerId={managerId}
            view={dashboardView}
            orders={visible.tableOrders}
            showAmounts={showAmounts}
            page={page}
          />
        </div>
      ) : null}
    </div>
  );
}
