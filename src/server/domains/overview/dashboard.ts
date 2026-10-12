import { prisma } from "@/server/db/client";
import { PORTFOLIO_STAGES, dashboardQuery, daysLeft, isDueSoon, isOverdue, type DashboardRange } from "@/app/(app)/overview/dashboard-model";

export type { DashboardRange };

const RANGE_DAYS: Record<DashboardRange, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

const DELAY_DAYS: Record<string, number> = {
  CALCULATION: 7,
  PENDING_APPROVAL: 3,
  APPROVED: 5,
  HANDED_TO_PRODUCTION: 14,
};

export type OwnerDecision = {
  id: string;
  orderId: string;
  number: string;
  clientName: string;
  amount: number;
  title: string;
  context: string;
  actionLabel: string;
  href: string;
  tone: "danger" | "warning" | "success";
  issues: string[];
};

export type OwnerStage = {
  key: string;
  label: string;
  count: number;
  amount: number;
  avgDays: number | null;
  delayed: boolean;
  delayLabel: string | null;
  share: number;
};

export type CalcRiskGroup = {
  key: "stale" | "discount" | "noNorm" | "incomplete";
  label: string;
  count: number;
  hint: string;
  href: string;
};

export type ReadinessRow = {
  orderId: string;
  number: string;
  clientName: string;
  percent: number;
  missing: string;
  actionLabel: string;
  href: string;
};

export type CriticalChange = {
  id: string;
  text: string;
  href: string | null;
  at: string;
};

export type OwnerDashboardData = {
  range: DashboardRange;
  managerId: string | null;
  managers: Array<{ id: string; name: string }>;
  pricing: { targetRatePercent: number; minimumMarginPercent: number };
  kpis: {
    portfolio: number;
    orderCount: number;
    profit: number;
    profitShare: number | null;
    avgMargin: number | null;
    atRisk: number;
    atRiskCount: number;
  };
  stages: OwnerStage[];
  decisions: OwnerDecision[];
  risks: CalcRiskGroup[];
  readiness: ReadinessRow[];
  changes: CriticalChange[];
  tableOrders: Array<{
    id: string;
    number: string;
    status: string;
    deadline: string | null;
    clientName: string;
    managerName: string;
    productName: string;
    extraItems: number;
    amount: number;
    margin: number | null;
    overdue: boolean;
    dueSoon: boolean;
    atRisk: boolean;
    stale: boolean;
  }>;
};

function rangeStart(range: DashboardRange) {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (RANGE_DAYS[range] - 1));
  return start;
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ordersWord(n: number) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return "замовлення";
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return "замовлення";
  return "замовлень";
}

export async function getOwnerDashboard(input: {
  range: DashboardRange;
  managerId?: string | null;
}): Promise<OwnerDashboardData> {
  const range = input.range;
  const managerId = input.managerId || null;
  const since = rangeStart(range);

  const [pricingRow, users, products, materials, operations, activity, orders] = await Promise.all([
    prisma.pricingSettings.findFirst(),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { status: "ACTIVE" },
      select: {
        id: true,
        nameUk: true,
        _count: { select: { materials: true, operations: true, decorations: true } },
      },
    }),
    prisma.material.findMany({
      where: { status: "ACTIVE" },
      select: { id: true, purchasePrice: true, updatedAt: true },
    }),
    prisma.operation.findMany({
      select: {
        id: true,
        calculationMethod: true,
        baseRate: true,
        shiftCost: true,
        standardOutputPerShift: true,
        updatedAt: true,
      },
    }),
    prisma.activityEvent.findMany({
      where: {
        action: {
          in: [
            "created",
            "status_changed",
            "version_saved",
            "version_approved",
            "proposal_saved",
            "proposal_approved",
            "handed_to_production",
            "updated",
          ],
        },
      },
      orderBy: { createdAt: "desc" },
      take: 80,
      include: { user: { select: { name: true } } },
    }),
    prisma.order.findMany({
      where: {
        status: { not: "CANCELLED" },
        ...(managerId ? { managerId } : {}),
      },
      include: {
        client: { select: { companyName: true } },
        manager: { select: { id: true, name: true } },
        files: { select: { id: true } },
        items: {
          include: {
            sizes: { select: { quantity: true } },
            materials: { select: { materialId: true, purchasePrice: true } },
            operations: {
              select: {
                operationId: true,
                calculationMethod: true,
                unitRate: true,
                shiftCost: true,
                standardOutput: true,
              },
            },
            decorations: { select: { id: true, nameSnapshot: true } },
            specification: { select: { id: true } },
            versions: {
              orderBy: [{ isApproved: "desc" }, { versionNumber: "desc" }],
              take: 1,
              select: {
                createdAt: true,
                isApproved: true,
                totalSellingValue: true,
                totalCost: true,
                profitAmount: true,
                marginPercent: true,
                sellingPricePerUnit: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const pricing = {
    targetRatePercent: 0,
    minimumMarginPercent: Number(pricingRow?.minimumMarginPercent ?? 15),
  };

  const materialById = new Map(materials.map((row) => [row.id, row]));
  const operationById = new Map(operations.map((row) => [row.id, row]));

  const lastStageAt = new Map<string, Date>();
  for (const event of activity) {
    if (event.entityType !== "order") continue;
    if (event.action !== "status_changed" && event.action !== "created" && event.action !== "handed_to_production") {
      continue;
    }
    if (!lastStageAt.has(event.entityId)) lastStageAt.set(event.entityId, event.createdAt);
  }

  type Row = (typeof orders)[number];
  const amountOf = (order: Row) =>
    order.items.reduce((sum, item) => sum + num(item.versions[0]?.totalSellingValue), 0);
  const costOf = (order: Row) =>
    order.items.reduce((sum, item) => sum + num(item.versions[0]?.totalCost), 0);
  const profitOf = (order: Row) =>
    order.items.reduce((sum, item) => {
      const version = item.versions[0];
      if (!version) return sum;
      if (version.profitAmount != null) return sum + num(version.profitAmount);
      return sum + (num(version.totalSellingValue) - num(version.totalCost));
    }, 0);
  const marginOf = (order: Row) => {
    const selling = amountOf(order);
    const profit = profitOf(order);
    if (selling <= 0) return null;
    return (profit / selling) * 100;
  };
  const composed = (order: Row) =>
    order.items.some((item) => item.materials.length > 0 && item.operations.length > 0);
  const hasQty = (order: Row) =>
    order.items.every((item) => item.sizes.reduce((sum, size) => sum + size.quantity, 0) > 0);
  const hasVersion = (order: Row) => order.items.some((item) => item.versions[0] != null);
  const hasApproved = (order: Row) =>
    order.items.length > 0 &&
    order.items.every((item) => item.versions[0]?.isApproved);
  const needsDecorationFile = (order: Row) =>
    order.items.some((item) =>
      item.decorations.some(
        (row) => String(row.nameSnapshot ?? "").trim() !== "Додаткові витрати",
      ),
    ) && order.files.length === 0;

  const staleOf = (order: Row) => {
    if (["HANDED_TO_PRODUCTION", "CLOSED"].includes(order.status)) return false;
    return order.items.some((item) => {
      const version = item.versions[0];
      if (!version) return false;
      const pricedAfter = item.materials.some((row) => {
        if (!row.materialId) return false;
        const catalog = materialById.get(row.materialId);
        if (!catalog) return false;
        if (catalog.updatedAt <= version.createdAt) return false;
        return Math.abs(num(catalog.purchasePrice) - num(row.purchasePrice)) > 0.0001;
      });
      const opsAfter = item.operations.some((row) => {
        if (!row.operationId) return false;
        const catalog = operationById.get(row.operationId);
        if (!catalog) return false;
        return catalog.updatedAt > version.createdAt;
      });
      return pricedAfter || opsAfter;
    });
  };

  const noNormOf = (order: Row) =>
    order.items.some((item) =>
      item.operations.some((row) => {
        if (row.calculationMethod === "SHIFT_OUTPUT") {
          return !(num(row.standardOutput) > 0 && num(row.shiftCost) >= 0);
        }
        if (row.calculationMethod === "UNIT_RATE") return !(num(row.unitRate) > 0);
        return false;
      }),
    );

  const readinessMissing = (order: Row) => {
    const missing: string[] = [];
    if (!hasApproved(order)) missing.push("погоджена пропозиція");
    if (!hasQty(order)) missing.push("розміри й кількість");
    if (!composed(order)) missing.push("норми й ціни складу");
    if (!order.deadline) missing.push("дедлайн");
    if (needsDecorationFile(order)) missing.push("файл нанесення");
    return missing;
  };

  const readinessPercent = (order: Row) => {
    const checks = 5;
    return Math.round(((checks - readinessMissing(order).length) / checks) * 100);
  };

  const active = orders.filter((order) =>
    ["DRAFT", "CALCULATION", "PENDING_APPROVAL", "APPROVED", "HANDED_TO_PRODUCTION"].includes(
      order.status,
    ),
  );

  const portfolio = active.reduce((sum, order) => sum + amountOf(order), 0);
  const profit = active.reduce((sum, order) => sum + profitOf(order), 0);
  const avgMargin = portfolio > 0 ? (profit / portfolio) * 100 : null;

  const riskIds = new Set<string>();
  const markRisk = (order: Row) => riskIds.add(order.id);

  for (const order of active) {
    if (isOverdue(order)) markRisk(order);
    if (staleOf(order)) markRisk(order);
    if (order.status === "APPROVED" && readinessMissing(order).length > 0) markRisk(order);
    if (order.status === "PENDING_APPROVAL") {
      const entered = lastStageAt.get(order.id) ?? order.updatedAt;
      const days = (Date.now() - entered.getTime()) / 86_400_000;
      if (days >= 5) markRisk(order);
    }
    if (noNormOf(order) && hasVersion(order)) markRisk(order);
  }

  const atRiskOrders = active.filter((order) => riskIds.has(order.id));
  const atRisk = atRiskOrders.reduce((sum, order) => sum + amountOf(order), 0);

  const stageNow = (key: string) => Date.now();
  const stages: OwnerStage[] = PORTFOLIO_STAGES.map((stage) => {
    const rows =
      stage.key === "CLOSED"
        ? orders.filter(
            (order) => order.status === "CLOSED" && order.updatedAt >= since,
          )
        : active.filter((order) => (stage.statuses as readonly string[]).includes(order.status));
    const amount = rows.reduce((sum, order) => sum + amountOf(order), 0);
    const durations = rows.map((order) => {
      const from = lastStageAt.get(order.id) ?? order.createdAt;
      return Math.max(0, (stageNow(stage.key) - from.getTime()) / 86_400_000);
    });
    const avgDays =
      durations.length > 0 ? durations.reduce((sum, d) => sum + d, 0) / durations.length : null;
    const threshold = DELAY_DAYS[stage.key];
    const delayed =
      stage.key !== "CLOSED" &&
      ((avgDays != null && threshold != null && avgDays >= threshold) ||
        rows.some(isOverdue));
    return {
      key: stage.key,
      label: stage.label,
      count: rows.length,
      amount,
      avgDays,
      delayed,
      delayLabel: delayed ? "затримка" : null,
      share: 0,
    };
  });
  const stageTotal = stages.reduce((sum, stage) => sum + stage.amount, 0) || 1;
  for (const stage of stages) stage.share = stage.amount / stageTotal;

  const decisions: OwnerDecision[] = [];
  for (const order of active) {
    const amount = amountOf(order);
    const margin = marginOf(order);
    const issues: string[] = [];
    let title: string | null = null;
    let actionLabel = "Відкрити";
    let href = `/orders/${order.id}`;
    let tone: OwnerDecision["tone"] = "warning";
    let priority = 50;

    if (isOverdue(order)) {
      const days = Math.abs(daysLeft(order.deadline) ?? 0);
      title = "Прострочений дедлайн";
      issues.push(`Зриває здачу на ${days} дн.`);
      actionLabel = "Відкрити";
      href = `/orders/${order.id}`;
      tone = "danger";
      priority = 1;
    }

    if (staleOf(order)) {
      issues.push("Ціни в довіднику змінилися після розрахунку");
      if (!title || priority > 3) {
        title = "Ціни в калькуляції застаріли";
        actionLabel = "Перерахувати";
        href = `/orders/${order.id}?tab=calculation`;
        tone = "warning";
        priority = 3;
      }
    }

    if (order.status === "APPROVED") {
      const missing = readinessMissing(order);
      if (missing.length > 0) {
        issues.push(`Не вистачає: ${missing[0]}`);
        if (!title || priority > 4) {
          title = "Не готове до передачі";
          actionLabel = missing[0] === "файл нанесення" ? "Додати файл" : "Доповнити";
          href = `/orders/${order.id}?tab=versions`;
          tone = "warning";
          priority = 4;
        }
      }
    }

    if (order.status === "PENDING_APPROVAL") {
      const entered = lastStageAt.get(order.id) ?? order.updatedAt;
      const days = Math.floor((Date.now() - entered.getTime()) / 86_400_000);
      if (days >= 5) {
        issues.push(`Без відповіді ${days} дн.`);
        if (!title || priority > 5) {
          title = `Погодження без відповіді ${days} дн.`;
          actionLabel = "Відкрити";
          href = `/orders/${order.id}?tab=versions`;
          tone = "warning";
          priority = 5;
        }
      } else if (!title) {
        title = "Погодити пропозицію";
        actionLabel = "Погодити";
        href = `/orders/${order.id}?tab=versions`;
        tone = "warning";
        priority = 15;
        issues.push("Чекає вашого рішення");
      }
    }

    if (order.status === "APPROVED" && readinessMissing(order).length === 0 && !title) {
      title = "Готове до передачі в цех";
      actionLabel = "Передати";
      href = `/orders/${order.id}?tab=versions`;
      tone = "success";
      priority = 20;
      issues.push("Специфікацію можна зафіксувати");
    }

    if (!composed(order) && ["DRAFT", "CALCULATION"].includes(order.status) && !title) {
      title = "Заповнити комплектацію";
      actionLabel = "Доповнити";
      href = `/orders/${order.id}?tab=configuration`;
      tone = "warning";
      priority = 25;
      issues.push("Немає матеріалів або операцій");
    }

    if (!hasVersion(order) && composed(order) && !title) {
      title = "Зафіксуйте ціну";
      actionLabel = "Зберегти пропозицію";
      href = `/orders/${order.id}?tab=versions&action=save`;
      tone = "warning";
      priority = 26;
      issues.push("Комплектацію зібрано, пропозиції ще немає");
    }

    if (!title) continue;

    decisions.push({
      id: order.id,
      orderId: order.id,
      number: order.number,
      clientName: order.client.companyName,
      amount,
      title,
      context: `${order.number} · ${amount > 0 ? `${Math.round(amount).toLocaleString("uk-UA")} ₴` : "без суми"}`,
      actionLabel,
      href,
      tone,
      issues,
    });
  }
  decisions.sort((a, b) => {
    const pa = a.tone === "danger" ? 0 : a.tone === "warning" ? 1 : 2;
    const pb = b.tone === "danger" ? 0 : b.tone === "warning" ? 1 : 2;
    if (pa !== pb) return pa - pb;
    return a.number.localeCompare(b.number, "uk");
  });

  const staleCount = active.filter(staleOf).length;
  const noNormCatalog = operations.filter((row) => {
    if (row.calculationMethod === "SHIFT_OUTPUT") {
      return !(num(row.standardOutputPerShift) > 0);
    }
    if (row.calculationMethod === "UNIT_RATE") return !(num(row.baseRate) > 0);
    return false;
  }).length;
  const noNormOrders = active.filter(noNormOf).length;
  const incompleteTemplates = products.filter(
    (product) => product._count.materials === 0 || product._count.operations === 0,
  ).length;

  const risks: CalcRiskGroup[] = [
    {
      key: "stale",
      label: "Застарілі пропозиції",
      count: staleCount,
      hint: "Ціни довідника змінені після розрахунку",
      href: dashboardQuery({ range, managerId, view: "portfolio", focus: "stale" }),
    },
    {
      key: "noNorm",
      label: "Операції без норми",
      count: noNormCatalog + noNormOrders,
      hint: "Немає ставки або виробітку — собівартість неповна",
      href: "/settings/operations",
    },
    {
      key: "incomplete",
      label: "Неповні еталони",
      count: incompleteTemplates,
      hint: "У виробі немає матеріалів або операцій",
      href: "/products",
    },
  ];

  const readiness: ReadinessRow[] = orders
    .filter((order) => order.status === "APPROVED")
    .map((order) => {
      const missing = readinessMissing(order);
      const percent = readinessPercent(order);
      const first = missing[0];
      const actionLabel =
        percent === 100
          ? "Передати"
          : first === "файл нанесення"
            ? "Додати файл"
            : first === "розміри й кількість"
              ? "Додати розміри"
              : first === "норми й ціни складу"
                ? "Оновити ціни"
                : "Доповнити";
      return {
        orderId: order.id,
        number: order.number,
        clientName: order.client.companyName,
        percent,
        missing: missing.length ? missing.join(", ") : "Усе на місці",
        actionLabel,
        href:
          percent === 100
            ? `/orders/${order.id}?tab=versions`
            : first === "файл нанесення"
              ? `/orders/${order.id}?tab=files`
              : first === "розміри й кількість" || first === "норми й ціни складу"
                ? `/orders/${order.id}?tab=configuration`
                : `/orders/${order.id}?tab=versions`,
      };
    })
    .sort((a, b) => a.percent - b.percent)
    .slice(0, 6);

  const criticalActions = new Set([
    "version_saved",
    "version_approved",
    "proposal_saved",
    "proposal_approved",
    "handed_to_production",
    "status_changed",
  ]);
  const orderNumber = new Map(orders.map((order) => [order.id, order.number]));
  const changes: CriticalChange[] = activity
    .filter((event) => criticalActions.has(event.action) && event.createdAt >= since)
    .slice(0, 8)
    .map((event) => {
      const number = event.entityType === "order" ? orderNumber.get(event.entityId) : null;
      const who = event.user?.name?.split(" ")[0] ?? "Система";
      const verb =
        event.action === "version_saved" || event.action === "proposal_saved"
          ? "збережено пропозицію"
          : event.action === "version_approved" || event.action === "proposal_approved"
            ? "погоджено пропозицію"
            : event.action === "handed_to_production"
              ? "передано в цех"
              : "змінено статус";
      return {
        id: event.id,
        text: `${who} ${verb}${number ? ` ${number}` : ""}`,
        href: event.entityType === "order" ? `/orders/${event.entityId}` : null,
        at: event.createdAt.toISOString(),
      };
    });

  const closedInPeriod = orders.filter(
    (order) => order.status === "CLOSED" && order.updatedAt >= since,
  );
  const tableSource = [...active, ...closedInPeriod.filter((order) => !active.some((row) => row.id === order.id))];
  const tableOrders = tableSource.map((order) => {
    const first = order.items[0];
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      deadline: order.deadline ? order.deadline.toISOString() : null,
      clientName: order.client.companyName,
      managerName: order.manager.name,
      productName: first?.nameUk || order.title || "—",
      extraItems: Math.max(order.items.length - 1, 0),
      amount: amountOf(order),
      margin: marginOf(order),
      overdue: isOverdue(order),
      dueSoon: isDueSoon(order),
      atRisk: riskIds.has(order.id),
      stale: staleOf(order),
    };
  });

  const managers = users
    .filter((user) => user.role === "MANAGER" || user.role === "ADMINISTRATOR")
    .map((user) => ({ id: user.id, name: user.name }));

  return {
    range,
    managerId,
    managers,
    pricing,
    kpis: {
      portfolio,
      orderCount: active.length,
      profit,
      profitShare: portfolio > 0 ? profit / portfolio : null,
      avgMargin,
      atRisk,
      atRiskCount: atRiskOrders.length,
    },
    stages,
    decisions: decisions.slice(0, 8),
    risks,
    readiness,
    changes,
    tableOrders,
  };
}

export { ordersWord };
