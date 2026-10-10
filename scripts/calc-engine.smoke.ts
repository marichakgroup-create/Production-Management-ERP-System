import assert from "node:assert/strict";
import { config as loadEnv } from "dotenv";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

import { calculateCosting } from "../src/server/domains/calculation/engine";

const result = calculateCosting({
  sizes: [
    { sizeCode: "M", quantity: 50, materialCoeff: 1, operationCoeff: 1 },
    { sizeCode: "L", quantity: 50, materialCoeff: 1.05, operationCoeff: 1.02 },
  ],
  materials: [
    {
      id: "fabric",
      consumptionPerUnit: 1.2,
      wastePercent: 5,
      purchasePrice: 200,
      applySizeCoeff: true,
    },
  ],
  operations: [
    {
      id: "sew",
      method: "UNIT_RATE",
      unitRate: 80,
      applySizeCoeff: true,
    },
  ],
  decorations: [
    {
      id: "print",
      setupCost: 500,
      unitRate: 25,
    },
  ],
  additionalCosts: [
    {
      id: "pack",
      amount: 10,
      isPerUnit: true,
    },
  ],
  pricingMethod: "MARGIN",
  targetRatePercent: 30,
});

assert.equal(result.totalQuantity, 100);
assert.ok(Number(result.totalCost) > 0);
assert.ok(Number(result.sellingPricePerUnit) > Number(result.costPerUnit));
assert.ok(Number(result.marginPercent) > 0);

console.log("calculation engine smoke test passed");
console.log(result);

const sized = calculateCosting({
  sizes: [
    { sizeCode: "S", quantity: 10 },
    { sizeCode: "XL", quantity: 10 },
  ],
  materials: [
    {
      id: "shared",
      groupKey: "fabric",
      consumptionPerUnit: 1,
      wastePercent: 0,
      purchasePrice: 100,
    },
    {
      id: "xl-only",
      groupKey: "fabric",
      sizeCode: "XL",
      consumptionPerUnit: 1.5,
      wastePercent: 0,
      purchasePrice: 100,
    },
  ],
  operations: [],
  decorations: [],
  additionalCosts: [],
  pricingMethod: "MARGIN",
  targetRatePercent: 0,
});

// S uses shared 1×10×100 = 1000; XL uses specific 1.5×10×100 = 1500; total 2500
assert.equal(sized.totalQuantity, 20);
assert.equal(sized.materialsSubtotal, "2500.00");

console.log("size-scoped material smoke test passed");

import { resolveCutRatePerUnit } from "../src/lib/cut-rate";

const cutTiers = [
  { minQuantity: 10, ratePerUnit: 120 },
  { minQuantity: 50, ratePerUnit: 24 },
  { minQuantity: 100, ratePerUnit: 12 },
  { minQuantity: 250, ratePerUnit: 5 },
];
assert.equal(resolveCutRatePerUnit({ quantity: 10, optimalQty: 250, tiers: cutTiers, fallbackRate: 5 }), 120);
assert.equal(resolveCutRatePerUnit({ quantity: 40, optimalQty: 250, tiers: cutTiers, fallbackRate: 5 }), 120);
assert.equal(resolveCutRatePerUnit({ quantity: 50, optimalQty: 250, tiers: cutTiers, fallbackRate: 5 }), 24);
assert.equal(resolveCutRatePerUnit({ quantity: 250, optimalQty: 250, tiers: cutTiers, fallbackRate: 5 }), 5);
assert.equal(resolveCutRatePerUnit({ quantity: 1000, optimalQty: 250, tiers: cutTiers, fallbackRate: 5 }), 5);

import { cutRateFromOptimalJobTotal } from "../src/lib/cut-rate";
assert.equal(cutRateFromOptimalJobTotal(1500, 100, 250), 15);
assert.equal(cutRateFromOptimalJobTotal(1500, 250, 250), 6);
assert.equal(cutRateFromOptimalJobTotal(1500, 500, 250), 6);
assert.equal(cutRateFromOptimalJobTotal(1500, 1000, 250), 6);
console.log("cut-rate owner rule smoke test passed");

import { buildCalcFromOrderItem } from "../src/server/domains/calculation/from-entities";

const orderItemStub = {
  sizes: [{ sizeCode: "M", quantity: 50 }],
  materials: [],
  operations: [
    {
      id: "op-cut",
      nameSnapshot: "Розкрій",
      calculationMethod: "UNIT_RATE" as const,
      unitRate: 5,
      shiftCost: null,
      standardOutput: null,
    },
  ],
  decorations: [],
  additionalCosts: [],
};

const cutContext = {
  optimalQty: 250,
  tiers: cutTiers,
};

const smallRun = buildCalcFromOrderItem(
  orderItemStub,
  { pricingMethod: "MARGIN", targetRatePercent: 30 },
  { cutRate: cutContext },
);
assert.equal(Number(smallRun.operationsSubtotal), 24 * 50);

const largeRun = buildCalcFromOrderItem(
  { ...orderItemStub, sizes: [{ sizeCode: "M", quantity: 500 }] },
  { pricingMethod: "MARGIN", targetRatePercent: 30 },
  { cutRate: cutContext },
);
assert.equal(Number(largeRun.operationsSubtotal), 5 * 500);
console.log("order-item cut-rate sync smoke test passed");

import { resolveCommercialPricePerUnit } from "../src/lib/commercial-price";
import { buildCommercialOrderLinePrice } from "../src/lib/commercial-order-line";

const priceTiers = [
  { minQuantity: 30, pricePerUnit: 420 },
  { minQuantity: 60, pricePerUnit: 380 },
  { minQuantity: 100, pricePerUnit: 350 },
];
assert.equal(resolveCommercialPricePerUnit({ quantity: 40, tiers: priceTiers }), 420);
assert.equal(resolveCommercialPricePerUnit({ quantity: 80, tiers: priceTiers }), 380);
const withDeco = buildCommercialOrderLinePrice({
  quantity: 40,
  priceTiers,
  decorations: [{ setupCost: 500, unitRate: 15 }],
  discountPercent: 5,
});
assert.ok(withDeco);
assert.equal(withDeco!.basePricePerUnit, 420);
assert.ok(withDeco!.sellingPricePerUnit > 420);
console.log("commercial price list smoke test passed");

import { draftLineFromItem } from "../src/lib/order-item-commercial";
import type { CalculationResult } from "../src/server/domains/calculation/engine";

const costCalcStub = {
  costPerUnit: "350.54",
  totalCost: "35053.93",
  sellingPricePerUnit: "500.77",
  totalSellingValue: "50077.00",
  marginPercent: "30.00",
  profitAmount: "15023.07",
  materialsSubtotal: "23389.73",
  operationsSubtotal: "4600.00",
  decorationsSubtotal: "4000.00",
  additionalCostsSubtotal: "3064.20",
} as CalculationResult;

const decoItem = {
  totalQuantity: 100,
  decorations: [{ setupCost: 500, unitRate: 35 }],
  product: {
    isBaseModel: true as boolean,
    commercialPriceTiers: [] as Array<{ minQuantity: number; pricePerUnit: number }>,
  },
};

const noPriceListDraft = draftLineFromItem(decoItem, costCalcStub);
assert.equal(noPriceListDraft.fromPriceList, false);
assert.equal(noPriceListDraft.priceSource, "cost");
assert.equal(noPriceListDraft.sellingPricePerUnit, 350.54);
assert.equal(noPriceListDraft.totalSellingValue, 35054);

const sewingMarkupDraft = draftLineFromItem(
  {
    ...decoItem,
    operations: [{ nameSnapshot: "Пошив", unitRate: 40, calculationMethod: "UNIT_RATE" }],
  },
  costCalcStub,
);
assert.equal(sewingMarkupDraft.fromPriceList, false);
assert.equal(sewingMarkupDraft.priceSource, "sewing_markup");
assert.ok(sewingMarkupDraft.sellingPricePerUnit > 350.54);

const priceListDraft = draftLineFromItem(
  {
    ...decoItem,
    product: {
      isBaseModel: true,
      commercialPriceTiers: [{ minQuantity: 30, pricePerUnit: 350 }],
    },
  },
  costCalcStub,
);
assert.equal(priceListDraft.fromPriceList, true);
assert.equal(priceListDraft.totalSellingValue, 39000);
assert.equal(priceListDraft.sellingPricePerUnit, 390);
console.log("commercial draft line smoke test passed");

import {
  deriveFabricPricing,
  meterPriceFromKgUsd,
  resolveOrderFabricPurchasePrice,
  resolveMaterialLinePurchasePrice,
} from "../src/lib/fabric-pricing";

const fabricGlobals = {
  usdUahRate: 45,
  fabricCargoUsdPerKg: 1.7,
  npStandardUsdPerKg: 0.4,
  npVolumeUsdPerKg: 0.8,
  materialCostVatMode: "NET" as const,
};

const withCargo = deriveFabricPricing(
  {
    metersPerKg: 2.5,
    priceKgUsd: 10,
  },
  fabricGlobals,
);
const baseMeter = meterPriceFromKgUsd(10, 2.5, 45);
const cargoMeter = meterPriceFromKgUsd(10 + 1.7, 2.5, 45);
assert.equal(withCargo.priceKgUsdCargo, 11.7);
assert.equal(withCargo.priceMeterUahNoVat, baseMeter);
assert.ok(withCargo.purchasePrice === baseMeter);
assert.equal(withCargo.deliveryPerMeterUah, Math.round((cargoMeter! - baseMeter!) * 10) / 10);

const withCut = deriveFabricPricing(
  {
    metersPerKg: 2.5,
    priceKgUsd: 10,
    priceMeterUahCutVat: 250,
  },
  fabricGlobals,
);
assert.equal(withCut.pricingMode, "cut");
assert.equal(withCut.purchasePrice, 250);
assert.ok((withCut.wholesalePurchasePrice ?? 0) > 0);

const smallOrder = resolveOrderFabricPurchasePrice({
  metersNeeded: 20,
  wholesalePurchasePrice: 180,
  cutPurchasePrice: 250,
  minWholesaleMeters: 50,
});
assert.equal(smallOrder.pricingMode, "cut");
assert.equal(smallOrder.purchasePrice, 250);

const largeOrder = resolveOrderFabricPurchasePrice({
  metersNeeded: 80,
  wholesalePurchasePrice: 180,
  cutPurchasePrice: 250,
  minWholesaleMeters: 50,
});
assert.equal(largeOrder.pricingMode, "wholesale");
assert.equal(largeOrder.purchasePrice, 180);

const lineCatalog = resolveMaterialLinePurchasePrice({
  type: "FABRIC",
  purchasePrice: 250,
  priceMeterUahNoVat: 180,
  priceMeterUahCutVat: 250,
  metersPerRoll: 50,
  companyCostMode: "NET",
});
assert.equal(lineCatalog.pricingMode, "cut");

const lineOrder = resolveMaterialLinePurchasePrice({
  type: "FABRIC",
  purchasePrice: 250,
  priceMeterUahNoVat: 180,
  priceMeterUahCutVat: 250,
  metersPerRoll: 50,
  companyCostMode: "NET",
  metersNeeded: 100,
});
assert.equal(lineOrder.pricingMode, "wholesale");
assert.equal(lineOrder.purchasePrice, 180);

// Single-price fabric (no cut): always звичайна; threshold must not change mode or price.
const wholesaleOnlyBelow = resolveOrderFabricPurchasePrice({
  metersNeeded: 20,
  wholesalePurchasePrice: 180,
  cutPurchasePrice: null,
  minWholesaleMeters: 50,
});
assert.equal(wholesaleOnlyBelow.pricingMode, "standard");
assert.equal(wholesaleOnlyBelow.purchasePrice, 180);

const wholesaleOnlyAbove = resolveOrderFabricPurchasePrice({
  metersNeeded: 80,
  wholesalePurchasePrice: 180,
  cutPurchasePrice: null,
  minWholesaleMeters: 50,
});
assert.equal(wholesaleOnlyAbove.pricingMode, "standard");
assert.equal(wholesaleOnlyAbove.purchasePrice, 180);

const wholesaleOnlyLine = resolveMaterialLinePurchasePrice({
  type: "FABRIC",
  purchasePrice: 180,
  priceMeterUahNoVat: 180,
  priceMeterUahCutVat: null,
  metersPerRoll: 50,
  minWholesaleMeters: 50,
  companyCostMode: "NET",
  metersNeeded: 10,
});
assert.equal(wholesaleOnlyLine.pricingMode, "standard");
assert.equal(wholesaleOnlyLine.purchasePrice, 180);

import { computeOrderItemFabricDelivery } from "../src/lib/fabric-delivery";

const delivery = computeOrderItemFabricDelivery({
  materials: [
    {
      type: "FABRIC",
      metersPerKg: 2.5,
      priceKgUsd: 10,
      consumptionPerUnit: 1.2,
      wastePercent: 5,
    },
  ],
  quantitiesBySize: { M: 100 },
  globals: fabricGlobals,
});
// 100 × 1.2 × 1.05 = 126 m → 50.4 kg × 1.7 $/kg × 45 ₴
assert.equal(delivery, 3855.6);

console.log("fabric cargo + cut/wholesale smoke test passed");

import { resolveSizeCoeffs, OVERSIZE_DEFAULT_COEFFS } from "../src/lib/size-coeffs";

assert.deepEqual(resolveSizeCoeffs("M"), { materialCoeff: 1, operationCoeff: 1 });
assert.deepEqual(resolveSizeCoeffs("XXL"), { materialCoeff: 1, operationCoeff: 1 });
assert.deepEqual(resolveSizeCoeffs("3XL"), OVERSIZE_DEFAULT_COEFFS);
assert.deepEqual(resolveSizeCoeffs("4XL"), OVERSIZE_DEFAULT_COEFFS);
assert.deepEqual(resolveSizeCoeffs("5XL"), OVERSIZE_DEFAULT_COEFFS);
assert.deepEqual(resolveSizeCoeffs("6XL"), OVERSIZE_DEFAULT_COEFFS);
assert.deepEqual(
  resolveSizeCoeffs("3XL", [{ sizeCode: "3XL", materialCoeff: 1.1, operationCoeff: 1.25 }]),
  { materialCoeff: 1.1, operationCoeff: 1.25 },
);

const oversizeCalc = calculateCosting({
  sizes: [
    { sizeCode: "M", quantity: 50, materialCoeff: 1, operationCoeff: 1 },
    { sizeCode: "3XL", quantity: 50, materialCoeff: 1.15, operationCoeff: 1.2 },
  ],
  materials: [
    {
      id: "fabric",
      consumptionPerUnit: 1.2,
      wastePercent: 5,
      purchasePrice: 200,
      applySizeCoeff: true,
    },
  ],
  operations: [
    {
      id: "sew",
      method: "UNIT_RATE",
      unitRate: 80,
      applySizeCoeff: true,
    },
  ],
  decorations: [],
  additionalCosts: [],
  pricingMethod: "MARGIN",
  targetRatePercent: 30,
});
const flatCalc = calculateCosting({
  sizes: [{ sizeCode: "M", quantity: 100, materialCoeff: 1, operationCoeff: 1 }],
  materials: [
    {
      id: "fabric",
      consumptionPerUnit: 1.2,
      wastePercent: 5,
      purchasePrice: 200,
      applySizeCoeff: true,
    },
  ],
  operations: [
    {
      id: "sew",
      method: "UNIT_RATE",
      unitRate: 80,
      applySizeCoeff: true,
    },
  ],
  decorations: [],
  additionalCosts: [],
  pricingMethod: "MARGIN",
  targetRatePercent: 30,
});
assert.ok(Number(oversizeCalc.materialsSubtotal) > Number(flatCalc.materialsSubtotal));
assert.ok(Number(oversizeCalc.operationsSubtotal) > Number(flatCalc.operationsSubtotal));
console.log("oversize 3XL+ coeffs smoke test passed");

// --- Decoration format matrix: duplicates + setup + tirage tiers ---
import {
  DEFAULT_DECORATION_FORMATS,
  DEFAULT_DECORATION_FORMAT_QTY_TIERS,
  mapDecorationFormatTiers,
  resolveDecorationFormatRate,
} from "../src/lib/decoration-format-pricing";

function formatTiers(nameUk: string) {
  const row = DEFAULT_DECORATION_FORMATS.find((item) => item.nameUk === nameUk);
  assert.ok(row, `missing seed format ${nameUk}`);
  return mapDecorationFormatTiers(
    DEFAULT_DECORATION_FORMAT_QTY_TIERS.map((minQuantity, index) => ({
      minQuantity,
      unitRate: row!.rates[index]!,
    })),
  );
}

const tiers5 = formatTiers("До 5 × 5 см");
const tiers10 = formatTiers("До 10 × 10 см");

assert.equal(resolveDecorationFormatRate({ quantity: 10, tiers: tiers5 }), 45); // <20 → 20–49
assert.equal(resolveDecorationFormatRate({ quantity: 30, tiers: tiers5 }), 45);
assert.equal(resolveDecorationFormatRate({ quantity: 50, tiers: tiers5 }), 35);
assert.equal(resolveDecorationFormatRate({ quantity: 150, tiers: tiers5 }), 29);
assert.equal(resolveDecorationFormatRate({ quantity: 200, tiers: tiers5 }), 25);
assert.equal(resolveDecorationFormatRate({ quantity: 30, tiers: tiers10 }), 55);

// 30 шт · два «5×5» + один «10×10» → 45×30 + 45×30 + 55×30
{
  const qty = 30;
  const r5 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers5 });
  const r10 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers10 });
  const calc = calculateCosting({
    sizes: [{ sizeCode: "M", quantity: qty }],
    materials: [],
    operations: [],
    decorations: [
      { id: "a", setupCost: 0, unitRate: r5 },
      { id: "b", setupCost: 0, unitRate: r5 },
      { id: "c", setupCost: 0, unitRate: r10 },
    ],
    additionalCosts: [],
    pricingMethod: "MARGIN",
    targetRatePercent: 0,
  });
  assert.equal(Number(calc.decorationsSubtotal), 45 * 30 + 45 * 30 + 55 * 30);
  assert.equal(Number(calc.decorationsSubtotal), 4350);
  assert.equal(Number(calc.costPerUnit), 145); // 4350 / 30
  console.log("decoration duplicates @30 smoke passed:", calc.decorationsSubtotal);
}

// same formats + приладки 100 + 0 + 250
{
  const qty = 30;
  const r5 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers5 });
  const r10 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers10 });
  const calc = calculateCosting({
    sizes: [{ sizeCode: "M", quantity: qty }],
    materials: [],
    operations: [],
    decorations: [
      { id: "a", setupCost: 100, unitRate: r5 },
      { id: "b", setupCost: 0, unitRate: r5 },
      { id: "c", setupCost: 250, unitRate: r10 },
    ],
    additionalCosts: [],
    pricingMethod: "MARGIN",
    targetRatePercent: 0,
  });
  // setups once + unit×qty per line
  assert.equal(Number(calc.decorationsSubtotal), 100 + 0 + 250 + 45 * 30 + 45 * 30 + 55 * 30);
  assert.equal(Number(calc.decorationsSubtotal), 4700);
  console.log("decoration setups @30 smoke passed:", calc.decorationsSubtotal);
}

// tirage 150 → rates 29 / 43
{
  const qty = 150;
  const r5 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers5 });
  const r10 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers10 });
  assert.equal(r5, 29);
  assert.equal(r10, 43);
  const calc = calculateCosting({
    sizes: [{ sizeCode: "M", quantity: qty }],
    materials: [],
    operations: [],
    decorations: [
      { id: "a", setupCost: 0, unitRate: r5 },
      { id: "b", setupCost: 0, unitRate: r5 },
      { id: "c", setupCost: 0, unitRate: r10 },
    ],
    additionalCosts: [],
    pricingMethod: "MARGIN",
    targetRatePercent: 0,
  });
  assert.equal(Number(calc.decorationsSubtotal), 29 * 150 + 29 * 150 + 43 * 150);
  assert.equal(Number(calc.decorationsSubtotal), 15150);
  console.log("decoration tier @150 smoke passed:", calc.decorationsSubtotal);
}

// single decoration only
{
  const qty = 80;
  const r5 = resolveDecorationFormatRate({ quantity: qty, tiers: tiers5 });
  assert.equal(r5, 35); // 50–99
  const calc = calculateCosting({
    sizes: [{ sizeCode: "M", quantity: qty }],
    materials: [],
    operations: [],
    decorations: [{ id: "a", setupCost: 500, unitRate: r5 }],
    additionalCosts: [],
    pricingMethod: "MARGIN",
    targetRatePercent: 0,
  });
  assert.equal(Number(calc.decorationsSubtotal), 500 + 35 * 80);
  assert.equal(Number(calc.decorationsSubtotal), 3300);
  console.log("decoration single + setup smoke passed:", calc.decorationsSubtotal);
}

console.log("decoration format pricing smoke tests passed");
