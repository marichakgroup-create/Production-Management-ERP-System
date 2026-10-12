import type { listOrders } from "@/server/domains/orders/service";

export type OverviewOrder = Awaited<ReturnType<typeof listOrders>>[number];

export type DashboardRange = "week" | "month" | "quarter";

/** Owner dashboard lens — always-on KPI + one of these tabs. */
export type DashboardView = "attention" | "portfolio" | "money" | "quality";

export const DASHBOARD_VIEWS: DashboardView[] = [
  "attention",
  "portfolio",
  "money",
  "quality",
];

export function parseDashboardView(raw: string | undefined): DashboardView {
  if (raw === "portfolio" || raw === "money" || raw === "quality") return raw;
  return "attention";
}

export const ACTIVE_STATUSES = [
  "DRAFT",
  "CALCULATION",
  "PENDING_APPROVAL",
  "APPROVED",
  "HANDED_TO_PRODUCTION",
] as const;

export const PORTFOLIO_STAGES = [
  { key: "CALCULATION", label: "Розрахунок", statuses: ["DRAFT", "CALCULATION"] as const },
  { key: "PENDING_APPROVAL", label: "На погодженні", statuses: ["PENDING_APPROVAL"] as const },
  { key: "APPROVED", label: "Погоджено", statuses: ["APPROVED"] as const },
  { key: "HANDED_TO_PRODUCTION", label: "У виробництві", statuses: ["HANDED_TO_PRODUCTION"] as const },
  { key: "CLOSED", label: "Готові", statuses: ["CLOSED"] as const },
] as const;

export function dashboardQuery(input: {
  range: DashboardRange;
  managerId?: string | null;
  focus?: string;
  view?: DashboardView | null;
}) {
  const params = new URLSearchParams();
  if (input.range !== "month") params.set("range", input.range);
  if (input.managerId) params.set("manager", input.managerId);
  if (input.view && input.view !== "attention") params.set("view", input.view);
  if (input.focus && input.focus !== "all") params.set("focus", input.focus);
  const query = params.toString();
  return query ? `/overview?${query}` : "/overview";
}

export function daysLeft(deadline: Date | string | null | undefined) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

export function orderAmount(order: OverviewOrder) {
  return order.items.reduce((sum, item) => {
    const version = item.versions[0];
    return sum + (version ? Number(version.totalSellingValue) : 0);
  }, 0);
}

/** Value-weighted margin across item versions; null if no calculation yet. */
export function orderMarginPercent(order: OverviewOrder) {
  let valueSum = 0;
  let weighted = 0;
  for (const item of order.items) {
    const version = item.versions[0];
    if (!version) continue;
    const value = Number(version.totalSellingValue);
    const margin = Number(version.marginPercent);
    if (!Number.isFinite(value) || !Number.isFinite(margin)) continue;
    valueSum += value;
    weighted += margin * value;
  }
  if (valueSum <= 0) {
    const first = order.items.find((item) => item.versions[0])?.versions[0];
    return first ? Number(first.marginPercent) : null;
  }
  return weighted / valueSum;
}

export function isOverdue(order: { deadline: Date | string | null | undefined; status: string }) {
  const days = daysLeft(order.deadline);
  return days != null && days < 0 && order.status !== "CANCELLED" && order.status !== "CLOSED";
}

/** Deadline today through 7 days — still on time, but close. */
export function isDueSoon(order: { deadline: Date | string | null | undefined; status: string }) {
  if (isOverdue(order)) return false;
  const days = daysLeft(order.deadline);
  return days != null && days >= 0 && days <= 7 && order.status !== "CANCELLED" && order.status !== "CLOSED";
}

export function formatCompactUah(value: number) {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\.0$/, "")} млн ₴`;
  }
  if (value >= 10_000) {
    return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value)} ₴`;
  }
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(value)} ₴`;
}

export function formatShortMoney(value: number) {
  if (value >= 1000) {
    const k = value / 1000;
    return `${k.toFixed(k >= 100 ? 0 : 1).replace(/\.0$/, "")}k ₴`;
  }
  return `${Math.round(value)} ₴`;
}
