/**
 * Trim / hardware quotes → per-consumption-unit cost (₴/шт).
 *
 * Modes:
 * - pack: ₴/уп. ÷ шт в упаковці
 * - kg:   ($/кг × курс) ÷ шт/кг
 * - each: direct ₴/шт
 *
 * Delivery tariffs (CARGO / НП…) are always $/кг for logistics — same as fabric.
 * They are not folded into ₴/од. from the pack/kg goods quote; optional legacy
 * packDeliveryCostUah still adds a fixed ₴ per pack when set.
 */

import {
  offerDeliverySelectOptions,
  type SupplierDeliveryRates,
} from "@/lib/supplier-delivery-rates";

export type TrimPackQuote = {
  unitsPerPack?: number | string | null;
  purchasePackPrice?: number | string | null;
  packDeliveryCostUah?: number | string | null;
};

export type TrimKgQuote = {
  unitsPerKg?: number | string | null;
  priceKgUsd?: number | string | null;
  usdUahRate?: number | string | null;
};

function isPresentNumberish(value: number | string | null | undefined): boolean {
  if (value == null) return false;
  if (typeof value === "string" && value.trim() === "") return false;
  return true;
}

export function hasTrimPackQuote(quote: TrimPackQuote): boolean {
  const n = Math.floor(Number(quote.unitsPerPack) || 0);
  if (!(n > 0)) return false;
  // null / "" must NOT count as pack 0 — otherwise «ціна за м/шт» becomes 0÷уп.
  if (!isPresentNumberish(quote.purchasePackPrice)) return false;
  const pack = Number(quote.purchasePackPrice);
  return Number.isFinite(pack) && pack >= 0;
}

export function hasTrimKgQuote(quote: TrimKgQuote): boolean {
  if (!isPresentNumberish(quote.priceKgUsd)) return false;
  if (!isPresentNumberish(quote.unitsPerKg)) return false;
  const upk = Number(quote.unitsPerKg);
  const kg = Number(quote.priceKgUsd);
  const rate = Number(quote.usdUahRate);
  return upk > 0 && Number.isFinite(kg) && kg >= 0 && rate > 0;
}

/**
 * @deprecated Typed cargo/np rates are $/кг, not ₴/уп. Always returns null.
 * Use packDeliveryCostUah for fixed pack ₴, or configuredSupplierDeliveryOptions for $/кг.
 */
export function resolveTrimPackDeliveryUah(
  _rates: SupplierDeliveryRates,
): { type: string; rateUah: number } | null {
  return null;
}

/** грн/шт = ($/кг × курс) / (шт у 1 кг) */
export function unitPriceFromKgUsd(
  priceKgUsd: number | null | undefined,
  unitsPerKg: number | null | undefined,
  usdUahRate: number,
): number | null {
  const kg = Number(priceKgUsd);
  const upk = Number(unitsPerKg);
  if (!(Number.isFinite(kg) && kg >= 0) || !(upk > 0) || !(usdUahRate > 0)) return null;
  return Math.round(((kg * usdUahRate) / upk) * 10000) / 10000;
}

/** Active calc price ₴ / consumption unit from pack quote. */
export function deriveUnitPriceFromPack(
  quote: TrimPackQuote,
  fallbackUnitPrice = 0,
): number {
  if (!hasTrimPackQuote(quote)) {
    const fallback = Number(fallbackUnitPrice);
    return Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
  }
  const n = Math.floor(Number(quote.unitsPerPack));
  const pack = Number(quote.purchasePackPrice);
  const delivery = Math.max(0, Number(quote.packDeliveryCostUah) || 0);
  return Math.round(((pack + delivery) / n) * 10000) / 10000;
}

/**
 * Derive ₴/од. priority: $/кг+шт/кг → упаковка (+фікс) → пряма ціна (+фікс).
 */
export function deriveTrimUnitPriceFromSupplier(args: {
  unitsPerPack?: number | null;
  purchasePackPrice?: number | null;
  deliveryRates?: SupplierDeliveryRates;
  /** Legacy / fixed pack-delivery field (₴). */
  packDeliveryCostUah?: number | null;
  unitsPerKg?: number | null;
  priceKgUsd?: number | null;
  usdUahRate?: number | null;
  fallbackUnitPrice?: number;
}): number {
  void args.deliveryRates;
  const fromKg = unitPriceFromKgUsd(
    args.priceKgUsd,
    args.unitsPerKg,
    Number(args.usdUahRate) || 0,
  );
  const fixed = Math.max(0, Number(args.packDeliveryCostUah) || 0);
  if (fromKg != null) {
    const n = Math.floor(Number(args.unitsPerPack) || 0);
    if (fixed > 0 && n > 0) {
      return Math.round((fromKg + fixed / n) * 10000) / 10000;
    }
    return fromKg;
  }
  if (
    hasTrimPackQuote({
      unitsPerPack: args.unitsPerPack,
      purchasePackPrice: args.purchasePackPrice,
      packDeliveryCostUah: args.packDeliveryCostUah,
    })
  ) {
    return deriveUnitPriceFromPack({
      unitsPerPack: args.unitsPerPack,
      purchasePackPrice: args.purchasePackPrice,
      packDeliveryCostUah: args.packDeliveryCostUah,
    });
  }
  const fallback = Number(args.fallbackUnitPrice);
  const base = Number.isFinite(fallback) && fallback >= 0 ? fallback : 0;
  const n = Math.floor(Number(args.unitsPerPack) || 0);
  if (fixed > 0 && n > 0) {
    return Math.round((base + fixed / n) * 10000) / 10000;
  }
  if (fixed > 0) {
    return Math.round((base + fixed) * 10000) / 10000;
  }
  return base;
}

/** Configured $/кг and pack-fixed delivery options on a trim/unit supplier offer. */
export function trimConfiguredDeliveryOptions(
  rates: SupplierDeliveryRates & { packDeliveryCostUah?: number | null },
) {
  return offerDeliverySelectOptions({
    cargoUsdPerKg: rates.cargoUsdPerKg,
    npStandardUsdPerKg: rates.npStandardUsdPerKg,
    npVolumeUsdPerKg: rates.npVolumeUsdPerKg,
    packDeliveryCostUah: rates.packDeliveryCostUah,
  }).map((opt) => ({
    type: opt.type,
    rateUsdPerKg: opt.rateUsdPerKg ?? 0,
    /** @deprecated use rateUsdPerKg — kept for older call sites. */
    rateUah: opt.rateUsdPerKg ?? 0,
    rateLabel: opt.rateLabel,
    label: opt.label,
  }));
}

/** Whole packs to buy for a production need (ceil). */
export function packsToOrder(unitsNeeded: number, unitsPerPack: number | null | undefined): number {
  const n = Math.floor(Number(unitsPerPack) || 0);
  const need = Number(unitsNeeded);
  if (!(n > 0) || !(need > 0) || !Number.isFinite(need)) return 0;
  return Math.ceil(need / n);
}

/** Kg to buy for a production need when quoted by weight. */
export function kgToOrder(unitsNeeded: number, unitsPerKg: number | null | undefined): number {
  const upk = Number(unitsPerKg);
  const need = Number(unitsNeeded);
  if (!(upk > 0) || !(need > 0) || !Number.isFinite(need)) return 0;
  return Math.round((need / upk) * 10000) / 10000;
}

export function trimPackSpend(args: {
  packs: number;
  purchasePackPrice?: number | null;
  packDeliveryCostUah?: number | null;
}) {
  const packs = Math.max(0, Math.floor(args.packs) || 0);
  const goods = Math.max(0, Number(args.purchasePackPrice) || 0) * packs;
  const delivery = Math.max(0, Number(args.packDeliveryCostUah) || 0) * packs;
  return {
    goods: Math.round(goods * 100) / 100,
    delivery: Math.round(delivery * 100) / 100,
    total: Math.round((goods + delivery) * 100) / 100,
  };
}
