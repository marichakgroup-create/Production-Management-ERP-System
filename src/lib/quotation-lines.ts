import {
  isOrientativeTirageSize,
  isRealSizeCode,
  itemNeedsSizeBreakdown,
  type OrderSizeLine,
} from "@/lib/order-item-sizes";
import {
  OVERSIZE_CLIENT_SURCHARGE_PERCENT,
  oversizeQuantity,
  oversizeSurchargeBySize,
  oversizeSurchargeComment,
} from "@/lib/oversize-surcharge";
import { decorationDisplayName } from "@/lib/decoration-format-pricing";
import { roundMoneyUah } from "@/lib/utils";

export type QuotationSizeRow = {
  key: string;
  kind: "product" | "decoration";
  nameUk: string;
  sizeNameUk: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  /** Product rows only: e.g. «(+20% · +20,0 ₴ за великий розмір)» */
  sizeSurchargeComment: string | null;
};

export type QuotationDecorationLine = {
  nameSnapshot: string;
  setupCost?: number | null;
  unitRate?: number | null;
  quantity?: number | null;
};

export type QuotationSnapshot = {
  item?: {
    nameUk?: string;
    totalQuantity?: number;
    sizes?: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
    decorations?: QuotationDecorationLine[];
  };
  commercial?: {
    basePricePerUnit?: number;
    decorationPerUnit?: number;
    decorationTotal?: number;
  } | null;
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

function decorationName(row: QuotationDecorationLine) {
  const raw = row.nameSnapshot.trim();
  return decorationDisplayName(raw) || raw;
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

function resolveProductUnitPrice(input: {
  sizes: Array<{ sizeCode: string; quantity: number }>;
  totalSellingValue: number;
  fallbackUnitPrice: number;
  productPricePerUnit?: number | null;
  decorationPerUnit?: number | null;
}) {
  const explicit = Number(input.productPricePerUnit ?? 0);
  if (explicit > 0) return roundMoney(explicit);

  const qtyTotal = input.sizes.reduce((sum, size) => sum + size.quantity, 0);
  const oversizeQty = oversizeQuantity(input.sizes);
  const decorationPerUnit = Math.max(0, Number(input.decorationPerUnit ?? 0));
  const decorationTotal = roundMoney(decorationPerUnit * qtyTotal);
  const productPool = Math.max(0, input.totalSellingValue - decorationTotal);
  const denom = qtyTotal + (OVERSIZE_CLIENT_SURCHARGE_PERCENT / 100) * oversizeQty;
  if (denom > 0 && productPool > 0) {
    return roundMoney(productPool / denom);
  }
  const fallback = Math.max(0, input.fallbackUnitPrice - decorationPerUnit);
  return roundMoney(fallback);
}

/**
 * Client КП product rows: XS–2XL = product ₴/од. without branding;
 * 3XL+ = that price + 20%. Decorations are separate rows.
 */
export function allocateSellingBySize(input: {
  sizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
  totalSellingValue: number;
  fallbackUnitPrice: number;
  productPricePerUnit?: number | null;
  decorationPerUnit?: number | null;
  materials?: QuotationMaterialLine[];
  operations?: QuotationOperationLine[];
  sizeRules?: unknown;
  sharedPerUnit?: number;
}): Array<{
  sizeCode: string;
  sizeNameUk: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  surchargePerUnit: number;
}> {
  const sizes = positiveSizes(input.sizes);
  if (sizes.length === 0) {
    return [];
  }

  const productPricePerUnit = resolveProductUnitPrice({
    sizes,
    totalSellingValue: input.totalSellingValue,
    fallbackUnitPrice: input.fallbackUnitPrice,
    productPricePerUnit: input.productPricePerUnit,
    decorationPerUnit: input.decorationPerUnit,
  });
  const surchargeBySize = oversizeSurchargeBySize({
    sizes,
    productPricePerUnit,
  });

  return sizes.map((size) => {
    const surchargePerUnit = surchargeBySize[size.sizeCode] ?? 0;
    const unitPrice = roundMoney(productPricePerUnit + surchargePerUnit);
    return {
      sizeCode: size.sizeCode,
      sizeNameUk: size.sizeNameUk,
      quantity: size.quantity,
      unitPrice,
      lineTotal: roundMoney(unitPrice * size.quantity),
      surchargePerUnit,
    };
  });
}

function buildDecorationRows(input: {
  itemKey: string;
  decorations: QuotationDecorationLine[];
  totalQuantity: number;
  decorationPerUnit?: number | null;
  decorationTotal?: number | null;
}): QuotationSizeRow[] {
  const priced = input.decorations
    .map((row, index) => {
      const name = decorationName(row);
      const qty =
        row.quantity != null && Number.isFinite(row.quantity) && row.quantity > 0
          ? Math.floor(row.quantity)
          : input.totalQuantity;
      const setup = Number(row.setupCost ?? 0);
      const unitRate = Number(row.unitRate ?? 0);
      const lineTotal = roundMoney(setup + unitRate * qty);
      if (!(lineTotal > 0.05) && !name) return null;
      if (!(lineTotal > 0.05)) return null;
      const unitPrice = qty > 0 ? roundMoney(lineTotal / qty) : roundMoney(unitRate);
      return {
        key: `${input.itemKey}-deco-${index}`,
        kind: "decoration" as const,
        nameUk: name ? `Нанесення: ${name}` : "Нанесення",
        sizeNameUk: null,
        quantity: qty,
        unitPrice,
        lineTotal,
        sizeSurchargeComment: null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  if (priced.length > 0) return priced;

  const decorationTotal = Number(input.decorationTotal ?? 0);
  const decorationPerUnit = Number(input.decorationPerUnit ?? 0);
  const total =
    decorationTotal > 0.05
      ? roundMoney(decorationTotal)
      : roundMoney(decorationPerUnit * input.totalQuantity);
  if (!(total > 0.05) || input.totalQuantity <= 0) return [];

  const names = input.decorations.map(decorationName).filter(Boolean);
  return [
    {
      key: `${input.itemKey}-deco`,
      kind: "decoration",
      nameUk: names.length > 0 ? `Нанесення: ${names.join(", ")}` : "Нанесення",
      sizeNameUk: null,
      quantity: input.totalQuantity,
      unitPrice: roundMoney(total / input.totalQuantity),
      lineTotal: total,
      sizeSurchargeComment: null,
    },
  ];
}

/** Product rows (без нанесення) + separate branding rows. */
export function buildQuotationSizeRows(input: {
  itemKey: string;
  snapshot: QuotationSnapshot;
  unitPrice: number;
  totalSellingValue?: number;
  fallbackNameUk: string;
  fallbackSizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
  fallbackDecorations: QuotationDecorationLine[];
  fallbackTotalQuantity: number;
  materials?: QuotationMaterialLine[];
  operations?: QuotationOperationLine[];
  sizeRules?: unknown;
  productPricePerUnit?: number | null;
  decorationPerUnit?: number | null;
  sharedPerUnit?: number;
}): QuotationSizeRow[] {
  const snapItem = input.snapshot.item;
  const nameUk = snapItem?.nameUk ?? input.fallbackNameUk;
  const decorations = snapItem?.decorations ?? input.fallbackDecorations;
  const totalQuantity = snapItem?.totalQuantity ?? input.fallbackTotalQuantity;
  const totalSellingValue =
    input.totalSellingValue ?? roundMoney(input.unitPrice * totalQuantity);
  const decorationPerUnit =
    input.decorationPerUnit ?? input.snapshot.commercial?.decorationPerUnit ?? null;
  const productPricePerUnit =
    input.productPricePerUnit ??
    input.snapshot.commercial?.basePricePerUnit ??
    null;

  const sizes = resolveQuotationSizes({
    snapshotSizes: snapItem?.sizes,
    liveSizes: input.fallbackSizes,
  });

  const decorationRows = buildDecorationRows({
    itemKey: input.itemKey,
    decorations,
    totalQuantity,
    decorationPerUnit,
    decorationTotal: input.snapshot.commercial?.decorationTotal ?? null,
  });

  function productRow(args: {
    key: string;
    sizeNameUk: string | null;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    sizeSurchargeComment: string | null;
  }): QuotationSizeRow {
    return {
      kind: "product",
      nameUk,
      ...args,
    };
  }

  if (sizes.length === 0) {
    const unit = resolveProductUnitPrice({
      sizes: [{ sizeCode: "ONE", quantity: totalQuantity }],
      totalSellingValue,
      fallbackUnitPrice: input.unitPrice,
      productPricePerUnit,
      decorationPerUnit,
    });
    return [
      productRow({
        key: input.itemKey,
        sizeNameUk: null,
        quantity: totalQuantity,
        unitPrice: unit,
        lineTotal: roundMoney(unit * totalQuantity),
        sizeSurchargeComment: null,
      }),
      ...decorationRows,
    ];
  }

  if (sizes.length === 1 && isOrientativeTirageSize(sizes[0]!)) {
    const unit = resolveProductUnitPrice({
      sizes,
      totalSellingValue,
      fallbackUnitPrice: input.unitPrice,
      productPricePerUnit,
      decorationPerUnit,
    });
    return [
      productRow({
        key: input.itemKey,
        sizeNameUk: sizes[0]!.sizeNameUk,
        quantity: sizes[0]!.quantity,
        unitPrice: unit,
        lineTotal: roundMoney(unit * sizes[0]!.quantity),
        sizeSurchargeComment: null,
      }),
      ...decorationRows,
    ];
  }

  const priced = allocateSellingBySize({
    sizes,
    totalSellingValue,
    fallbackUnitPrice: input.unitPrice,
    productPricePerUnit,
    decorationPerUnit,
    materials: input.materials,
    operations: input.operations,
    sizeRules: input.sizeRules,
    sharedPerUnit: input.sharedPerUnit,
  });

  return [
    ...priced.map((row) =>
      productRow({
        key: `${input.itemKey}-${row.sizeCode}`,
        sizeNameUk: row.sizeNameUk,
        quantity: row.quantity,
        unitPrice: row.unitPrice,
        lineTotal: row.lineTotal,
        sizeSurchargeComment: oversizeSurchargeComment(row.surchargePerUnit),
      }),
    ),
    ...decorationRows,
  ];
}

export function quotationGrandTotal(
  lines: Array<{ version: { totalSellingValue: unknown } }>,
) {
  return lines.reduce((sum, row) => sum + Number(row.version.totalSellingValue), 0);
}
