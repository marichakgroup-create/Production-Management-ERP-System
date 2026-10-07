import {
  DEFAULT_FABRIC_DELIVERY_RATES,
  type FabricDeliveryRateGlobals,
} from "@/lib/fabric-delivery-types";
import { isOversizeCode } from "@/lib/size-coeffs";

export type MaterialCostVatMode = "NET" | "GROSS";

export type FabricPricingGlobals = FabricDeliveryRateGlobals & {
  usdUahRate: number;
  materialCostVatMode: MaterialCostVatMode;
};

export const DEFAULT_FABRIC_PRICING_GLOBALS: FabricPricingGlobals = {
  usdUahRate: 45,
  fabricCargoUsdPerKg: DEFAULT_FABRIC_DELIVERY_RATES.CARGO,
  npStandardUsdPerKg: DEFAULT_FABRIC_DELIVERY_RATES.NP_STANDARD,
  npVolumeUsdPerKg: DEFAULT_FABRIC_DELIVERY_RATES.NP_VOLUME,
  materialCostVatMode: "NET",
};

export type FabricPriceInputs = {
  metersPerKg?: number | null;
  priceKgUsd?: number | null;
  priceKgUsdCargo?: number | null;
  priceKgUsdVat?: number | null;
  priceMeterUahNoVat?: number | null;
  priceMeterUahVat?: number | null;
  priceMeterUahCutVat?: number | null;
  rollWeightKg?: number | null;
  metersPerRoll?: number | null;
  minWholesaleMeters?: number | null;
  costVatOverride?: MaterialCostVatMode | null;
};

export type FabricPricingMode = "cut" | "wholesale" | "standard";

export type FabricPriceDerived = {
  priceKgUsdCargo: number | null;
  priceMeterUahNoVat: number | null;
  priceMeterUahVat: number | null;
  /** Cargo component in ₴/m when derived from $/kg (null when unknown). */
  deliveryPerMeterUah: number | null;
  metersPerRoll: number | null;
  minWholesaleMeters: number | null;
  /** Material COGS only — without delivery/cargo. */
  purchasePrice: number;
  wholesalePurchasePrice: number;
  cutPurchasePrice: number | null;
  pricingMode: FabricPricingMode;
  costMode: MaterialCostVatMode;
};

function num(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(value) || value < 0) return null;
  return value;
}

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function round4(value: number) {
  return Math.round(value * 10000) / 10000;
}

/** Cargo is an additive $/kg surcharge from the CRM sheet (not a multiplier). */
export function priceKgWithCargo(priceKgUsd: number | null | undefined, cargoUsdPerKg: number) {
  const base = num(priceKgUsd);
  if (base == null) return null;
  return round4(base + cargoUsdPerKg);
}

/** грн/м.п. = ($/кг × курс) / (м.п. у 1 кг) */
export function meterPriceFromKgUsd(
  priceKgUsd: number | null | undefined,
  metersPerKg: number | null | undefined,
  usdUahRate: number,
) {
  const kg = num(priceKgUsd);
  const mpk = num(metersPerKg);
  if (kg == null || mpk == null || mpk <= 0 || usdUahRate <= 0) return null;
  return round1((kg * usdUahRate) / mpk);
}

/** грн/м.п. = (₴/кг) / (м.п. у 1 кг) */
export function meterPriceFromKgUah(
  priceKgUah: number | null | undefined,
  metersPerKg: number | null | undefined,
) {
  const kg = num(priceKgUah);
  const mpk = num(metersPerKg);
  if (kg == null || mpk == null || mpk <= 0) return null;
  return round1(kg / mpk);
}

/** грн/м.п. = $/м × курс */
export function meterPriceFromMeterUsd(
  priceMeterUsd: number | null | undefined,
  usdUahRate: number,
) {
  const meter = num(priceMeterUsd);
  if (meter == null || usdUahRate <= 0) return null;
  return round1(meter * usdUahRate);
}

export type FabricQuoteCurrency = "uah" | "usd";
export type FabricQuoteUnit = "meter" | "kg";

/** Convert supplier list price → ₴/м.п. (без доставки). */
export function meterUahFromSupplierQuote(args: {
  currency: FabricQuoteCurrency;
  unit: FabricQuoteUnit;
  quote: number | null | undefined;
  metersPerKg?: number | null;
  usdUahRate: number;
}): number | null {
  const quote = num(args.quote);
  if (quote == null) return null;
  if (args.currency === "uah" && args.unit === "meter") return round1(quote);
  if (args.currency === "usd" && args.unit === "meter") {
    return meterPriceFromMeterUsd(quote, args.usdUahRate);
  }
  if (args.currency === "usd" && args.unit === "kg") {
    return meterPriceFromKgUsd(quote, args.metersPerKg, args.usdUahRate);
  }
  return meterPriceFromKgUah(quote, args.metersPerKg);
}

/** Reverse: ₴/м.п. → quote in supplier currency/unit (for display). */
export function supplierQuoteFromMeterUah(args: {
  currency: FabricQuoteCurrency;
  unit: FabricQuoteUnit;
  meterUah: number | null | undefined;
  metersPerKg?: number | null;
  usdUahRate: number;
}): number | null {
  const meter = num(args.meterUah);
  if (meter == null) return null;
  if (args.currency === "uah" && args.unit === "meter") return round1(meter);
  if (args.currency === "usd" && args.unit === "meter") {
    if (args.usdUahRate <= 0) return null;
    return round4(meter / args.usdUahRate);
  }
  const mpk = num(args.metersPerKg);
  if (mpk == null || mpk <= 0) return null;
  if (args.currency === "usd" && args.unit === "kg") {
    if (args.usdUahRate <= 0) return null;
    return round4((meter * mpk) / args.usdUahRate);
  }
  return round1(meter * mpk);
}

export function fabricQuoteSuffix(
  currency: FabricQuoteCurrency,
  unit: FabricQuoteUnit,
): string {
  if (currency === "usd" && unit === "kg") return "$/кг";
  if (currency === "usd" && unit === "meter") return "$/м";
  if (currency === "uah" && unit === "kg") return "₴/кг";
  return "₴/м";
}

export function metersPerRollFromWeight(
  rollWeightKg: number | null | undefined,
  metersPerKg: number | null | undefined,
) {
  const weight = num(rollWeightKg);
  const mpk = num(metersPerKg);
  if (weight == null || mpk == null) return null;
  return round1(weight * mpk);
}

/** First positive number in free-text catalog fields (e.g. "170 г/м²", "180 см"). */
export function parsePositiveMeasure(value: string | number | null | undefined): number | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") return num(value) != null && value > 0 ? value : null;
  const match = String(value).replace(",", ".").match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

/**
 * Classic textile conversion: м.п. in 1 kg = 100_000 / (gsm × width_cm).
 * gsm = г/м², width in cm.
 */
export function metersPerKgFromDensityWidth(
  densityGsm: string | number | null | undefined,
  widthCm: string | number | null | undefined,
): number | null {
  const gsm = parsePositiveMeasure(densityGsm);
  const width = parsePositiveMeasure(widthCm);
  if (gsm == null || width == null) return null;
  return round1(100_000 / (gsm * width));
}

/** ₴/м.п. = ₴/м² × ширина(м) = ₴/м² × (ширина_см / 100). */
export function linearMeterPriceFromSquareMeter(
  pricePerM2: number | null | undefined,
  widthCm: string | number | null | undefined,
): number | null {
  const price = num(pricePerM2);
  const width = parsePositiveMeasure(widthCm);
  if (price == null || width == null) return null;
  return round1(price * (width / 100));
}

/** Reverse of linearMeterPriceFromSquareMeter. */
export function squareMeterPriceFromLinearMeter(
  pricePerMeter: number | null | undefined,
  widthCm: string | number | null | undefined,
): number | null {
  const price = num(pricePerMeter);
  const width = parsePositiveMeasure(widthCm);
  if (price == null || width == null || width <= 0) return null;
  return round1(price / (width / 100));
}

/** Purchase / BOM unit mode for fabric catalog forms. */
export type FabricUnitMode = "m" | "kg" | "m2" | "pcs" | "cone";

export function resolveFabricUnitMode(code: string | null | undefined): FabricUnitMode {
  const normalized = (code ?? "").trim().toLowerCase();
  if (normalized === "kg") return "kg";
  if (normalized === "m2" || normalized === "m²") return "m2";
  if (normalized === "pcs" || normalized === "шт") return "pcs";
  if (normalized === "cone" || normalized === "бобіна") return "cone";
  return "m";
}

export function resolveCostMode(
  companyMode: MaterialCostVatMode,
  override?: MaterialCostVatMode | null,
): MaterialCostVatMode {
  return override ?? companyMode;
}

/**
 * Active COGS price in ₴ / unit (м.п. for fabrics).
 * NET prefers without-VAT; GROSS prefers with-VAT; each falls back to the other.
 */
export function resolveMaterialCostPrice(input: {
  mode: MaterialCostVatMode;
  priceMeterUahNoVat?: number | null;
  priceMeterUahVat?: number | null;
  fallbackPurchasePrice?: number | null;
}): number {
  const noVat = num(input.priceMeterUahNoVat);
  const vat = num(input.priceMeterUahVat);
  const fallback = num(input.fallbackPurchasePrice) ?? 0;
  if (input.mode === "NET") return noVat ?? vat ?? fallback;
  return vat ?? noVat ?? fallback;
}

/** Cargo $/kg to apply: explicit cargo price delta, else company default. */
export function resolveCargoUsdPerKg(
  inputs: Pick<FabricPriceInputs, "priceKgUsd" | "priceKgUsdCargo">,
  globals: FabricPricingGlobals,
): number {
  const base = num(inputs.priceKgUsd);
  const withCargo = num(inputs.priceKgUsdCargo);
  if (base != null && withCargo != null && withCargo >= base) {
    return round4(withCargo - base);
  }
  return globals.fabricCargoUsdPerKg;
}

export function resolveMinWholesaleMeters(input: {
  minWholesaleMeters?: number | null;
  metersPerRoll?: number | null;
}): number | null {
  return num(input.minWholesaleMeters) ?? num(input.metersPerRoll);
}

/**
 * Pick retail (cut) vs base price for an order line by fabric meters needed.
 * Below threshold → retail (priceMeterUahCutVat); at/above → base (priceMeterUahNoVat).
 * Catalog / base model should use resolveCatalogPurchasePrice (always conservative).
 */
export function resolveOrderFabricPurchasePrice(input: {
  metersNeeded: number;
  wholesalePurchasePrice: number;
  cutPurchasePrice?: number | null;
  minWholesaleMeters?: number | null;
}): { purchasePrice: number; pricingMode: FabricPricingMode } {
  const retail = num(input.cutPurchasePrice);
  const minM = num(input.minWholesaleMeters);
  const base = input.wholesalePurchasePrice;

  // Single ₴/m price = базова; роздріб only exists when cut vs base differ.
  if (retail == null || retail <= 0) {
    return {
      purchasePrice: base > 0 ? base : 0,
      pricingMode: "standard",
    };
  }

  const atBaseVolume =
    minM != null && minM > 0 && Number.isFinite(input.metersNeeded) && input.metersNeeded >= minM;

  if (atBaseVolume) {
    return { purchasePrice: base > 0 ? base : retail, pricingMode: "wholesale" };
  }

  return { purchasePrice: retail, pricingMode: "cut" };
}

/** Derive cargo / meter / roll prices and the purchasePrice used by the calc engine. */
export function deriveFabricPricing(
  inputs: FabricPriceInputs,
  globals: FabricPricingGlobals,
): FabricPriceDerived {
  const metersPerKg = num(inputs.metersPerKg);
  const priceKgUsd = num(inputs.priceKgUsd);
  const cargoPerKg = resolveCargoUsdPerKg(inputs, globals);

  const priceKgUsdCargo =
    num(inputs.priceKgUsdCargo) ?? priceKgWithCargo(priceKgUsd, cargoPerKg);

  const explicitMeterNoVat = num(inputs.priceMeterUahNoVat);
  const explicitMeterVat = num(inputs.priceMeterUahVat);

  // Material COGS: base $/kg (and explicit ₴/m) without cargo.
  const priceMeterUahNoVat =
    explicitMeterNoVat ??
    meterPriceFromKgUsd(priceKgUsd, metersPerKg, globals.usdUahRate);

  const priceMeterUahVat =
    explicitMeterVat ??
    meterPriceFromKgUsd(num(inputs.priceKgUsdVat), metersPerKg, globals.usdUahRate);

  const priceMeterUahNoVatWithCargo = meterPriceFromKgUsd(
    priceKgUsdCargo,
    metersPerKg,
    globals.usdUahRate,
  );

  const deliveryPerMeterUah =
    explicitMeterNoVat != null || priceKgUsd == null || metersPerKg == null
      ? null
      : priceMeterUahNoVatWithCargo != null && priceMeterUahNoVat != null
        ? round1(Math.max(0, priceMeterUahNoVatWithCargo - priceMeterUahNoVat))
        : null;

  const metersPerRoll =
    num(inputs.metersPerRoll) ??
    metersPerRollFromWeight(inputs.rollWeightKg, metersPerKg);

  const minWholesaleMeters = resolveMinWholesaleMeters({
    minWholesaleMeters: inputs.minWholesaleMeters,
    metersPerRoll,
  });

  const costMode = resolveCostMode(globals.materialCostVatMode, inputs.costVatOverride);
  const wholesalePurchasePrice = resolveMaterialCostPrice({
    mode: costMode,
    priceMeterUahNoVat,
    priceMeterUahVat,
  });

  const cutPurchasePrice = num(inputs.priceMeterUahCutVat);

  // Catalog / base model: conservative retail when present; else базова.
  let purchasePrice = wholesalePurchasePrice;
  let pricingMode: FabricPricingMode = "standard";
  if (cutPurchasePrice != null && cutPurchasePrice > 0) {
    purchasePrice = cutPurchasePrice;
    pricingMode = "cut";
  }

  return {
    priceKgUsdCargo,
    priceMeterUahNoVat,
    priceMeterUahVat,
    deliveryPerMeterUah,
    metersPerRoll,
    minWholesaleMeters,
    purchasePrice,
    wholesalePurchasePrice,
    cutPurchasePrice,
    pricingMode,
    costMode,
  };
}

/** Meters of fabric needed for a BOM line across size quantities. */
export function fabricMetersNeeded(input: {
  consumptionPerUnit: number;
  wastePercent: number;
  quantitiesBySize: Record<string, number>;
  sizeCode?: string | null;
  sizeConsumption?: Record<string, number> | null;
  sizeWaste?: Record<string, number> | null;
  /**
   * Per-size material coeffs (3XL+). Skipped when the line is already an oversize-only
   * row (coeff baked into consumption) or the size has an explicit sizeConsumption norm.
   */
  sizeMaterialCoeffs?: Record<string, number> | null;
  /** When false, never apply sizeMaterialCoeffs (default true). */
  applySizeCoeff?: boolean;
}): number {
  const baseWaste = 1 + (input.wastePercent || 0) / 100;
  // Oversize-specific rows already carry absolute / baked norms — don't uplift again.
  const lineAllowsCoeff =
    input.applySizeCoeff !== false && !isOversizeCode(input.sizeCode);
  let total = 0;
  for (const [code, qty] of Object.entries(input.quantitiesBySize)) {
    if (qty <= 0) continue;
    if (input.sizeCode && input.sizeCode !== code) continue;
    const hasExplicitNorm = input.sizeConsumption?.[code] != null;
    const consumption =
      input.sizeConsumption?.[code] ?? input.consumptionPerUnit;
    const waste =
      input.sizeWaste?.[code] != null
        ? 1 + (Number(input.sizeWaste[code]) || 0) / 100
        : baseWaste;
    const coeff =
      lineAllowsCoeff && !hasExplicitNorm
        ? (input.sizeMaterialCoeffs?.[code] ?? 1)
        : 1;
    total += consumption * waste * qty * coeff;
  }
  return total;
}

export function fabricPricingModeLabel(mode: FabricPricingMode): string {
  switch (mode) {
    case "cut":
      return "роздріб";
    case "wholesale":
      return "ціна";
    default:
      return "ціна";
  }
}

/** Resolve snapshot purchase price for an order material line from catalog fabric fields. */
export function resolveMaterialLinePurchasePrice(input: {
  type?: string | null;
  purchasePrice: number;
  priceMeterUahNoVat?: number | null;
  priceMeterUahVat?: number | null;
  priceMeterUahCutVat?: number | null;
  metersPerRoll?: number | null;
  minWholesaleMeters?: number | null;
  costVatOverride?: MaterialCostVatMode | null;
  companyCostMode: MaterialCostVatMode;
  /** When null/undefined → catalog conservative (cut preferred). */
  metersNeeded?: number | null;
}): { purchasePrice: number; pricingMode: FabricPricingMode; wholesalePurchasePrice: number; cutPurchasePrice: number | null } {
  const catalogPrice = num(input.purchasePrice) ?? 0;
  const costMode = resolveCostMode(input.companyCostMode, input.costVatOverride);
  // Тканина й фурнітура: одна логіка «ціна / ціна+роздріб».
  // Межа порівнюється з витратою в од. виміру матеріалу (м, шт, кг…).
  const wholesalePurchasePrice = resolveMaterialCostPrice({
    mode: costMode,
    priceMeterUahNoVat: input.priceMeterUahNoVat,
    priceMeterUahVat: input.priceMeterUahVat,
    fallbackPurchasePrice: catalogPrice,
  });
  const cutPurchasePrice = num(input.priceMeterUahCutVat);
  const minWholesaleMeters = resolveMinWholesaleMeters({
    minWholesaleMeters: input.minWholesaleMeters,
    metersPerRoll: input.type === "FABRIC" ? input.metersPerRoll : null,
  });
  const basePrice = wholesalePurchasePrice > 0 ? wholesalePurchasePrice : catalogPrice;

  if (input.metersNeeded == null) {
    // Catalog / base model path
    if (cutPurchasePrice != null && cutPurchasePrice > 0) {
      return {
        purchasePrice: cutPurchasePrice,
        pricingMode: "cut",
        wholesalePurchasePrice: basePrice,
        cutPurchasePrice,
      };
    }
    return {
      purchasePrice: basePrice,
      pricingMode: "standard",
      wholesalePurchasePrice: basePrice,
      cutPurchasePrice,
    };
  }

  const resolved = resolveOrderFabricPurchasePrice({
    metersNeeded: input.metersNeeded,
    wholesalePurchasePrice: basePrice,
    cutPurchasePrice,
    minWholesaleMeters,
  });

  return {
    purchasePrice: resolved.purchasePrice,
    pricingMode: resolved.pricingMode,
    wholesalePurchasePrice: basePrice,
    cutPurchasePrice,
  };
}
