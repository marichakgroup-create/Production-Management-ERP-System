import { Decimal } from "decimal.js";
import { linesForSize } from "@/lib/size-bom";

export type SizeQuantity = {
  sizeCode: string;
  quantity: number;
  materialCoeff?: number;
  operationCoeff?: number;
};

export type MaterialLineInput = {
  id: string;
  groupKey?: string | null;
  sizeCode?: string | null;
  consumptionPerUnit: number | string;
  wastePercent: number | string;
  purchasePrice: number | string;
  applySizeCoeff?: boolean;
};

export type OperationLineInput = {
  id: string;
  groupKey?: string | null;
  sizeCode?: string | null;
  method: "UNIT_RATE" | "SHIFT_OUTPUT" | "QUANTITY_TIER";
  unitRate?: number | string | null;
  shiftCost?: number | string | null;
  standardOutput?: number | string | null;
  applySizeCoeff?: boolean;
};

export type DecorationLineInput = {
  id: string;
  setupCost: number | string;
  unitRate: number | string;
};

export type AdditionalCostInput = {
  id: string;
  amount: number | string;
  isPerUnit: boolean;
};

export type CalculationInput = {
  sizes: SizeQuantity[];
  materials: MaterialLineInput[];
  operations: OperationLineInput[];
  decorations: DecorationLineInput[];
  additionalCosts: AdditionalCostInput[];
  pricingMethod: "MARGIN" | "MARKUP";
  targetRatePercent: number | string;
  manualSellingPricePerUnit?: number | string | null;
  roundingDecimals?: number;
};

export type CalculationResult = {
  totalQuantity: number;
  materialsSubtotal: string;
  operationsSubtotal: string;
  decorationsSubtotal: string;
  additionalCostsSubtotal: string;
  totalCost: string;
  costPerUnit: string;
  sellingPricePerUnit: string;
  totalSellingValue: string;
  profitAmount: string;
  marginPercent: string;
};

function d(value: number | string | null | undefined): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return new Decimal(value);
}

function roundMoney(value: Decimal, decimals = 1): Decimal {
  return value.toDecimalPlaces(decimals, Decimal.ROUND_HALF_UP);
}

function operationUnitCost(op: OperationLineInput): Decimal {
  if (op.method === "SHIFT_OUTPUT") {
    const output = d(op.standardOutput);
    if (output.lte(0)) return new Decimal(0);
    return d(op.shiftCost).div(output);
  }
  return d(op.unitRate);
}

/**
 * Pure calculation engine — no DB or UI dependencies.
 * Size-specific coeffs are applied only to explicitly marked lines.
 */
export function calculateCosting(input: CalculationInput): CalculationResult {
  const decimals = input.roundingDecimals ?? 1;
  const totalQuantity = input.sizes.reduce((sum, size) => sum + size.quantity, 0);

  if (totalQuantity <= 0) {
    const zero = (0).toFixed(decimals);
    return {
      totalQuantity: 0,
      materialsSubtotal: zero,
      operationsSubtotal: zero,
      decorationsSubtotal: zero,
      additionalCostsSubtotal: zero,
      totalCost: zero,
      costPerUnit: zero,
      sellingPricePerUnit: zero,
      totalSellingValue: zero,
      profitAmount: zero,
      marginPercent: zero,
    };
  }

  let materials = new Decimal(0);
  let operations = new Decimal(0);

  for (const size of input.sizes) {
    if (size.quantity <= 0) continue;
    const materialCoeff = d(size.materialCoeff ?? 1);
    const operationCoeff = d(size.operationCoeff ?? 1);

    for (const line of linesForSize(input.materials, size.sizeCode)) {
      const coeff = line.applySizeCoeff === false ? new Decimal(1) : materialCoeff;
      const row = d(line.consumptionPerUnit)
        .mul(size.quantity)
        .mul(coeff)
        .mul(d(1).plus(d(line.wastePercent).div(100)))
        .mul(d(line.purchasePrice));
      materials = materials.plus(row);
    }

    for (const line of linesForSize(input.operations, size.sizeCode)) {
      const coeff = line.applySizeCoeff === false ? new Decimal(1) : operationCoeff;
      const row = operationUnitCost(line).mul(size.quantity).mul(coeff);
      operations = operations.plus(row);
    }
  }

  let decorations = new Decimal(0);
  for (const line of input.decorations) {
    decorations = decorations
      .plus(d(line.setupCost))
      .plus(d(line.unitRate).mul(totalQuantity));
  }

  let additional = new Decimal(0);
  for (const line of input.additionalCosts) {
    additional = additional.plus(
      line.isPerUnit ? d(line.amount).mul(totalQuantity) : d(line.amount),
    );
  }

  const totalCost = materials.plus(operations).plus(decorations).plus(additional);
  const costPerUnit = totalCost.div(totalQuantity);

  let sellingPricePerUnit: Decimal;
  if (input.manualSellingPricePerUnit != null && input.manualSellingPricePerUnit !== "") {
    sellingPricePerUnit = d(input.manualSellingPricePerUnit);
  } else {
    const rate = d(input.targetRatePercent).div(100);
    if (input.pricingMethod === "MARKUP") {
      sellingPricePerUnit = costPerUnit.mul(d(1).plus(rate));
    } else {
      const denominator = d(1).minus(rate);
      sellingPricePerUnit = denominator.lte(0) ? costPerUnit : costPerUnit.div(denominator);
    }
  }

  sellingPricePerUnit = roundMoney(sellingPricePerUnit, decimals);
  const totalSellingValue = roundMoney(sellingPricePerUnit.mul(totalQuantity), decimals);
  const roundedTotalCost = roundMoney(totalCost, decimals);
  const roundedCostPerUnit = roundMoney(costPerUnit, decimals);
  const profitAmount = roundMoney(totalSellingValue.minus(roundedTotalCost), decimals);
  const marginPercent = totalSellingValue.eq(0)
    ? new Decimal(0)
    : roundMoney(profitAmount.div(totalSellingValue).mul(100), decimals);

  return {
    totalQuantity,
    materialsSubtotal: roundMoney(materials, decimals).toFixed(decimals),
    operationsSubtotal: roundMoney(operations, decimals).toFixed(decimals),
    decorationsSubtotal: roundMoney(decorations, decimals).toFixed(decimals),
    additionalCostsSubtotal: roundMoney(additional, decimals).toFixed(decimals),
    totalCost: roundedTotalCost.toFixed(decimals),
    costPerUnit: roundedCostPerUnit.toFixed(decimals),
    sellingPricePerUnit: sellingPricePerUnit.toFixed(decimals),
    totalSellingValue: totalSellingValue.toFixed(decimals),
    profitAmount: profitAmount.toFixed(decimals),
    marginPercent: marginPercent.toFixed(decimals),
  };
}
