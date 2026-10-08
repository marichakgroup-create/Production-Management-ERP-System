import { linesForSize } from "@/lib/size-bom";
import {
  isOrientativeTirageSize,
  isRealSizeCode,
  itemNeedsSizeBreakdown,
  type OrderSizeLine,
} from "@/lib/order-item-sizes";
import {
  isOversizeCode,
  resolveSizeCoeffs,
  type SizeCoeffRule,
} from "@/lib/size-coeffs";
import { isCutOperationName } from "@/lib/cut-rate";
import { isDeliveryOperationName } from "@/lib/quantity-tiers";

export type QuotationSizeRow = {
  key: string;
  nameUk: string;
  sizeNameUk: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** e.g. «Нанесення: вишивка логотипу» */
  decorationsLabel: string | null;
};

export type QuotationSnapshot = {
  item?: {
    nameUk?: string;
    totalQuantity?: number;
    sizes?: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
    decorations?: Array<{ nameSnapshot: string }>;
  };
};

export type QuotationMaterialLine = {
  sizeCode?: string | null;
  nameSnapshot?: string | null;
  materialId?: string | null;
  consumptionPerUnit: number;
  wastePercent: number;
  purchasePrice: number;
};

export type QuotationOperationLine = {
  sizeCode?: string | null;
  nameSnapshot?: string | null;
  operationId?: string | null;
  unitRate: number | null;
};

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function decorationLabels(decorations: Array<{ nameSnapshot: string }>) {
  return decorations.map((row) => row.nameSnapshot.trim()).filter(Boolean);
}

function positiveSizes(
  sizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>,
) {
  return sizes.filter((size) => size.quantity > 0);
}

/**
 * Prefer the live size grid when the order already has a real breakdown.
 * Snapshot may still hold orientative «Тираж (ONE)» from an earlier save.
 */
export function resolveQuotationSizes(input: {
  snapshotSizes?: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }> | null;
  liveSizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
}): Array<{ sizeCode: string; sizeNameUk: string; quantity: number }> {
  const live = positiveSizes(input.liveSizes);
  const snap = positiveSizes(input.snapshotSizes ?? []);
  const liveReal = live.filter((row) => isRealSizeCode(row.sizeCode));
  if (liveReal.length > 0) return liveReal;

  const snapReal = snap.filter((row) => isRealSizeCode(row.sizeCode));
  if (snapReal.length > 0) return snapReal;

  return live.length > 0 ? live : snap;
}

/** Banner «XS–XXL / 3XL+ later» — only while at least one line still has orientative tirage. */
export function quotationNeedsBaseSizeDisclaimer(
  items: Array<{
    sizes: OrderSizeLine[];
    catalogHasSizes: boolean;
  }>,
): boolean {
  return items.some((item) =>
    itemNeedsSizeBreakdown(item.sizes, { catalogHasSizes: item.catalogHasSizes }),
  );
}

function variableUnitCostForSize(input: {
  sizeCode: string;
  materials: QuotationMaterialLine[];
  operations: QuotationOperationLine[];
  sizeRules?: SizeCoeffRule[] | null;
}): number {
  const coeffs = resolveSizeCoeffs(input.sizeCode, input.sizeRules);
  const materials = input.materials.map((row, index) => ({
    id: `m-${index}`,
    groupKey: row.materialId ?? row.nameSnapshot ?? `m-${index}`,
    sizeCode: row.sizeCode ?? null,
    consumptionPerUnit: row.consumptionPerUnit,
    wastePercent: row.wastePercent,
    purchasePrice: row.purchasePrice,
    applySizeCoeff: !(row.sizeCode != null && isOversizeCode(row.sizeCode)),
  }));
  const operations = input.operations.map((row, index) => ({
    id: `o-${index}`,
    groupKey: row.operationId ?? row.nameSnapshot ?? `o-${index}`,
    sizeCode: row.sizeCode ?? null,
    unitRate: row.unitRate ?? 0,
    applySizeCoeff:
      !isCutOperationName(row.nameSnapshot) && !isDeliveryOperationName(row.nameSnapshot),
  }));

  let cost = 0;
  for (const line of linesForSize(materials, input.sizeCode)) {
    const coeff = line.applySizeCoeff === false ? 1 : coeffs.materialCoeff;
    cost +=
      line.consumptionPerUnit *
      (1 + line.wastePercent / 100) *
      line.purchasePrice *
      coeff;
  }
  for (const line of linesForSize(operations, input.sizeCode)) {
    const coeff = line.applySizeCoeff === false ? 1 : coeffs.operationCoeff;
    cost += Number(line.unitRate ?? 0) * coeff;
  }
  return cost;
}

/**
 * Split proposal total across sizes by relative unit cost (incl. 3XL+ coeffs).
 * Sum of line totals equals `totalSellingValue`.
 */
export function allocateSellingBySize(input: {
  sizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
  totalSellingValue: number;
  fallbackUnitPrice: number;
  materials?: QuotationMaterialLine[];
  operations?: QuotationOperationLine[];
  sizeRules?: SizeCoeffRule[] | null;
  sharedPerUnit?: number;
}): Array<{ sizeCode: string; sizeNameUk: string; quantity: number; unitPrice: number; lineTotal: number }> {
  const sizes = positiveSizes(input.sizes);
  if (sizes.length === 0) {
    return [];
  }

  const materials = input.materials ?? [];
  const operations = input.operations ?? [];
  const shared = input.sharedPerUnit ?? 0;
  const hasBom = materials.length > 0 || operations.length > 0;

  if (!hasBom || sizes.length === 1) {
    return sizes.map((size) => {
      const unitPrice = input.fallbackUnitPrice;
      return {
        ...size,
        unitPrice,
        lineTotal: roundMoney(unitPrice * size.quantity),
      };
    });
  }

  const weights = sizes.map((size) => {
    const variable = variableUnitCostForSize({
      sizeCode: size.sizeCode,
      materials,
      operations,
      sizeRules: input.sizeRules,
    });
    const unitCost = Math.max(0, variable + shared);
    return { size, unitCost, weight: unitCost * size.quantity };
  });

  const weightSum = weights.reduce((sum, row) => sum + row.weight, 0);
  if (weightSum <= 0) {
    return sizes.map((size) => {
      const unitPrice = input.fallbackUnitPrice;
      return {
        ...size,
        unitPrice,
        lineTotal: roundMoney(unitPrice * size.quantity),
      };
    });
  }

  const allocated = weights.map((row) => {
    const lineTotal = roundMoney(
      (input.totalSellingValue * row.weight) / weightSum,
    );
    const unitPrice =
      row.size.quantity > 0 ? roundMoney(lineTotal / row.size.quantity) : input.fallbackUnitPrice;
    return {
      sizeCode: row.size.sizeCode,
      sizeNameUk: row.size.sizeNameUk,
      quantity: row.size.quantity,
      unitPrice,
      lineTotal,
    };
  });

  // Fix rounding drift on the last row so the table matches the proposal total.
  const drift =
    roundMoney(input.totalSellingValue) -
    roundMoney(allocated.reduce((sum, row) => sum + row.lineTotal, 0));
  if (allocated.length > 0 && Math.abs(drift) >= 0.01) {
    const last = allocated[allocated.length - 1]!;
    last.lineTotal = roundMoney(last.lineTotal + drift);
    last.unitPrice =
      last.quantity > 0 ? roundMoney(last.lineTotal / last.quantity) : last.unitPrice;
  }

  return allocated;
}

/** One KP table row per size (or one row if no size grid). */
export function buildQuotationSizeRows(input: {
  itemKey: string;
  snapshot: QuotationSnapshot;
  unitPrice: number;
  totalSellingValue?: number;
  fallbackNameUk: string;
  fallbackSizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
  fallbackDecorations: Array<{ nameSnapshot: string }>;
  fallbackTotalQuantity: number;
  materials?: QuotationMaterialLine[];
  operations?: QuotationOperationLine[];
  sizeRules?: SizeCoeffRule[] | null;
  sharedPerUnit?: number;
}): QuotationSizeRow[] {
  const snapItem = input.snapshot.item;
  const nameUk = snapItem?.nameUk ?? input.fallbackNameUk;
  const decorations = snapItem?.decorations ?? input.fallbackDecorations;
  const totalQuantity = snapItem?.totalQuantity ?? input.fallbackTotalQuantity;
  const totalSellingValue =
    input.totalSellingValue ?? roundMoney(input.unitPrice * totalQuantity);

  const labels = decorationLabels(decorations);
  const decorationsLabel =
    labels.length > 0 ? `Нанесення: ${labels.join(", ")}` : null;

  const sizes = resolveQuotationSizes({
    snapshotSizes: snapItem?.sizes,
    liveSizes: input.fallbackSizes,
  });

  if (sizes.length === 0) {
    return [
      {
        key: input.itemKey,
        nameUk,
        sizeNameUk: null,
        quantity: totalQuantity,
        unitPrice: input.unitPrice,
        lineTotal: roundMoney(totalSellingValue),
        decorationsLabel,
      },
    ];
  }

  // Single orientative tirage → one row, no size surcharge schedule.
  if (sizes.length === 1 && isOrientativeTirageSize(sizes[0]!)) {
    return [
      {
        key: input.itemKey,
        nameUk,
        sizeNameUk: sizes[0]!.sizeNameUk,
        quantity: sizes[0]!.quantity,
        unitPrice: input.unitPrice,
        lineTotal: roundMoney(totalSellingValue),
        decorationsLabel,
      },
    ];
  }

  const priced = allocateSellingBySize({
    sizes,
    totalSellingValue,
    fallbackUnitPrice: input.unitPrice,
    materials: input.materials,
    operations: input.operations,
    sizeRules: input.sizeRules,
    sharedPerUnit: input.sharedPerUnit,
  });

  return priced.map((row) => ({
    key: `${input.itemKey}-${row.sizeCode}`,
    nameUk,
    sizeNameUk: row.sizeNameUk,
    quantity: row.quantity,
    unitPrice: row.unitPrice,
    lineTotal: row.lineTotal,
    decorationsLabel,
  }));
}

export function quotationGrandTotal(
  lines: Array<{ version: { totalSellingValue: unknown } }>,
) {
  return lines.reduce((sum, row) => sum + Number(row.version.totalSellingValue), 0);
}
