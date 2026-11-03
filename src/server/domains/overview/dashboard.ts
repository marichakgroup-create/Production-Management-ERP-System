import { Prisma } from "@prisma/client";
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
  cost: number;
  profit: number;
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
    cost: number;
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
    title: string | null;
    products: Array<{ name: string; qty: number }>;
    amount: number;
    cost: number;
    profit: number;
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

function parseProductLines(value: unknown): Array<{ name: string; qty: number }> {
  const raw = typeof value === "string" ? safeJson(value) : value;
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const name = "name" in row && typeof row.name === "string" ? row.name.trim() : "";
    const qty = "qty" in row ? Number(row.qty) : 0;
    if (!name) return [];
    return [{ name, qty: Number.isFinite(qty) ? qty : 0 }];
  });
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    return [];
  }
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

  const managerSql = managerId
    ? Prisma.sql`AND o."managerId" = ${managerId}`
    : Prisma.empty;

  const [pricingRow, users, activity, orderRows, incompleteTemplates, noNormCatalog] = await Promise.all([
    prisma.pricingSettings.findFirst({ select: { minimumMarginPercent: true } }),
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: "asc" },
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
    prisma.$queryRaw<Array<{
      id: string;
      number: string;
      status: string;
      title: string | null;
      deadline: Date | null;
      createdAt: Date;
      updatedAt: Date;
      clientName: string;
      managerId: string;
      managerName: string;
      amount: unknown;
      cost: unknown;
      profit: unknown;
      itemCount: number;
      firstItemName: string | null;
      products: unknown;
      composed: boolean;
      hasQty: boolean;
      hasVersion: boolean;
      hasApproved: boolean;
      needsDecorationFile: boolean;
      stale: boolean;
      noNorm: boolean;
    }>>`
      WITH latest AS (
        SELECT DISTINCT ON (v."orderItemId")
          v."orderItemId",
          v."isApproved",
          v."totalSellingValue",
          v."totalCost",
          v."profitAmount",
          v."createdAt"
        FROM calculation_versions v
        ORDER BY v."orderItemId", v."isApproved" DESC, v."versionNumber" DESC
      )
      SELECT
        o.id,
        o.number,
        o.status::text AS status,
        o.title,
        o.deadline,
        o."createdAt",
        o."updatedAt",
        c."companyName" AS "clientName",
        u.id AS "managerId",
        u.name AS "managerName",
        COALESCE(SUM(latest."totalSellingValue"), 0) AS amount,
        COALESCE(SUM(latest."totalCost"), 0) AS cost,
        COALESCE(SUM(
          CASE
            WHEN latest."orderItemId" IS NULL THEN 0
            WHEN latest."profitAmount" IS NOT NULL THEN latest."profitAmount"
            ELSE latest."totalSellingValue" - latest."totalCost"
          END
        ), 0) AS profit,
        (SELECT count(*)::int FROM order_items i2 WHERE i2."orderId" = o.id) AS "itemCount",
        (
          SELECT i2."nameUk" FROM order_items i2
          WHERE i2."orderId" = o.id
          ORDER BY i2."createdAt" ASC
          LIMIT 1
        ) AS "firstItemName",
        (
          SELECT COALESCE(
            json_agg(
              json_build_object('name', i2."nameUk", 'qty', i2."totalQuantity")
              ORDER BY i2."createdAt"
            ),
            '[]'::json
          )
          FROM order_items i2
          WHERE i2."orderId" = o.id
        ) AS products,
        EXISTS (
          SELECT 1 FROM order_items i2
          WHERE i2."orderId" = o.id
            AND EXISTS (SELECT 1 FROM order_item_materials m WHERE m."orderItemId" = i2.id)
            AND EXISTS (SELECT 1 FROM order_item_operations op WHERE op."orderItemId" = i2.id)
        ) AS composed,
        COALESCE((
          SELECT BOOL_AND(qty > 0) FROM (
            SELECT COALESCE(SUM(s.quantity), 0) AS qty
            FROM order_items i2
            LEFT JOIN order_item_sizes s ON s."orderItemId" = i2.id
            WHERE i2."orderId" = o.id
            GROUP BY i2.id
          ) qty_rows
        ), true) AS "hasQty",
        EXISTS (
          SELECT 1 FROM order_items i2
          JOIN latest l ON l."orderItemId" = i2.id
          WHERE i2."orderId" = o.id
        ) AS "hasVersion",
        (
          (SELECT count(*) FROM order_items i2 WHERE i2."orderId" = o.id) > 0
          AND COALESCE((
            SELECT BOOL_AND(COALESCE(l."isApproved", false))
            FROM order_items i2
            LEFT JOIN latest l ON l."orderItemId" = i2.id
            WHERE i2."orderId" = o.id
          ), false)
        ) AS "hasApproved",
        (
          EXISTS (
            SELECT 1 FROM order_item_decorations d
            JOIN order_items i2 ON i2.id = d."orderItemId"
            WHERE i2."orderId" = o.id
              AND btrim(d."nameSnapshot") <> 'Додаткові витрати'
          )
          AND NOT EXISTS (SELECT 1 FROM file_assets f WHERE f."orderId" = o.id)
        ) AS "needsDecorationFile",
        (
          EXISTS (
            SELECT 1
            FROM order_items i2
            JOIN latest l ON l."orderItemId" = i2.id
            JOIN order_item_materials m ON m."orderItemId" = i2.id
            JOIN materials mat ON mat.id = m."materialId"
            WHERE i2."orderId" = o.id
              AND mat."updatedAt" > l."createdAt"
              AND abs(mat."purchasePrice" - m."purchasePrice") > 0.0001
          )
          OR EXISTS (
            SELECT 1
            FROM order_items i2
            JOIN latest l ON l."orderItemId" = i2.id
            JOIN order_item_operations op ON op."orderItemId" = i2.id
            JOIN operations cat ON cat.id = op."operationId"
            WHERE i2."orderId" = o.id
              AND cat."updatedAt" > l."createdAt"
          )
        ) AS stale,
        EXISTS (
          SELECT 1 FROM order_item_operations op
          JOIN order_items i2 ON i2.id = op."orderItemId"
          WHERE i2."orderId" = o.id
            AND (
              (op."calculationMethod"::text = 'SHIFT_OUTPUT'
                AND NOT (COALESCE(op."standardOutput", 0) > 0 AND COALESCE(op."shiftCost", 0) >= 0))
              OR (op."calculationMethod"::text = 'UNIT_RATE'
                AND NOT (COALESCE(op."unitRate", 0) > 0))
            )
        ) AS "noNorm"
      FROM orders o
      JOIN clients c ON c.id = o."clientId"
      JOIN users u ON u.id = o."managerId"
      LEFT JOIN order_items i ON i."orderId" = o.id
      LEFT JOIN latest ON latest."orderItemId" = i.id
      WHERE o.status::text <> 'CANCELLED'
      ${managerSql}
      GROUP BY o.id, c.id, u.id
      ORDER BY o."createdAt" DESC
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM products p
      WHERE p.status::text = 'ACTIVE'
        AND (
          NOT EXISTS (SELECT 1 FROM product_materials pm WHERE pm."productId" = p.id)
          OR NOT EXISTS (SELECT 1 FROM product_operations po WHERE po."productId" = p.id)
        )
    `,
    prisma.$queryRaw<Array<{ n: number }>>`
      SELECT count(*)::int AS n
      FROM operations op
      WHERE (
        op."calculationMethod"::text = 'SHIFT_OUTPUT'
        AND NOT (COALESCE(op."standardOutputPerShift", 0) > 0)
      ) OR (
        op."calculationMethod"::text = 'UNIT_RATE'
        AND NOT (COALESCE(op."baseRate", 0) > 0)
      )
    `,
  ]);

  const orders = orderRows.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status,
    title: row.title,
    deadline: row.deadline,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    client: { companyName: row.clientName },
    manager: { id: row.managerId, name: row.managerName },
    amount: num(row.amount),
    cost: num(row.cost),
    profit: num(row.profit),
    itemCount: Number(row.itemCount) || 0,
    firstItemName: row.firstItemName,
    products: row.products,
    composed: Boolean(row.composed),
    hasQty: Boolean(row.hasQty),
    hasVersion: Boolean(row.hasVersion),
    hasApproved: Boolean(row.hasApproved),
    needsDecorationFile: Boolean(row.needsDecorationFile),
    stale: Boolean(row.stale),
    noNorm: Boolean(row.noNorm),
    items: Array.from({ length: Number(row.itemCount) || 0 }, (_, index) => ({
      nameUk: index === 0 ? row.firstItemName || "" : "",
    })),
  }));

  const pricing = {
    targetRatePercent: 0,
    minimumMarginPercent: Number(pricingRow?.minimumMarginPercent ?? 15),
  };

  const lastStageAt = new Map<string, Date>();
  for (const event of activity) {
    if (event.entityType !== "order") continue;
    if (event.action !== "status_changed" && event.action !== "created" && event.action !== "handed_to_production") {
      continue;
    }
    if (!lastStageAt.has(event.entityId)) lastStageAt.set(event.entityId, event.createdAt);
  }

  type Row = (typeof orders)[number];
  const amountOf = (order: Row) => order.amount;
  const profitOf = (order: Row) => order.profit;
  const marginOf = (order: Row) => {
    if (order.amount <= 0) return null;
    return (order.profit / order.amount) * 100;
  };
  const composed = (order: Row) => order.composed;
  const hasQty = (order: Row) => order.hasQty;
  const hasVersion = (order: Row) => order.hasVersion;
  const hasApproved = (order: Row) => order.hasApproved;
  const needsDecorationFile = (order: Row) => order.needsDecorationFile;
  const staleOf = (order: Row) =>
    !["HANDED_TO_PRODUCTION", "CLOSED"].includes(order.status) && order.stale;
  const noNormOf = (order: Row) => order.noNorm;

  const readinessMissing = (order: Row) => {
    const missing: string[] = [];
    if (!hasApproved(order)) missing.push("погоджена пропозиція");
    if (!hasQty(order)) missing.push("розміри й кількість");
    if (!composed(order)) missing.push("норми й ціни складу");
    if (needsDecorationFile(order)) missing.push("файл нанесення");
    return missing;
  };

  const readinessPercent = (order: Row) => {
    const checks = 4;
    return Math.round(((checks - readinessMissing(order).length) / checks) * 100);
  };

  const active = orders.filter((order) =>
    ["DRAFT", "CALCULATION", "PENDING_APPROVAL", "APPROVED", "HANDED_TO_PRODUCTION"].includes(
      order.status,
    ),
  );

  const portfolio = active.reduce((sum, order) => sum + amountOf(order), 0);
  const cost = active.reduce((sum, order) => sum + order.cost, 0);
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
    const stageCost = rows.reduce((sum, order) => sum + order.cost, 0);
    const stageProfit = rows.reduce((sum, order) => sum + order.profit, 0);
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
      cost: stageCost,
      profit: stageProfit,
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
  const noNormOrders = active.filter(noNormOf).length;
  const catalogNoNorm = Number(noNormCatalog[0]?.n ?? 0);
  const incompleteCount = Number(incompleteTemplates[0]?.n ?? 0);

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
      count: catalogNoNorm + noNormOrders,
      hint: "Немає ставки або виробітку — собівартість неповна",
      href: "/settings/operations",
    },
    {
      key: "incomplete",
      label: "Неповні еталони",
      count: incompleteCount,
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
      title: order.title,
      products: parseProductLines(order.products),
      amount: amountOf(order),
      cost: order.cost,
      profit: order.profit,
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
      cost,
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
