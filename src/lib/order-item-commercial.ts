import { commercialPriceTiersFromProduct } from "@/lib/commercial-price";
import { buildCommercialOrderLinePrice } from "@/lib/commercial-order-line";
import type { CalculationResult } from "@/server/domains/calculation/engine";
import {
  calcWithClientPrice,
  resolveSewingPerUnitFromOperations,
} from "@/lib/product-selling";
import {
  applyOversizeSellingSurcharge,
  oversizeQuantity,
} from "@/lib/oversize-surcharge";
import { proposalClientUnitPrices } from "@/lib/proposal-snapshot";
import { roundMoneyUah } from "@/lib/utils";

export type ClientPriceSource = "pricelist" | "sewing_markup" | "cost" | "proposal";

export type OrderItemCommercialInput = {
  totalQuantity: number;
  decorations: Array<{
    setupCost: { toString(): string } | number;
    unitRate: { toString(): string } | number;
    quantity?: number | null;
  }>;
  sizes?: Array<{ sizeCode: string; quantity: number }>;
  materials?: Array<{
    id?: string | null;
    materialId?: string | null;
    nameSnapshot?: string | null;
    sizeCode?: string | null;
    consumptionPerUnit: { toString(): string } | number;
    wastePercent: { toString(): string } | number;
    purchasePrice: { toString(): string } | number;
  }>;
  operations?: Array<{
    id?: string | null;
    operationId?: string | null;
    nameSnapshot?: string | null;
    sizeCode?: string | null;
    unitRate?: { toString(): string } | number | null;
    shiftCost?: { toString(): string } | number | null;
    standardOutput?: { toString(): string } | number | null;
    calculationMethod?: string;
  }>;
  product?: {
    isBaseModel?: boolean;
    commercialPriceTiers: Array<{ minQuantity: number; pricePerUnit: unknown }>;
  } | null;
};

export type DraftOversizeSurcharge = {
  perUnit: number;
  total: number;
  quantity: number;
  percent: number;
  bySize: Record<string, number>;
};

/** Client quote: product + decoration, optional % discount, then +20% on 3XL+ product only. */
export function quoteClientLine(input: {
  quantity: number;
  productPricePerUnit: number;
  decorationPerUnit: number;
  discountPercent?: number | null;
  sizes?: Array<{ sizeCode: string; quantity: number }>;
  oversizeQuantity?: number;
  costPerUnit: number;
}) {
  const quantity = Math.max(0, input.quantity);
  const discount =
    input.discountPercent != null && Number.isFinite(input.discountPercent)
      ? Math.max(0, Math.min(99, input.discountPercent))
      : 0;
  const factor = 1 - discount / 100;
  const productNet = roundMoneyUah(Math.max(0, input.productPricePerUnit) * factor);
  const decorationNet = roundMoneyUah(Math.max(0, input.decorationPerUnit) * factor);
  const sizes =
    input.sizes && input.sizes.length > 0
      ? input.sizes
      : [
          { sizeCode: "M", quantity: Math.max(0, quantity - (input.oversizeQuantity ?? 0)) },
          { sizeCode: "3XL", quantity: Math.max(0, input.oversizeQuantity ?? 0) },
        ];
  const oversizeQty = input.oversizeQuantity ?? oversizeQuantity(sizes);
  const applied = applyOversizeSellingSurcharge({
    sellingPricePerUnit: productNet + decorationNet,
    totalSellingValue: roundMoneyUah((productNet + decorationNet) * quantity),
    quantity,
    productPricePerUnit: productNet,
    sizes,
  });
  const totalCost = input.costPerUnit * quantity;
  const profit = applied.totalSellingValue - totalCost;
  const marginPercent =
    applied.totalSellingValue > 0 ? (profit / applied.totalSellingValue) * 100 : 0;
  return {
    productPricePerUnit: productNet,
    decorationPerUnit: decorationNet,
    oversizeQuantity: oversizeQty,
    oversizeSurcharge: applied.surcharge,
    sellingPricePerUnit: applied.sellingPricePerUnit,
    totalSellingValue: applied.totalSellingValue,
    marginPercent,
    discountPercent: discount,
  };
}

export function applyItemOversizeSellingSurcharge(
  item: OrderItemCommercialInput,
  selling: {
    sellingPricePerUnit: number;
    totalSellingValue: number;
    basePricePerUnit?: number;
    decorationPerUnit?: number;
  },
) {
  const decorationPerUnit = selling.decorationPerUnit ?? 0;
  const productPricePerUnit =
    selling.basePricePerUnit ??
    Math.max(0, selling.sellingPricePerUnit - decorationPerUnit);
  const applied = applyOversizeSellingSurcharge({
    sellingPricePerUnit: selling.sellingPricePerUnit,
    totalSellingValue: selling.totalSellingValue,
    quantity: item.totalQuantity,
    productPricePerUnit,
    sizes: item.sizes ?? [],
  });
  return {
    sellingPricePerUnit: applied.sellingPricePerUnit,
    totalSellingValue: applied.totalSellingValue,
    oversizeSurcharge: applied.surcharge,
  };
}

export function commercialPriceForOrderItem(
  item: OrderItemCommercialInput,
  options?: {
    discountPercent?: number | null;
    fallbackPricePerUnit?: number | null;
  },
) {
  const tiers = commercialPriceTiersFromProduct(item.product);
  if (tiers.length === 0) return null;

  return buildCommercialOrderLinePrice({
    quantity: item.totalQuantity,
    priceTiers: tiers,
    decorations: item.decorations.map((row) => ({
      setupCost: Number(row.setupCost),
      unitRate: Number(row.unitRate),
      quantity: row.quantity ?? null,
    })),
    discountPercent: options?.discountPercent,
    fallbackPricePerUnit: options?.fallbackPricePerUnit ?? null,
  });
}

export function mergeCommercialAndCost(
  commercial: NonNullable<ReturnType<typeof buildCommercialOrderLinePrice>>,
  costCalc: CalculationResult,
  quantity: number,
) {
  const costPerUnit = Number(costCalc.costPerUnit);
  const totalCost = costPerUnit * quantity;
  const profitAmount = commercial.totalSellingValue - totalCost;
  const marginPercent =
    commercial.totalSellingValue > 0 ? (profitAmount / commercial.totalSellingValue) * 100 : 0;

  return {
    fromPriceList: commercial.fromPriceList,
    basePricePerUnit: roundMoneyUah(commercial.basePricePerUnit),
    decorationPerUnit: roundMoneyUah(commercial.decorationPerUnit),
    sellingPricePerUnit: roundMoneyUah(commercial.sellingPricePerUnit),
    totalSellingValue: roundMoneyUah(commercial.totalSellingValue),
    costPerUnit: roundMoneyUah(costPerUnit),
    marginPercent,
    discountPercent: commercial.discountPercent,
  };
}

export function draftLineFromItem(
  item: OrderItemCommercialInput,
  costCalc: CalculationResult,
  discountPercent?: number | null,
) {
  const commercial = commercialPriceForOrderItem(item, { discountPercent });

  if (commercial?.fromPriceList) {
    const merged = mergeCommercialAndCost(commercial, costCalc, item.totalQuantity);
    const withOversize = applyItemOversizeSellingSurcharge(item, merged);
    const profit = withOversize.totalSellingValue - Number(costCalc.totalCost);
    const marginPercent =
      withOversize.totalSellingValue > 0
        ? (profit / withOversize.totalSellingValue) * 100
        : 0;
    return {
      ...merged,
      ...withOversize,
      marginPercent,
      fromPriceList: true as const,
      priceSource: "pricelist" as const,
    };
  }

  const sewingPerUnit = resolveSewingPerUnitFromOperations(
    (item.operations ?? []).map((row) => ({
      nameSnapshot: row.nameSnapshot,
      unitRate: row.unitRate != null ? Number(row.unitRate) : null,
    })),
  );

  const { calc, resolved } = calcWithClientPrice({
    costCalc,
    quantity: item.totalQuantity,
    product: item.product,
    sewingPerUnit,
  });

  let sellingPricePerUnit = Number(calc.sellingPricePerUnit);
  let totalSellingValue = Number(calc.totalSellingValue);
  let marginPercent = Number(calc.marginPercent);

  if (discountPercent != null && discountPercent > 0 && resolved.source !== "cost") {
    const factor = 1 - Math.min(99, discountPercent) / 100;
    totalSellingValue = roundMoneyUah(totalSellingValue * factor);
    sellingPricePerUnit =
      item.totalQuantity > 0
        ? roundMoneyUah(totalSellingValue / item.totalQuantity)
        : sellingPricePerUnit;
    const profit = totalSellingValue - Number(costCalc.totalCost);
    marginPercent = totalSellingValue > 0 ? (profit / totalSellingValue) * 100 : 0;
  }

  const decorationPerUnit =
    item.totalQuantity > 0
      ? roundMoneyUah(Number(costCalc.decorationsSubtotal) / item.totalQuantity)
      : 0;
  const basePricePerUnit = roundMoneyUah(Math.max(0, sellingPricePerUnit - decorationPerUnit));
  const withOversize = applyItemOversizeSellingSurcharge(item, {
    sellingPricePerUnit,
    totalSellingValue,
    basePricePerUnit,
    decorationPerUnit,
  });
  sellingPricePerUnit = withOversize.sellingPricePerUnit;
  totalSellingValue = withOversize.totalSellingValue;
  const profit = totalSellingValue - Number(costCalc.totalCost);
  marginPercent = totalSellingValue > 0 ? (profit / totalSellingValue) * 100 : marginPercent;

  return {
    fromPriceList: resolved.source === "pricelist",
    priceSource: resolved.source,
    basePricePerUnit,
    decorationPerUnit,
    sellingPricePerUnit: roundMoneyUah(sellingPricePerUnit),
    totalSellingValue: roundMoneyUah(totalSellingValue),
    costPerUnit: roundMoneyUah(Number(costCalc.costPerUnit)),
    marginPercent,
    discountPercent: discountPercent ?? 0,
    oversizeSurcharge: withOversize.oversizeSurcharge,
  };
}

function snapshotOversizeSurcharge(
  snapshotJson: unknown,
): DraftOversizeSurcharge | null {
  if (!snapshotJson || typeof snapshotJson !== "object") return null;
  const root = snapshotJson as {
    oversizeSurcharge?: DraftOversizeSurcharge | null;
    quote?: { oversizeSurcharge?: DraftOversizeSurcharge | null };
  };
  const raw = root.quote?.oversizeSurcharge ?? root.oversizeSurcharge;
  if (!raw || !(Number(raw.total) > 0)) return null;
  return {
    perUnit: Number(raw.perUnit) || 0,
    total: Number(raw.total) || 0,
    quantity: Number(raw.quantity) || 0,
    percent: Number(raw.percent) || 20,
    bySize: raw.bySize ?? {},
  };
}

/** Replace auto catalog prices with the unit prices saved on a proposal. */
export function overlayDraftLineFromProposal(
  item: OrderItemCommercialInput,
  costCalc: CalculationResult,
  live: ReturnType<typeof draftLineFromItem>,
  snapshotJson: unknown,
  fallback?: {
    productPerUnit: number;
    decorationPerUnit: number;
    sellingPricePerUnit: number;
    totalSellingValue: number;
    totalQuantity?: number;
  },
) {
  const quantity = Math.max(0, item.totalQuantity);
  const costPerUnit = Number(costCalc.costPerUnit);
  const storedSelling =
    fallback != null && Number.isFinite(fallback.sellingPricePerUnit)
      ? fallback.sellingPricePerUnit
      : null;

  if (storedSelling != null) {
    const savedQty =
      fallback.totalQuantity != null && fallback.totalQuantity > 0
        ? fallback.totalQuantity
        : null;
    const sellingPricePerUnit = roundMoneyUah(storedSelling);
    const totalSellingValue = roundMoneyUah(
      savedQty != null && savedQty === quantity
        ? fallback.totalSellingValue
        : sellingPricePerUnit * quantity,
    );
    const profit = totalSellingValue - costPerUnit * quantity;
    return {
      ...live,
      fromPriceList: false,
      priceSource: "proposal" as const,
      basePricePerUnit: roundMoneyUah(fallback.productPerUnit),
      decorationPerUnit: roundMoneyUah(fallback.decorationPerUnit),
      sellingPricePerUnit,
      totalSellingValue,
      marginPercent: totalSellingValue > 0 ? (profit / totalSellingValue) * 100 : 0,
      discountPercent: 0,
      oversizeSurcharge: snapshotOversizeSurcharge(snapshotJson) ?? live.oversizeSurcharge,
    };
  }

  const units = proposalClientUnitPrices(snapshotJson);
  if (!units) return live;
  const quoted = quoteClientLine({
    quantity,
    productPricePerUnit: units.productPricePerUnit,
    decorationPerUnit: units.decorationPerUnit,
    sizes: item.sizes,
    costPerUnit,
  });
  return {
    ...live,
    fromPriceList: false,
    priceSource: "proposal" as const,
    basePricePerUnit: quoted.productPricePerUnit,
    decorationPerUnit: quoted.decorationPerUnit,
    sellingPricePerUnit: quoted.sellingPricePerUnit,
    totalSellingValue: quoted.totalSellingValue,
    marginPercent: quoted.marginPercent,
    discountPercent: 0,
    oversizeSurcharge: quoted.oversizeSurcharge,
  };
}
