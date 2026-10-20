/**
 * Owner rule (fixed overhead / постійні витрати):
 * Allocate monthly shop overhead onto each unit via sewing labor and a coefficient.
 *
 * PV/month = sum(active articles)
 * PV/day = PV/month ÷ working days
 * PV/sewer/day = PV/day ÷ sewer count
 * coefficient = daily sewer pay ÷ PV/sewer/day  (1 decimal)
 * PV/unit = sewing/unit ÷ coefficient
 *
 * Not an operation — injected as a separate cost line after operations.
 * Sewer count is company-wide (directory only); order/product never override it.
 * Formula: PV/unit = sewing/unit ÷ coefficient, then added into unit cost.
 */

import { roundMoneyUah } from "@/lib/utils";

export const FIXED_COST_ADDITIONAL_ID = "fixed-overhead";
export const FIXED_COST_LINE_NAME_UK = "Постійні витрати";

/** Catalog leftover named like PV — real PV is sewing ÷ directory coefficient, not an operation. */
export function isFixedCostOperationName(nameUk: string | null | undefined) {
  const name = String(nameUk ?? "").trim();
  if (!name) return false;
  return name === FIXED_COST_LINE_NAME_UK || /постійні\s+витрат/i.test(name);
}

export type FixedCostParams = {
  workingDaysPerMonth: number;
  sewerCount: number;
  dailySewerPay: number;
  /** Sum of active article monthly amounts */
  monthlyTotal: number;
};

export type FixedCostMetrics = {
  monthlyTotal: number;
  perDay: number;
  perSewerPerDay: number;
  /** Rounded to 1 decimal */
  coefficient: number;
  /** Exact ratio before rounding (for diagnostics) */
  coefficientExact: number;
};

export type FixedCostValidationError =
  | "WORKING_DAYS_ZERO"
  | "SEWER_COUNT_ZERO"
  | "DAILY_PAY_ZERO"
  | "MONTHLY_TOTAL_ZERO";

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function roundMoney(value: number): number {
  return roundMoneyUah(value);
}

export function validateFixedCostParams(
  params: Pick<FixedCostParams, "workingDaysPerMonth" | "sewerCount" | "dailySewerPay"> & {
    monthlyTotal?: number;
  },
): FixedCostValidationError | null {
  if (!(params.workingDaysPerMonth > 0)) return "WORKING_DAYS_ZERO";
  if (!(params.sewerCount > 0)) return "SEWER_COUNT_ZERO";
  if (!(params.dailySewerPay > 0)) return "DAILY_PAY_ZERO";
  if (params.monthlyTotal != null && !(params.monthlyTotal > 0)) return "MONTHLY_TOTAL_ZERO";
  return null;
}

export function fixedCostValidationMessage(error: FixedCostValidationError): string {
  switch (error) {
    case "WORKING_DAYS_ZERO":
      return "Вкажіть кількість робочих днів у місяці (більше 0).";
    case "SEWER_COUNT_ZERO":
      return "Вкажіть кількість швачок (більше 0).";
    case "DAILY_PAY_ZERO":
      return "Вкажіть денну оплату однієї швачки (більше 0).";
    case "MONTHLY_TOTAL_ZERO":
      return "Додайте хоча б одну активну статтю постійних витрат.";
  }
}

/** Compute coefficient chain. Returns null if inputs are invalid. */
export function computeFixedCostMetrics(params: FixedCostParams): FixedCostMetrics | null {
  if (validateFixedCostParams(params)) return null;
  if (!(params.monthlyTotal > 0)) return null;

  const perDay = params.monthlyTotal / params.workingDaysPerMonth;
  const perSewerPerDay = perDay / params.sewerCount;
  if (!(perSewerPerDay > 0)) return null;

  const coefficientExact = params.dailySewerPay / perSewerPerDay;
  return {
    monthlyTotal: roundMoney(params.monthlyTotal),
    perDay: roundMoney(perDay),
    perSewerPerDay: roundMoney(perSewerPerDay),
    coefficient: round1(coefficientExact),
    coefficientExact,
  };
}

export function fixedCostPerUnitFromSewing(sewingPerUnit: number, coefficient: number): number {
  if (!(sewingPerUnit > 0) || !(coefficient > 0)) return 0;
  return roundMoney(sewingPerUnit / coefficient);
}

export type SewingBySizeRow = {
  sizeCode: string;
  quantity: number;
  sewingPerUnit: number;
  fixedCostPerUnit: number;
  fixedCostTotal: number;
};

export type FixedCostAllocation = {
  metrics: FixedCostMetrics;
  sewerCountUsed: number;
  usedOrderOverride: boolean;
  bySize: SewingBySizeRow[];
  sewingTotal: number;
  /** Weighted average sewing ₴/шт across the run */
  sewingPerUnit: number;
  fixedCostTotal: number;
  fixedCostPerUnit: number;
};

/**
 * Allocate PV as a flat ₴/шт for the whole run (does not vary by size).
 * PV/unit = weighted-average sewing/unit ÷ directory coefficient.
 */
export function allocateFixedCosts(args: {
  metrics: FixedCostMetrics;
  sewerCountUsed: number;
  usedOrderOverride: boolean;
  sizes: Array<{ sizeCode: string; quantity: number; sewingPerUnit: number }>;
}): FixedCostAllocation {
  const { metrics, sewerCountUsed, usedOrderOverride } = args;
  const bySize: SewingBySizeRow[] = [];
  let sewingTotal = 0;
  let qtyTotal = 0;

  for (const size of args.sizes) {
    const quantity = Math.max(0, Math.floor(size.quantity));
    if (quantity <= 0) continue;
    const sewingPerUnit = Math.max(0, size.sewingPerUnit);
    sewingTotal += sewingPerUnit * quantity;
    qtyTotal += quantity;
  }

  sewingTotal = roundMoney(sewingTotal);
  const sewingPerUnitAvg = qtyTotal > 0 ? roundMoney(sewingTotal / qtyTotal) : 0;
  const fixedCostPerUnit = fixedCostPerUnitFromSewing(sewingPerUnitAvg, metrics.coefficient);
  const fixedCostTotal = roundMoney(fixedCostPerUnit * qtyTotal);

  for (const size of args.sizes) {
    const quantity = Math.max(0, Math.floor(size.quantity));
    if (quantity <= 0) continue;
    bySize.push({
      sizeCode: size.sizeCode,
      quantity,
      sewingPerUnit: roundMoney(Math.max(0, size.sewingPerUnit)),
      fixedCostPerUnit,
      fixedCostTotal: roundMoney(fixedCostPerUnit * quantity),
    });
  }

  return {
    metrics,
    sewerCountUsed,
    usedOrderOverride,
    bySize,
    sewingTotal,
    sewingPerUnit: sewingPerUnitAvg,
    fixedCostTotal,
    fixedCostPerUnit,
  };
}

export function resolveSewerCount(args: {
  companySewerCount: number;
  orderOverride?: number | null;
}): { sewerCount: number; usedOrderOverride: boolean } {
  const override = args.orderOverride;
  if (override != null && override > 0) {
    return { sewerCount: Math.floor(override), usedOrderOverride: true };
  }
  return {
    sewerCount: Math.max(0, Math.floor(args.companySewerCount)),
    usedOrderOverride: false,
  };
}
