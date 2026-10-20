import {
  isOrientativeTirageSize,
  isRealSizeCode,
  itemNeedsSizeBreakdown,
  type OrderSizeLine,
} from "@/lib/order-item-sizes";
import type { SizeCoeffRule } from "@/lib/size-coeffs";
import { roundMoneyUah } from "@/lib/utils";

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
  return roundMoneyUah(value);
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

/**
 * Client КП: same ₴/од. on every size (proposal unit price).
 * Totals still sum to `totalSellingValue` (drift fixed on last row).
 * Cost-weighted split was confusing when the commercial price is flat.
 */
export function allocateSellingBySize(input: {
  sizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
  totalSellingValue: number;
  fallbackUnitPrice: number;
  /** @deprecated Kept for call-site compat; ignored (flat unit price). */
  materials?: QuotationMaterialLine[];
  /** @deprecated Kept for call-site compat; ignored (flat unit price). */
  operations?: QuotationOperationLine[];
  /** @deprecated Kept for call-site compat; ignored (flat unit price). */
  sizeRules?: SizeCoeffRule[] | null;
  /** @deprecated Kept for call-site compat; ignored (flat unit price). */
  sharedPerUnit?: number;
}): Array<{ sizeCode: string; sizeNameUk: string; quantity: number; unitPrice: number; lineTotal: number }> {
  const sizes = positiveSizes(input.sizes);
  if (sizes.length === 0) {
    return [];
  }

  const qtyTotal = sizes.reduce((sum, size) => sum + size.quantity, 0);
  const unitPrice =
    qtyTotal > 0
      ? roundMoney(input.totalSellingValue / qtyTotal)
      : roundMoney(input.fallbackUnitPrice);

  const allocated = sizes.map((size) => ({
    sizeCode: size.sizeCode,
    sizeNameUk: size.sizeNameUk,
    quantity: size.quantity,
    unitPrice,
    lineTotal: roundMoney(unitPrice * size.quantity),
  }));

  const drift =
    roundMoney(input.totalSellingValue) -
    roundMoney(allocated.reduce((sum, row) => sum + row.lineTotal, 0));
  if (allocated.length > 0 && Math.abs(drift) >= 0.05) {
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
