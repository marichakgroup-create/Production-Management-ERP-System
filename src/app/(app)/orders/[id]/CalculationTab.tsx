import Link from "next/link";
import {
  Table,
  TableCard,
  TableToolbar,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
  TableSectionHeader,
  TableSectionSubtotal,
} from "@/components/ui/Table";
import { Banner } from "@/components/ui/Banner";
import { formatMoneyUah } from "@/lib/utils";
import type { CalculationResult } from "@/server/domains/calculation/engine";
import type { DecorationRow, FabricDeliveryRow, MaterialRow, OperationRow } from "./ConfigurationTab";
import {
  isOversizeCode,
  resolveSizeCoeffs,
  type SizeCoeffRule,
} from "@/lib/size-coeffs";
import { lineCostOnSizes, linesForSize } from "@/lib/size-bom";
import { isCutOperationName } from "@/lib/cut-rate";
import { isDeliveryOperationName } from "@/lib/quantity-tiers";
import {
  FIXED_COST_LINE_NAME_UK,
  fixedCostValidationMessage,
  type FixedCostAllocation,
  type FixedCostValidationError,
} from "@/lib/fixed-costs";
import {
  OrderFixedCostError,
} from "@/components/orders/OrderSewerCountControl";

/** Orange uplift chip, same tone as «+» on oversize size tabs. */
function OversizeUpliftChip({
  amount,
  sizesLabel,
}: {
  amount: number;
  sizesLabel: string;
}) {
  if (!(amount > 0.05) || !sizesLabel) return null;
  return (
    <span className="mt-0.5 block text-[11px] font-semibold tabular text-[var(--color-warning-text)]">
      +{formatMoneyUah(amount)} ({sizesLabel})
    </span>
  );
}

/**
 * Line-item breakdown for the calculation tab.
 * Totals and cost structure live in the page rail — not duplicated here.
 */
export function CalculationTab({
  calc,
  totalQuantity,
  materials,
  operations,
  decorations,
  fabricDeliveryLines = [],
  fabricDeliveryAmount = 0,
  fixedCostAllocation = null,
  fixedCostError = null,
  orderId,
  orderItemId,
  companySewerCount,
  corridorHint,
  hasCommercialPriceList = false,
  commercialSellingPricePerUnit,
  commercialBasePricePerUnit,
  commercialDecorationPerUnit,
  commercialTotalValue,
  commercialMarginPercent,
  commercialProfitPerUnit,
  commercialProfitTotal,
  priceSource,
  sizeQuantities = [],
  sizeRules = null,
}: {
  calc: CalculationResult;
  totalQuantity: number;
  materials: MaterialRow[];
  operations: OperationRow[];
  decorations: DecorationRow[];
  fabricDeliveryLines?: FabricDeliveryRow[];
  fabricDeliveryAmount?: number;
  fixedCostAllocation?: FixedCostAllocation | null;
  fixedCostError?: FixedCostValidationError | null;
  orderId: string;
  orderItemId: string;
  companySewerCount: number;
  pricingMethod?: "MARGIN" | "MARKUP";
  targetRatePercent?: number;
  minimumMarginPercent?: number;
  isOrderOverride?: boolean;
  corridorHint?: { title: string; detail: string; href?: string; label?: string } | null;
  hasCommercialPriceList?: boolean;
  commercialSellingPricePerUnit?: number;
  /** Product (garment) price per unit, without branding. */
  commercialBasePricePerUnit?: number | null;
  /** Branding / нанесення price per unit. */
  commercialDecorationPerUnit?: number | null;
  commercialTotalValue?: number;
  commercialMarginPercent?: number;
  commercialProfitPerUnit?: number;
  commercialProfitTotal?: number;
  priceSource?: "pricelist" | "sewing_markup" | "cost";
  sizeQuantities?: Array<{ sizeCode: string; quantity: number }>;
  sizeRules?: SizeCoeffRule[] | null;
}) {
  const perUnit = (value: number) => (totalQuantity > 0 ? value / totalQuantity : 0);
  const costPerUnit = Number(calc.costPerUnit);
  const costTotal = Number(calc.totalCost);
  const sellingPerUnit = commercialSellingPricePerUnit ?? Number(calc.sellingPricePerUnit);
  const sellingTotal = commercialTotalValue ?? Number(calc.totalSellingValue);
  const decorationPerUnit =
    commercialDecorationPerUnit != null
      ? commercialDecorationPerUnit
      : perUnit(Number(calc.decorationsSubtotal));
  const productPerUnit =
    commercialBasePricePerUnit != null
      ? commercialBasePricePerUnit
      : Math.max(0, sellingPerUnit - decorationPerUnit);
  const profitPerUnit =
    commercialProfitPerUnit ?? sellingPerUnit - costPerUnit;
  const profitTotal = commercialProfitTotal ?? sellingTotal - costTotal;
  const marginPct =
    commercialMarginPercent ??
    (sellingTotal > 0 ? (profitTotal / sellingTotal) * 100 : Number(calc.marginPercent));
  const priceSourceLabel =
    priceSource === "pricelist" || hasCommercialPriceList
      ? "з базового прайсу"
      : priceSource === "sewing_markup"
        ? "націнка на пошив"
        : "як собівартість";
  const oversizeRows = sizeQuantities.filter(
    (row) => row.quantity > 0 && isOversizeCode(row.sizeCode),
  );
  const oversizeSizesLabel = oversizeRows.map((row) => row.sizeCode).join(" ");

  const materialSiblings = materials.map((row) => ({
    id: row.id,
    groupKey: row.groupKey,
    sizeCode: row.sizeCode,
  }));
  const materialsOversizeUplift = materials.reduce((sum, row) => {
    const base = lineCostOnSizes(
      {
        id: row.id,
        groupKey: row.groupKey,
        sizeCode: row.sizeCode,
        consumption: row.consumption,
        waste: row.waste,
        price: row.price,
        applySizeCoeff: false,
      },
      materialSiblings,
      sizeQuantities,
      sizeRules,
    );
    return sum + Math.max(0, row.totalCost - base);
  }, 0);

  const operationSiblings = operations.map((row) => ({
    id: row.id,
    groupKey: row.groupKey,
    sizeCode: row.sizeCode,
  }));
  const operationsOversizeUplift = operations.reduce((sum, row) => {
    if (isCutOperationName(row.name) || isDeliveryOperationName(row.name)) return sum;
    let uplift = 0;
    for (const size of sizeQuantities) {
      if (size.quantity <= 0 || !isOversizeCode(size.sizeCode)) continue;
      if (!linesForSize(operationSiblings, size.sizeCode).some((line) => line.id === row.id)) {
        continue;
      }
      const coeff = resolveSizeCoeffs(size.sizeCode, sizeRules).operationCoeff;
      if (coeff <= 1) continue;
      uplift += row.unitCost * size.quantity * (coeff - 1);
    }
    return sum + uplift;
  }, 0);

  const costOversizeUplift = materialsOversizeUplift + operationsOversizeUplift;

  const fixedCostTotal = fixedCostAllocation?.fixedCostTotal ?? 0;
  const otherAdditionalCosts = Math.max(
    0,
    Number(calc.additionalCostsSubtotal) - fabricDeliveryAmount - fixedCostTotal,
  );
  const fabricDeliveryRows = fabricDeliveryLines.filter((row) => row.amount > 0);
  const materialsSubtotal = Number(calc.materialsSubtotal);
  const operationsSubtotal = Number(calc.operationsSubtotal);
  const decorationsSubtotal = Number(calc.decorationsSubtotal);

  function fabricDeliveryFormula(row: FabricDeliveryRow) {
    const kg = row.kgNeeded != null ? `${row.kgNeeded} кг` : "кг";
    const mode = row.manual ? " · вручну" : "";
    return `${kg} × $${row.cargoUsdPerKg}/кг × ${row.usdUahRate} ₴/$${mode}`;
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-2 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <p className="type-caption">Собівартість / од.</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular">{formatMoneyUah(costPerUnit)}</p>
          {totalQuantity > 1 ? (
            <p className="type-caption mt-0.5">разом {formatMoneyUah(costTotal)}</p>
          ) : null}
        </div>
        <div>
          <p className="type-caption">Ціна продукту / од.</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular">{formatMoneyUah(productPerUnit)}</p>
          <p className="type-caption mt-0.5">без нанесення</p>
        </div>
        <div>
          <p className="type-caption">Нанесення / од.</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular">{formatMoneyUah(decorationPerUnit)}</p>
          {totalQuantity > 1 ? (
            <p className="type-caption mt-0.5">
              разом {formatMoneyUah(decorationPerUnit * totalQuantity)}
            </p>
          ) : null}
        </div>
        <div>
          <p className="type-caption">Ціна клієнту / од.</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular">{formatMoneyUah(sellingPerUnit)}</p>
          <p className="type-caption mt-0.5">{priceSourceLabel}</p>
          {totalQuantity > 1 ? (
            <p className="type-caption mt-0.5">разом {formatMoneyUah(sellingTotal)}</p>
          ) : null}
        </div>
        <div>
          <p className="type-caption">Заробимо на тираж</p>
          <p className="mt-0.5 text-[15px] font-semibold tabular text-[var(--color-success-text)]">
            {formatMoneyUah(profitTotal)}
          </p>
          <p className="type-caption mt-0.5">маржа {marginPct.toFixed(1)}%</p>
        </div>
      </div>

      {corridorHint ? (
        <Banner
          tone="info"
          title={corridorHint.title}
          action={
            corridorHint.href ? (
              <Link href={corridorHint.href} className="btn-primary btn-primary-sm">
                {corridorHint.label ?? "Далі"}
              </Link>
            ) : null
          }
        >
          {corridorHint.detail}
        </Banner>
      ) : null}
      {fixedCostError ? (
        <Banner
          tone="danger"
          title="Постійні витрати не налаштовані"
          action={
            <Link href="/settings/fixed-costs" className="btn-primary btn-primary-sm">
              Довідник
            </Link>
          }
        >
          {fixedCostValidationMessage(fixedCostError)} Розрахунок / збереження пропозиції
          недоступні, доки параметри не виправлені.
        </Banner>
      ) : null}
      <TableCard>
        <TableToolbar
          left={<span className="type-subsection">Деталі статей</span>}
          right={<span className="type-caption tabular">{totalQuantity} шт</span>}
        />
        <Table>
          <THead>
            <TH>Стаття</TH>
            <TH>Як пораховано</TH>
            <TH align="right">За од.</TH>
            <TH align="right">Разом</TH>
          </THead>
          <TBody>
            <TableSectionHeader title="Матеріали" first />
            {materials.length === 0 ? (
              <TR muted>
                <TD colSpan={4}>Матеріалів немає</TD>
              </TR>
            ) : (
              materials.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium text-[var(--color-text-primary)]">
                    {row.name}
                    {row.sizeCode ? (
                      <span className="type-caption ml-1.5">{row.sizeCode}</span>
                    ) : null}
                  </TD>
                  <TD className="type-caption">
                    {row.consumption} {row.unit} × (1 + {row.waste}%) × {formatMoneyUah(row.price)}
                    {row.sizeCode ? ` · ${row.sizeCode}` : ""}
                  </TD>
                  <TD numeric className="text-[var(--color-text-secondary)]">
                    {formatMoneyUah(row.unitCost)}
                  </TD>
                  <TD numeric>{formatMoneyUah(row.totalCost)}</TD>
                </TR>
              ))
            )}
            {materials.length > 0 ? (
              <TableSectionSubtotal
                label="Разом матеріали"
                perUnit={formatMoneyUah(perUnit(materialsSubtotal))}
                total={
                  <>
                    {formatMoneyUah(materialsSubtotal)}
                    <OversizeUpliftChip
                      amount={materialsOversizeUplift}
                      sizesLabel={oversizeSizesLabel}
                    />
                  </>
                }
              />
            ) : null}

            <TableSectionHeader title="Операції" />
            {operations.length === 0 ? (
              <TR muted>
                <TD colSpan={4}>Операцій немає</TD>
              </TR>
            ) : (
              operations.map((row) => (
                <TR key={row.id}>
                  <TD className="font-medium">{row.name}</TD>
                  <TD className="type-caption">
                    {formatMoneyUah(row.unitCost)} × {totalQuantity} шт
                  </TD>
                  <TD numeric className="text-[var(--color-text-secondary)]">
                    {formatMoneyUah(row.unitCost)}
                  </TD>
                  <TD numeric>{formatMoneyUah(row.totalCost)}</TD>
                </TR>
              ))
            )}
            {operations.length > 0 ? (
              <TableSectionSubtotal
                label="Разом операції"
                perUnit={formatMoneyUah(perUnit(operationsSubtotal))}
                total={
                  <>
                    {formatMoneyUah(operationsSubtotal)}
                    <OversizeUpliftChip
                      amount={operationsOversizeUplift}
                      sizesLabel={oversizeSizesLabel}
                    />
                  </>
                }
              />
            ) : null}

            <TableSectionHeader title={FIXED_COST_LINE_NAME_UK} />
            <TR muted>
              <TD colSpan={4} className="py-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="type-caption">
                    ПВ у собівартості виробу: пошив ÷ коеф. з довідника ({companySewerCount} швей).
                    Кількість швей у замовленні не змінюється.
                  </p>
                  <OrderFixedCostError error={fixedCostError} />
                </div>
              </TD>
            </TR>
            {fixedCostAllocation && fixedCostAllocation.fixedCostTotal > 0 ? (
              <>
                <TR>
                  <TD className="font-medium">{FIXED_COST_LINE_NAME_UK}</TD>
                  <TD className="text-[var(--color-text-secondary)]">
                    Коеф. {fixedCostAllocation.metrics.coefficient.toFixed(1)}
                  </TD>
                  <TD numeric className="text-[var(--color-text-secondary)]">
                    {formatMoneyUah(fixedCostAllocation.fixedCostPerUnit)}
                  </TD>
                  <TD numeric>{formatMoneyUah(fixedCostAllocation.fixedCostTotal)}</TD>
                </TR>
                <TableSectionSubtotal
                  label="Разом постійні витрати"
                  perUnit={formatMoneyUah(fixedCostAllocation.fixedCostPerUnit)}
                  total={formatMoneyUah(fixedCostAllocation.fixedCostTotal)}
                />
              </>
            ) : !fixedCostError ? (
              <TR muted>
                <TD colSpan={4} className="type-caption">
                  Немає «Пошив» — ПВ = 0.
                </TD>
              </TR>
            ) : null}

            {decorations.length > 0 ? (
              <>
                <TableSectionHeader title="Нанесення" />
                {decorations.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-medium">{row.name}</TD>
                    <TD className="type-caption">
                      приладка {formatMoneyUah(row.setupCost)} + {formatMoneyUah(row.unitRate)} ×{" "}
                      {row.quantity ?? totalQuantity}
                    </TD>
                    <TD numeric className="text-[var(--color-text-secondary)]">
                      {formatMoneyUah(perUnit(row.totalCost))}
                    </TD>
                    <TD numeric>{formatMoneyUah(row.totalCost)}</TD>
                  </TR>
                ))}
                <TableSectionSubtotal
                  label="Разом нанесення"
                  perUnit={formatMoneyUah(perUnit(decorationsSubtotal))}
                  total={formatMoneyUah(decorationsSubtotal)}
                />
              </>
            ) : null}

            {fabricDeliveryRows.length > 0 ? (
              <>
                <TableSectionHeader title="Доставка" />
                {fabricDeliveryRows.map((row) => (
                  <TR key={row.id}>
                    <TD className="font-medium text-[var(--color-text-primary)]">
                      {row.name}
                      {row.sizeCode ? (
                        <span className="type-caption ml-1.5">{row.sizeCode}</span>
                      ) : null}
                    </TD>
                    <TD className="type-caption">{fabricDeliveryFormula(row)}</TD>
                    <TD numeric className="text-[var(--color-text-secondary)]">
                      {formatMoneyUah(perUnit(row.amount))}
                    </TD>
                    <TD numeric>{formatMoneyUah(row.amount)}</TD>
                  </TR>
                ))}
                <TableSectionSubtotal
                  label="Разом доставка тканини"
                  perUnit={formatMoneyUah(perUnit(fabricDeliveryAmount))}
                  total={formatMoneyUah(fabricDeliveryAmount)}
                />
              </>
            ) : null}

            {otherAdditionalCosts > 0 ? (
              <>
                <TableSectionHeader title="Інші витрати" />
                <TR>
                  <TD className="font-medium">Додаткові статті</TD>
                  <TD className="type-caption">Загальновиробничі витрати замовлення</TD>
                  <TD numeric className="text-[var(--color-text-secondary)]">
                    {formatMoneyUah(perUnit(otherAdditionalCosts))}
                  </TD>
                  <TD numeric>{formatMoneyUah(otherAdditionalCosts)}</TD>
                </TR>
                <TableSectionSubtotal
                  label="Разом інші витрати"
                  perUnit={formatMoneyUah(perUnit(otherAdditionalCosts))}
                  total={formatMoneyUah(otherAdditionalCosts)}
                />
              </>
            ) : null}
          </TBody>
          <TFoot>
            <tr>
              <TD colSpan={2} className="text-[var(--color-text-secondary)]">
                Собівартість
              </TD>
              <TD numeric className="text-[var(--color-text-secondary)]">
                {formatMoneyUah(costPerUnit)}
              </TD>
              <TD numeric>
                {formatMoneyUah(costTotal)}
                <OversizeUpliftChip
                  amount={costOversizeUplift}
                  sizesLabel={oversizeSizesLabel}
                />
              </TD>
            </tr>
            <tr>
              <TD colSpan={2} className="text-[var(--color-text-secondary)]">
                Націнка (заробіток)
                <span className="type-caption ml-1.5">маржа {marginPct.toFixed(1)}%</span>
              </TD>
              <TD numeric className="text-[var(--color-success-text)]">
                {formatMoneyUah(profitPerUnit)}
              </TD>
              <TD numeric className="text-[var(--color-success-text)]">
                {formatMoneyUah(profitTotal)}
              </TD>
            </tr>
            <tr>
              <TD colSpan={2} className="text-[var(--color-text-secondary)]">
                Ціна продукту (без нанесення)
              </TD>
              <TD numeric className="text-[var(--color-text-secondary)]">
                {formatMoneyUah(productPerUnit)}
              </TD>
              <TD numeric className="text-[var(--color-text-secondary)]">
                {formatMoneyUah(productPerUnit * totalQuantity)}
              </TD>
            </tr>
            <tr>
              <TD colSpan={2} className="text-[var(--color-text-secondary)]">
                Нанесення
              </TD>
              <TD numeric className="text-[var(--color-text-secondary)]">
                {formatMoneyUah(decorationPerUnit)}
              </TD>
              <TD numeric className="text-[var(--color-text-secondary)]">
                {formatMoneyUah(decorationPerUnit * totalQuantity)}
              </TD>
            </tr>
            <tr className="border-t border-[var(--color-divider)]">
              <TD colSpan={2}>
                Ціна для клієнта
                <span className="type-caption ml-1.5">{priceSourceLabel}</span>
              </TD>
              <TD numeric className="font-semibold">
                {formatMoneyUah(sellingPerUnit)}
              </TD>
              <TD numeric className="font-semibold">
                {formatMoneyUah(sellingTotal)}
              </TD>
            </tr>
          </TFoot>
        </Table>
      </TableCard>
    </div>
  );
}
