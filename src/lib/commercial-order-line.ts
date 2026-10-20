import {
  resolveCommercialPricePerUnit,
  type CommercialPriceTier,
} from "@/lib/commercial-price";
import { roundMoneyUah } from "@/lib/utils";

export type OrderLineDecoration = {
  setupCost: number;
  unitRate: number;
};

export type CommercialOrderLinePrice = {
  fromPriceList: boolean;
  basePricePerUnit: number;
  decorationPerUnit: number;
  decorationTotal: number;
  sellingPricePerUnit: number;
  totalSellingValue: number;
  discountPercent: number;
  discountAmount: number;
};

function roundMoney(value: number): number {
  return roundMoneyUah(value);
}

/** Client price = price-list base + branding; discount optional on line total. */
export function buildCommercialOrderLinePrice(args: {
  quantity: number;
  priceTiers: CommercialPriceTier[];
  decorations: OrderLineDecoration[];
  discountPercent?: number | null;
  fallbackPricePerUnit?: number | null;
}): CommercialOrderLinePrice | null {
  const quantity = Math.max(0, Math.floor(args.quantity));
  if (quantity <= 0) return null;

  const baseFromList = resolveCommercialPricePerUnit({
    quantity,
    tiers: args.priceTiers,
    fallbackPrice: args.fallbackPricePerUnit ?? null,
  });

  if (baseFromList == null && args.fallbackPricePerUnit == null) return null;

  const basePricePerUnit = baseFromList ?? args.fallbackPricePerUnit ?? 0;
  const fromPriceList = args.priceTiers.length > 0 && baseFromList != null;

  let decorationTotal = 0;
  for (const row of args.decorations) {
    decorationTotal += Number(row.setupCost) + Number(row.unitRate) * quantity;
  }
  const decorationPerUnit = decorationTotal / quantity;

  const subtotalPerUnit = basePricePerUnit + decorationPerUnit;
  const subtotal = subtotalPerUnit * quantity;

  const discountPercent =
    args.discountPercent != null && Number.isFinite(args.discountPercent)
      ? Math.max(0, Math.min(99, args.discountPercent))
      : 0;
  const discountAmount = roundMoney(subtotal * (discountPercent / 100));
  const totalSellingValue = roundMoney(subtotal - discountAmount);
  const sellingPricePerUnit = roundMoney(totalSellingValue / quantity);

  return {
    fromPriceList,
    basePricePerUnit: roundMoney(basePricePerUnit),
    decorationPerUnit: roundMoney(decorationPerUnit),
    decorationTotal: roundMoney(decorationTotal),
    sellingPricePerUnit,
    totalSellingValue,
    discountPercent,
    discountAmount,
  };
}
