import { isOversizeCode } from "@/lib/size-coeffs";
import { formatMoneyUah, roundMoneyUah } from "@/lib/utils";

/** Client product price uplift for 3XL–6XL only (not decorations / extras). */
export const OVERSIZE_CLIENT_SURCHARGE_PERCENT = 20;

export function oversizeQuantity(
  sizes: Array<{ sizeCode: string; quantity: number }>,
) {
  return sizes.reduce((sum, size) => {
    if (size.quantity <= 0 || !isOversizeCode(size.sizeCode)) return sum;
    return sum + size.quantity;
  }, 0);
}

/** Extra ₴/од. = 20% of the client product price (без нанесення). */
export function oversizeClientExtraPerUnit(productPricePerUnit: number): number {
  if (!(productPricePerUnit > 0)) return 0;
  return roundMoneyUah(
    productPricePerUnit * (OVERSIZE_CLIENT_SURCHARGE_PERCENT / 100),
  );
}

export function oversizeSurchargeBySize(input: {
  sizes: Array<{ sizeCode: string; quantity: number }>;
  productPricePerUnit: number;
}): Record<string, number> {
  const extra = oversizeClientExtraPerUnit(input.productPricePerUnit);
  if (!(extra > 0)) return {};
  const out: Record<string, number> = {};
  for (const size of input.sizes) {
    if (size.quantity <= 0) continue;
    if (!isOversizeCode(size.sizeCode)) continue;
    out[size.sizeCode] = extra;
  }
  return out;
}

export function oversizeSurchargeTotals(input: {
  sizes: Array<{ sizeCode: string; quantity: number }>;
  productPricePerUnit: number;
}) {
  const bySize = oversizeSurchargeBySize(input);
  const quantity = oversizeQuantity(input.sizes);
  const perUnit = oversizeClientExtraPerUnit(input.productPricePerUnit);
  return {
    bySize,
    quantity,
    perUnit,
    percent: OVERSIZE_CLIENT_SURCHARGE_PERCENT,
    total: roundMoneyUah(perUnit * quantity),
  };
}

/** КП / UI: «(+20% · +20,0 ₴ за великий розмір)». */
export function oversizeSurchargeComment(amount: number): string | null {
  if (!(amount > 0.05)) return null;
  return `(+${OVERSIZE_CLIENT_SURCHARGE_PERCENT}% · +${formatMoneyUah(amount)} за великий розмір)`;
}

export function applyOversizeSellingSurcharge(input: {
  sellingPricePerUnit: number;
  totalSellingValue: number;
  quantity: number;
  productPricePerUnit: number;
  sizes: Array<{ sizeCode: string; quantity: number }>;
}) {
  const surcharge = oversizeSurchargeTotals({
    sizes: input.sizes,
    productPricePerUnit: input.productPricePerUnit,
  });
  if (!(surcharge.total > 0) || input.quantity <= 0) {
    return {
      sellingPricePerUnit: roundMoneyUah(input.sellingPricePerUnit),
      totalSellingValue: roundMoneyUah(input.totalSellingValue),
      surcharge,
    };
  }
  const totalSellingValue = roundMoneyUah(input.totalSellingValue + surcharge.total);
  return {
    sellingPricePerUnit: roundMoneyUah(totalSellingValue / input.quantity),
    totalSellingValue,
    surcharge,
  };
}
