"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { Modal } from "@/components/ui/Overlay";
import { MaterialCreatePanel } from "@/app/(app)/settings/resources/MaterialCreateForm";
import { OperationCreatePanel } from "@/app/(app)/settings/operations/OperationCreateForm";
import { SizeRun } from "@/components/orders/SizeRun";
import {
  OrderItemSizeBreakdown,
  type SizeChartOption,
} from "@/components/orders/OrderItemSizeBreakdown";
import {
  CellStack,
  Table,
  TableCard,
  TableEmpty,
  TableToolbar,
  TBody,
  TD,
  TFoot,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { IconPlus, IconTrash, IconMaterials, IconOperations, IconDecoration } from "@/components/ui/Icons";
import { OrderMaterialDetailPanel } from "@/components/orders/OrderMaterialDetailPanel";
import { useOrderUnsavedWorkspaceDirty } from "@/components/orders/OrderUnsavedContext";
import { cn, formatMoneyUah } from "@/lib/utils";
import { materialOptionDescription } from "@/lib/material-catalog-options";
import {
  addOrderMaterialAction,
  addOrderOperationAction,
  copyOrderSizeSpecAction,
  removeOrderDecorationAction,
  removeOrderMaterialAction,
  removeOrderOperationAction,
  updateOrderDecorationAction,
  updateOrderMaterialConsumptionAction,
  updateOrderMaterialTermsAction,
  updateOrderSizesAction,
} from "@/server/domains/orders/actions";
import { CopySizeSpec, SizeScopeTabs } from "@/components/catalog/SizeScopeTabs";
import { SizeBomScopeHint } from "@/components/catalog/SizeBomScopeHint";
import {
  effectiveOversizeConsumption,
  isOversizeCode,
  OVERSIZE_DEFAULT_COEFFS,
  OVERSIZE_RANGE_LABEL,
} from "@/lib/size-coeffs";
import {
  ALL_SIZES,
  customizedSizeCodes,
  linesForSize,
  type SizeScope,
} from "@/lib/size-bom";
import { operationMethodLabel } from "@/lib/operation-labels";
import { OrderFixedCostError } from "@/components/orders/OrderSewerCountControl";
import { OrderDecorationFormatPicker } from "@/components/orders/OrderDecorationFormatPicker";
import { OrderMaterialSupplierColorEditor } from "@/components/catalog/SupplierColorFields";
import { SoftBusy, RowBusyMark, busyRowClass } from "@/components/ui/SoftBusy";
import { FIXED_COST_LINE_NAME_UK } from "@/lib/fixed-costs";
import type { FixedCostAllocation, FixedCostValidationError } from "@/lib/fixed-costs";
import {
  displayScreenPrintLineName,
  isScreenPrintDecorationName,
} from "@/lib/screen-print-pricing";
import {
  DECORATION_FORMAT_NAME_PREFIX,
  isDecorationFormatLineName,
} from "@/lib/decoration-format-pricing";
import type { DecorationFormatCatalogRow } from "@/server/domains/decoration-formats/service";

export type MaterialRow = {
  id: string;
  name: string;
  unit: string;
  consumption: number;
  waste: number;
  price: number;
  unitCost: number;
  totalCost: number;
  sizeCode: string | null;
  groupKey: string;
  pricingHint?: string | null;
  supplierId?: string | null;
  deliveryType?: string | null;
  supplierName?: string | null;
  colorSnapshot?: string | null;
  supplierOffers?: Array<{
    supplierId: string;
    supplierName: string;
    isPrimary?: boolean;
    availableColors: string[];
    preferredDeliveryType?: string | null;
    deliveryOptions?: Array<{
      type: "CARGO" | "NP_STANDARD" | "NP_VOLUME";
      label: string;
      rateLabel?: string;
    }>;
  }>;
  materialAvailableColors?: string[];
  isFabric?: boolean;
  /** Density · composition from catalog (same as add-material dropdown). */
  specHint?: string | null;
};

export type FabricDeliveryRow = {
  id: string;
  name: string;
  sizeCode: string | null;
  amount: number;
  manual: boolean;
  cargoUsdPerKg: number;
  usdUahRate: number;
  kgNeeded: number | null;
};

export type OperationRow = {
  id: string;
  name: string;
  method: string;
  unitCost: number;
  totalCost: number;
  sizeCode: string | null;
  groupKey: string;
};

export type DecorationRow = {
  id: string;
  name: string;
  setupCost: number;
  unitRate: number;
  totalCost: number;
};

type SizeRow = { id: string; sizeCode: string; sizeNameUk: string; quantity: number };

export function ConfigurationTab({
  orderId,
  itemId,
  locked,
  productName: _productName,
  comment,
  sizes,
  materials,
  operations,
  decorations,
  materialOptions,
  operationOptions,
  unitOptions,
  materialsSubtotal,
  operationsSubtotal,
  decorationsSubtotal,
  corridorHint,
  hideCosts = false,
  canCreateCatalog = false,
  companySewerCount = 0,
  sewerCountOverride = null,
  fixedCostAllocation = null,
  fixedCostError = null,
  canEditFixedCosts = false,
  decorationFormats = [],
  screenPrintCoefficients = [],
  needsSizeBreakdown = false,
  sizeCharts = [],
  preferredProductSizes = [],
}: {
  orderId: string;
  itemId: string;
  locked: boolean;
  productName: string;
  comment?: string | null;
  sizes: SizeRow[];
  materials: MaterialRow[];
  operations: OperationRow[];
  decorations: DecorationRow[];
  materialOptions: Array<{
    id: string;
    label: string;
    composition?: string | null;
    densityGsm?: string | null;
    supplierNames?: string[];
  }>;
  operationOptions: Array<{ id: string; label: string }>;
  unitOptions: Array<{ id: string; label: string }>;
  needsSizeBreakdown?: boolean;
  sizeCharts?: SizeChartOption[];
  /** Catalog sizes of the source product — seed size breakdown grid. */
  preferredProductSizes?: Array<{ code: string; nameUk: string }>;
  materialsSubtotal: number;
  operationsSubtotal: number;
  decorationsSubtotal: number;
  corridorHint?: { title: string; detail: string } | null;
  hideCosts?: boolean;
  canCreateCatalog?: boolean;
  companySewerCount?: number;
  sewerCountOverride?: number | null;
  fixedCostAllocation?: FixedCostAllocation | null;
  fixedCostError?: FixedCostValidationError | null;
  canEditFixedCosts?: boolean;
  decorationFormats?: DecorationFormatCatalogRow[];
  /** Kept for display of legacy silk-screen lines already on the order. */
  screenPrintCoefficients?: Array<{
    code: string;
    nameUk: string;
    factor: number;
    noteUk?: string | null;
  }>;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const sizesSignature = sizes.map((size) => `${size.sizeCode}:${size.quantity}`).join("|");
  const [quantities, setQuantities] = useState<Record<string, number>>(() =>
    Object.fromEntries(sizes.map((size) => [size.sizeCode, size.quantity])),
  );
  const [removeTarget, setRemoveTarget] = useState<{
    kind: "material" | "operation" | "decoration";
    id: string;
    name: string;
  } | null>(null);
  const [selectedMaterialId, setSelectedMaterialId] = useState<string | null>(null);
  const [sizeScope, setSizeScope] = useState<SizeScope>(ALL_SIZES);

  // Keep qty state in sync after apply/refresh — otherwise SizeRun shows zeros and a save wipes DB.
  useEffect(() => {
    setQuantities(Object.fromEntries(sizes.map((size) => [size.sizeCode, size.quantity])));
    setSizeScope(ALL_SIZES);
  }, [itemId, sizesSignature]);

  const isBusy = (key: string) => pending && busyKey === key;

  function runBusy(key: string, work: () => Promise<void>) {
    setBusyKey(key);
    startTransition(async () => {
      try {
        await work();
        router.refresh();
      } finally {
        setBusyKey(null);
      }
    });
  }

  const dirty = sizes.some((size) => (quantities[size.sizeCode] ?? 0) !== size.quantity);
  useOrderUnsavedWorkspaceDirty(!locked && dirty);
  const totalQuantity = sizes.reduce((sum, size) => sum + (quantities[size.sizeCode] ?? 0), 0);
  const decorationSetupTotal = decorations.reduce((sum, row) => sum + row.setupCost, 0);
  const decorationUnitRateTotal = decorations.reduce((sum, row) => sum + row.unitRate, 0);
  const sizeRefs = sizes.map((size) => ({ code: size.sizeCode, nameUk: size.sizeNameUk }));
  const visibleMaterials =
    sizeScope === ALL_SIZES ? materials : linesForSize(materials, sizeScope);
  const visibleOperations =
    sizeScope === ALL_SIZES ? operations : linesForSize(operations, sizeScope);
  const customized = customizedSizeCodes({
    allCodes: sizes.map((size) => size.sizeCode),
    materials: materials.map((row) => ({
      sizeCodes: row.sizeCode ? [row.sizeCode] : null,
    })),
    operations: operations.map((row) => ({
      sizeCodes: row.sizeCode ? [row.sizeCode] : null,
    })),
  });
  const hasOversizeSizes = sizes.some((size) => isOversizeCode(size.sizeCode));
  const scopeIsOversize = isOversizeCode(sizeScope);
  const hasOversizeQty = sizes.some(
    (size) => isOversizeCode(size.sizeCode) && (quantities[size.sizeCode] ?? 0) > 0,
  );

  function decorationLabel(name: string) {
    if (isDecorationFormatLineName(name)) {
      return name.slice(DECORATION_FORMAT_NAME_PREFIX.length) || name;
    }
    if (!isScreenPrintDecorationName(name)) return name;
    return displayScreenPrintLineName(name, screenPrintCoefficients);
  }

  function saveMaterialConsumption(id: string, consumption: number) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("id", id);
    formData.set("consumptionPerUnit", String(consumption));
    formData.set("sizeCode", sizeScope);
    runBusy(`material:${id}`, async () => {
      await updateOrderMaterialConsumptionAction(formData);
    });
  }

  function saveMaterialWaste(id: string, wastePercent: number) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("id", id);
    formData.set("wastePercent", String(wastePercent));
    runBusy(`material:${id}`, async () => {
      await updateOrderMaterialTermsAction(formData);
    });
  }

  function saveDecorationRates(id: string, setupCost: number, unitRate: number) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("id", id);
    formData.set("setupCost", String(setupCost));
    formData.set("unitRate", String(unitRate));
    runBusy(`decoration:${id}`, async () => {
      await updateOrderDecorationAction(formData);
    });
  }

  function copySpecTo(toCodes: string[]) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("orderItemId", itemId);
    formData.set("fromSizeCode", sizeScope);
    for (const code of toCodes) formData.append("toSizeCode", code);
    runBusy("sizes-copy", async () => {
      await copyOrderSizeSpecAction(formData);
    });
  }

  function saveSizes() {
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("orderItemId", itemId);
    sizes.forEach((size) => {
      formData.append("sizeCode", size.sizeCode);
      formData.append("sizeNameUk", size.sizeNameUk);
      formData.append("sizeQty", String(quantities[size.sizeCode] ?? 0));
    });
    runBusy("sizes", async () => {
      await updateOrderSizesAction(formData);
    });
  }

  function confirmRemove() {
    if (!removeTarget) return;
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("id", removeTarget.id);
    formData.set("sizeCode", sizeScope);
    const action =
      removeTarget.kind === "material"
        ? removeOrderMaterialAction
        : removeTarget.kind === "operation"
          ? removeOrderOperationAction
          : removeOrderDecorationAction;
    const key = `${removeTarget.kind}:${removeTarget.id}`;
    runBusy(key, async () => {
      await action(formData);
      setRemoveTarget(null);
    });
  }

  return (
    <div className="space-y-3">
      {locked ? (
        <Banner tone="info" title="Замовлення передано у виробництво">
          Комплектація зафіксована. Зміни — через нову пропозицію калькуляції.
        </Banner>
      ) : corridorHint ? (
        <Banner tone="info" title={corridorHint.title}>
          {corridorHint.detail}
        </Banner>
      ) : null}

      <SoftBusy busy={isBusy("sizes")} label="Оновлення кількостей…">
        {needsSizeBreakdown && !locked ? (
          <OrderItemSizeBreakdown
            orderId={orderId}
            orderItemId={itemId}
            targetTirage={sizes.reduce((sum, size) => sum + size.quantity, 0)}
            sizeCharts={sizeCharts}
            preferredSizes={preferredProductSizes}
            disabled={isBusy("sizes")}
          />
        ) : (
          <div className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5">
            {sizes.length === 0 ? (
              <p className="type-caption">Розміри не задані.</p>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="type-caption tabular">
                    {totalQuantity} шт
                    {locked ? " · зафіксовано" : ""}
                  </p>
                  {!locked && dirty ? (
                    <Button size="sm" onClick={saveSizes} disabled={pending} loading={isBusy("sizes")}>
                      Зберегти к-сть
                    </Button>
                  ) : null}
                </div>
                <SizeRun
                  sizes={sizes.map((size) => ({ code: size.sizeCode, nameUk: size.sizeNameUk }))}
                  quantities={quantities}
                  disabled={locked || isBusy("sizes")}
                  quiet
                  onChange={(code, quantity) =>
                    setQuantities((prev) => ({ ...prev, [code]: quantity }))
                  }
                />
                {dirty && !locked ? (
                  <p className="type-caption text-[var(--color-warning-text)]">
                    К-сть змінено — збережіть, щоб перерахувати калькуляцію.
                  </p>
                ) : null}
              </div>
            )}
          </div>
        )}
      </SoftBusy>

      <div className="flex flex-wrap items-center gap-2 px-0.5">
        <SizeScopeTabs
          sizes={sizeRefs}
          value={sizeScope}
          onChange={setSizeScope}
          customized={customized}
        />
        {sizes.length > 1 && sizeScope !== ALL_SIZES ? (
          <SizeBomScopeHint
            sizeScope={sizeScope}
            hasOversizeSizes={hasOversizeSizes}
            compact
            hideUpliftPercents={hideCosts}
          />
        ) : null}
        {sizeScope !== ALL_SIZES && !locked ? (
          <CopySizeSpec from={sizeScope} sizes={sizeRefs} onCopy={copySpecTo} disabled={pending} />
        ) : null}
      </div>

      <TableCard>
        <TableToolbar
          left={
            <span className="type-subsection">
              Матеріали
              <span className="type-caption ml-1.5 font-normal">{visibleMaterials.length}</span>
            </span>
          }
        />
        <Table>
          <THead>
            <TH className="min-w-[12rem] w-[38%]">Матеріал</TH>
            <TH align="right">Норма / виріб</TH>
            {!hideCosts ? <TH align="right">Відходи</TH> : null}
            {!hideCosts ? <TH align="right">Ціна</TH> : null}
            {!hideCosts ? <TH align="right">Собівартість / од.</TH> : null}
          </THead>
          <TBody>
            {visibleMaterials.length === 0 ? (
              <TableEmpty
                colSpan={hideCosts ? 2 : 5}
                icon={<IconMaterials size={20} />}
                title={sizeScope === ALL_SIZES ? "Матеріалів ще немає" : `Немає для ${sizeScope}`}
                description="Додайте рядок знизу — як у картці виробу."
              />
            ) : (
              visibleMaterials.map((row) => {
                const baseUnitCost = row.unitCost;
                const displayUnitCost = scopeIsOversize
                  ? baseUnitCost * OVERSIZE_DEFAULT_COEFFS.materialCoeff
                  : baseUnitCost;
                const oversizeNorm =
                  !hideCosts && (hasOversizeSizes || scopeIsOversize)
                    ? effectiveOversizeConsumption(row.consumption)
                    : null;
                const showSupplierColor =
                  (row.supplierOffers?.length ?? 0) > 0 ||
                  (row.materialAvailableColors?.length ?? 0) > 0 ||
                  Boolean(row.supplierId) ||
                  Boolean(row.colorSnapshot);
                const rowBusy = isBusy(`material:${row.id}`);
                return (
                  <TR
                    key={row.id}
                    className={cn(
                      !hideCosts && "cursor-pointer hover:bg-[var(--color-surface-subtle)]",
                      selectedMaterialId === row.id && "bg-[var(--color-primary-50)]/40",
                      busyRowClass(rowBusy),
                    )}
                    aria-busy={rowBusy || undefined}
                    onClick={() => {
                      if (hideCosts || rowBusy) return;
                      setSelectedMaterialId(row.id);
                    }}
                  >
                    <TD title={row.name} className="min-w-[12rem] w-[38%] py-1.5 align-top">
                      <div className="space-y-1">
                        <div className="flex min-w-0 items-start gap-1">
                          <div className="min-w-0 flex-1">
                            <CellStack
                              title={row.name}
                              subtitle={
                                [
                                  row.sizeCode ? `Лише ${row.sizeCode}` : null,
                                  !hideCosts && row.pricingHint ? row.pricingHint : null,
                                ]
                                  .filter(Boolean)
                                  .join(" · ") || undefined
                              }
                              wrap
                            />
                            {row.specHint ? (
                              <p
                                className="mt-0.5 truncate text-[11.5px] leading-snug text-[var(--color-text-quiet)]"
                                title={row.specHint}
                              >
                                {row.specHint}
                              </p>
                            ) : null}
                          </div>
                          <RowBusyMark busy={rowBusy} />
                          {!locked ? (
                            <button
                              type="button"
                              aria-label={`Прибрати ${row.name}`}
                              title="Прибрати матеріал"
                              disabled={rowBusy}
                              onClick={(event) => {
                                event.stopPropagation();
                                setRemoveTarget({ kind: "material", id: row.id, name: row.name });
                              }}
                              className="shrink-0 rounded-[var(--radius-control)] p-1.5 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
                            >
                              <IconTrash size={16} />
                            </button>
                          ) : null}
                        </div>
                        {showSupplierColor && !hideCosts ? (
                          <OrderMaterialSupplierColorEditor
                            orderId={orderId}
                            orderItemMaterialId={row.id}
                            supplierId={row.supplierId ?? null}
                            deliveryType={row.deliveryType ?? null}
                            color={row.colorSnapshot ?? null}
                            offers={row.supplierOffers ?? []}
                            materialFallbackColors={row.materialAvailableColors}
                            readOnly={locked || rowBusy}
                          />
                        ) : null}
                      </div>
                    </TD>
                    <TD numeric className="py-1.5">
                      {locked ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="inline-flex items-center justify-end gap-1">
                            <span className="tabular">{row.consumption}</span>
                            <span className="text-[12px] text-[var(--color-text-secondary)]">
                              {row.unit}
                            </span>
                          </span>
                          {oversizeNorm != null ? (
                            <span className="text-[10px] text-[var(--color-text-quiet)]">
                              {OVERSIZE_RANGE_LABEL} ≈ {oversizeNorm} {row.unit}
                            </span>
                          ) : null}
                        </span>
                      ) : (
                        <span className="inline-flex items-center justify-end gap-1">
                          <input
                            type="number"
                            min={0}
                            step="0.0001"
                            defaultValue={row.consumption}
                            disabled={rowBusy}
                            onBlur={(event) => {
                              const next = Math.max(0, Number(event.target.value) || 0);
                              if (next === row.consumption) return;
                              saveMaterialConsumption(row.id, next);
                            }}
                            onClick={(event) => event.stopPropagation()}
                            className="h-7 w-[72px] rounded-[6px] border border-[var(--color-border)] bg-white px-1 text-right text-[12.5px] tabular outline-none focus:border-[var(--color-primary-500)] disabled:opacity-60"
                          />
                          <span className="text-[12px] text-[var(--color-text-secondary)]">
                            {row.unit}
                          </span>
                        </span>
                      )}
                    </TD>
                    {!hideCosts ? (
                      <TD numeric className="py-1.5">
                        {locked ? (
                          <span className="text-[var(--color-text-secondary)]">{row.waste}%</span>
                        ) : (
                          <span
                            className="inline-flex items-center justify-end gap-0.5"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <input
                              type="number"
                              min={0}
                              step="0.01"
                              defaultValue={row.waste}
                              disabled={rowBusy}
                              onBlur={(event) => {
                                const next = Math.max(0, Number(event.target.value) || 0);
                                if (next === row.waste) return;
                                saveMaterialWaste(row.id, next);
                              }}
                              className="h-7 w-[56px] rounded-[6px] border border-[var(--color-border)] bg-white px-1 text-right text-[12.5px] tabular outline-none focus:border-[var(--color-primary-500)] disabled:opacity-60"
                            />
                            <span className="text-[12px] text-[var(--color-text-secondary)]">%</span>
                          </span>
                        )}
                      </TD>
                    ) : null}
                    {!hideCosts ? (
                      <TD numeric className="py-1.5 text-[var(--color-text-secondary)]">
                        {formatMoneyUah(row.price)}
                      </TD>
                    ) : null}
                    {!hideCosts ? (
                      <TD numeric className="py-1.5 font-medium">
                        {formatMoneyUah(displayUnitCost)}
                      </TD>
                    ) : null}
                  </TR>
                );
              })
            )}
          </TBody>
          {materials.length > 0 && !hideCosts ? (
            <TFoot>
              <tr>
                <TD colSpan={4} className="text-[var(--color-text-secondary)]">
                  Разом матеріали
                </TD>
                <TD numeric>
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-medium">
                      {formatMoneyUah(
                        totalQuantity > 0 ? materialsSubtotal / totalQuantity : 0,
                      )}
                    </span>
                    <span className="type-caption">
                      разом {formatMoneyUah(materialsSubtotal)}
                    </span>
                  </span>
                </TD>
              </tr>
            </TFoot>
          ) : null}
        </Table>
        {!locked ? (
          <InlineAddOrderMaterial
            orderId={orderId}
            itemId={itemId}
            materials={materialOptions}
            units={unitOptions}
            sizeCode={sizeScope}
            hideCosts={hideCosts}
            canCreateCatalog={canCreateCatalog}
          />
        ) : null}
      </TableCard>

      <TableCard>
        <TableToolbar
          left={
            <span className="type-subsection">
              Операції
              <span className="type-caption ml-1.5 font-normal">{visibleOperations.length}</span>
            </span>
          }
        />
        <Table>
          <THead>
            <TH>Назва</TH>
            <TH>Метод</TH>
            {!hideCosts ? <TH align="right">/од.</TH> : null}
            {!locked ? <TH width="40px" /> : null}
          </THead>
          <TBody>
            {visibleOperations.length === 0 ? (
              <TableEmpty
                colSpan={(hideCosts ? 2 : 3) + (locked ? 0 : 1)}
                icon={<IconOperations size={20} />}
                title={sizeScope === ALL_SIZES ? "Порожньо" : `Немає для ${sizeScope}`}
                description="Додайте рядок знизу."
              />
            ) : (
              visibleOperations.map((row) => {
                const rowBusy = isBusy(`operation:${row.id}`);
                return (
                  <TR key={row.id} className={busyRowClass(rowBusy)} aria-busy={rowBusy || undefined}>
                    <TD className="py-1.5 font-medium">
                      <span className="inline-flex items-center">
                        {row.name}
                        <RowBusyMark busy={rowBusy} />
                      </span>
                      {row.sizeCode ? (
                        <span className="type-caption ml-1.5">лише {row.sizeCode}</span>
                      ) : null}
                    </TD>
                    <TD className="py-1.5 text-[var(--color-text-secondary)]">
                      {operationMethodLabel(row.method)}
                    </TD>
                    {!hideCosts ? (
                      <TD numeric className="py-1.5 font-medium">
                        {formatMoneyUah(row.unitCost)}
                      </TD>
                    ) : null}
                    {!locked ? (
                      <TD align="center" className="py-1.5">
                        <button
                          type="button"
                          aria-label={`Прибрати ${row.name}`}
                          disabled={rowBusy}
                          onClick={() =>
                            setRemoveTarget({ kind: "operation", id: row.id, name: row.name })
                          }
                          className="rounded-[var(--radius-control)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
                        >
                          <IconTrash size={15} />
                        </button>
                      </TD>
                    ) : null}
                  </TR>
                );
              })
            )}
          </TBody>
          {operations.length > 0 && !hideCosts ? (
            <TFoot>
              <tr>
                <TD colSpan={2} className="text-[var(--color-text-secondary)]">
                  Разом операції
                </TD>
                <TD numeric>
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-medium">
                      {formatMoneyUah(
                        totalQuantity > 0 ? operationsSubtotal / totalQuantity : 0,
                      )}
                    </span>
                    <span className="type-caption">
                      разом {formatMoneyUah(operationsSubtotal)}
                    </span>
                  </span>
                </TD>
                {!locked ? <TD /> : null}
              </tr>
            </TFoot>
          ) : null}
        </Table>
        {!locked ? (
          <InlineAddOrderOperation
            orderId={orderId}
            itemId={itemId}
            operations={operationOptions}
            sizeCode={sizeScope}
            canCreateCatalog={canCreateCatalog}
          />
        ) : null}
      </TableCard>

      <TableCard>
        <TableToolbar
          left={
            <span className="type-subsection">
              {FIXED_COST_LINE_NAME_UK}
            </span>
          }
          right={
            <span className="type-caption">
              {companySewerCount} швей · довідник ПВ
            </span>
          }
        />
        <Table>
          <THead>
            <TH>Назва</TH>
            <TH>Метод</TH>
            {!hideCosts ? <TH align="right">/од.</TH> : null}
            {!locked ? <TH width="40px" /> : null}
          </THead>
          <TBody>
            {!hideCosts && fixedCostAllocation && fixedCostAllocation.fixedCostTotal > 0 ? (
              <TR>
                <TD className="py-1.5 font-medium">{FIXED_COST_LINE_NAME_UK}</TD>
                <TD className="py-1.5 text-[var(--color-text-secondary)]">
                  Коеф. {fixedCostAllocation.metrics.coefficient.toFixed(1)}
                </TD>
                <TD numeric className="py-1.5 font-medium">
                  {formatMoneyUah(fixedCostAllocation.fixedCostPerUnit)}
                </TD>
                {!locked ? <TD /> : null}
              </TR>
            ) : (
              <TR muted>
                <TD colSpan={(hideCosts ? 2 : 3) + (locked ? 0 : 1)} className="py-1.5">
                  {fixedCostError ? (
                    <OrderFixedCostError error={fixedCostError} />
                  ) : (
                    <span className="type-caption">Немає «Пошив» — ПВ = 0.</span>
                  )}
                </TD>
              </TR>
            )}
          </TBody>
          {!hideCosts && fixedCostAllocation && fixedCostAllocation.fixedCostTotal > 0 ? (
            <TFoot>
              <tr>
                <TD colSpan={2} className="text-[var(--color-text-secondary)]">
                  Разом ПВ
                </TD>
                <TD numeric>
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-medium">
                      {formatMoneyUah(
                        totalQuantity > 0
                          ? fixedCostAllocation.fixedCostTotal / totalQuantity
                          : 0,
                      )}
                    </span>
                    <span className="type-caption">
                      разом {formatMoneyUah(fixedCostAllocation.fixedCostTotal)}
                    </span>
                  </span>
                </TD>
                {!locked ? <TD /> : null}
              </tr>
            </TFoot>
          ) : null}
        </Table>
      </TableCard>

      <TableCard>
        <TableToolbar
          left={
            <span className="type-subsection">
              Нанесення
              <span className="type-caption ml-1.5 font-normal">{decorations.length}</span>
            </span>
          }
        />
        <Table className="table-fixed">
          <THead>
            <TH>Метод</TH>
            {!hideCosts ? (
              <TH align="right" width="88px" title="Один раз на партію">
                Приладка
              </TH>
            ) : null}
            {!hideCosts ? (
              <TH align="right" width="72px" title="За одиницю">
                /шт
              </TH>
            ) : null}
            {!locked ? <TH width="40px" /> : null}
          </THead>
          <TBody>
            {decorations.length === 0 ? (
              <TableEmpty
                colSpan={locked ? (hideCosts ? 1 : 3) : hideCosts ? 2 : 4}
                icon={<IconDecoration size={20} />}
                title="Без нанесення"
                description={
                  locked
                    ? "Нанесення не додано."
                    : "Оберіть формат нижче — можна додати кілька разів."
                }
              />
            ) : (
              decorations.map((row) => {
                const rowBusy = isBusy(`decoration:${row.id}`);
                return (
                  <TR key={row.id} className={busyRowClass(rowBusy)} aria-busy={rowBusy || undefined}>
                    <TD className="min-w-0 py-1.5">
                      <span className="inline-flex min-w-0 items-center gap-1">
                        <CellStack title={decorationLabel(row.name)} maxWidth="100%" />
                        <RowBusyMark busy={rowBusy} />
                      </span>
                    </TD>
                    {!hideCosts ? (
                      <TD numeric className="py-1.5">
                        {locked ? (
                          <span className="text-[var(--color-text-secondary)]">
                            {row.setupCost > 0 ? formatMoneyUah(row.setupCost) : "—"}
                          </span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            defaultValue={row.setupCost > 0 ? row.setupCost : ""}
                            placeholder="—"
                            disabled={rowBusy}
                            onBlur={(event) => {
                              const raw = event.target.value.trim();
                              const next = raw === "" ? 0 : Math.max(0, Number(raw) || 0);
                              event.target.value = next > 0 ? String(next) : "";
                              if (next === row.setupCost) return;
                              saveDecorationRates(row.id, next, row.unitRate);
                            }}
                            className="h-7 w-[72px] rounded-[6px] border border-[var(--color-border)] bg-white px-1 text-right text-[12.5px] tabular outline-none placeholder:text-[var(--color-text-quiet)] focus:border-[var(--color-primary-500)] disabled:opacity-60"
                            title="Приладка (разово на партію). Можна лишити порожнім."
                          />
                        )}
                      </TD>
                    ) : null}
                    {!hideCosts ? (
                      <TD numeric className="py-1.5">
                        {locked ? (
                          <span className="font-medium">{formatMoneyUah(row.unitRate)}</span>
                        ) : (
                          <input
                            type="number"
                            min={0}
                            step="0.1"
                            defaultValue={row.unitRate}
                            disabled={rowBusy}
                            onBlur={(event) => {
                              const next = Math.max(0, Number(event.target.value) || 0);
                              if (next === row.unitRate) return;
                              saveDecorationRates(row.id, row.setupCost, next);
                            }}
                            className="h-7 w-[64px] rounded-[6px] border border-[var(--color-border)] bg-white px-1 text-right text-[12.5px] tabular outline-none focus:border-[var(--color-primary-500)] disabled:opacity-60"
                            title="Ставка за виріб"
                          />
                        )}
                      </TD>
                    ) : null}
                    {!locked ? (
                      <TD align="center" className="py-1.5">
                        <button
                          type="button"
                          aria-label={`Прибрати ${decorationLabel(row.name)}`}
                          disabled={rowBusy}
                          onClick={() =>
                            setRemoveTarget({
                              kind: "decoration",
                              id: row.id,
                              name: decorationLabel(row.name),
                            })
                          }
                          className="rounded-[var(--radius-control)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
                        >
                          <IconTrash size={15} />
                        </button>
                      </TD>
                    ) : null}
                  </TR>
                );
              })
            )}
          </TBody>
          {decorations.length > 0 && !hideCosts ? (
            <TFoot>
              <tr>
                <TD className="min-w-0 truncate text-[var(--color-text-secondary)]">
                  Разом нанесення
                </TD>
                <TD numeric>
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-medium">{formatMoneyUah(decorationSetupTotal)}</span>
                    <span className="type-caption">приладки</span>
                  </span>
                </TD>
                <TD numeric>
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <span className="font-medium">
                      {formatMoneyUah(decorationUnitRateTotal)}
                    </span>
                    <span className="type-caption">
                      разом {formatMoneyUah(decorationsSubtotal)}
                    </span>
                  </span>
                </TD>
                {!locked ? <TD /> : null}
              </tr>
            </TFoot>
          ) : null}
        </Table>
        <OrderDecorationFormatPicker
          orderId={orderId}
          orderItemId={itemId}
          quantity={totalQuantity}
          formats={decorationFormats}
          locked={locked}
          hideCosts={hideCosts}
        />
      </TableCard>

      <Modal
        open={Boolean(removeTarget)}
        onClose={() => setRemoveTarget(null)}
        title="Прибрати рядок?"
        description="Еталон виробу не зміниться"
        width="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setRemoveTarget(null)} disabled={pending}>
              Скасувати
            </Button>
            <Button variant="danger" onClick={confirmRemove} disabled={pending}>
              {pending ? "…" : "Прибрати"}
            </Button>
          </>
        }
      >
        <p className="type-body">{removeTarget?.name} — собівартість перерахується одразу.</p>
      </Modal>

      <OrderMaterialDetailPanel
        orderId={orderId}
        orderItemMaterialId={selectedMaterialId}
        locked={locked}
        onClose={() => setSelectedMaterialId(null)}
      />
    </div>
  );
}

function InlineAddOrderMaterial({
  orderId,
  itemId,
  materials,
  units,
  sizeCode,
  hideCosts = false,
  canCreateCatalog = false,
}: {
  orderId: string;
  itemId: string;
  materials: Array<{
    id: string;
    label: string;
    composition?: string | null;
    densityGsm?: string | null;
    supplierNames?: string[];
  }>;
  units: Array<{ id: string; label: string }>;
  sizeCode: string;
  hideCosts?: boolean;
  canCreateCatalog?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [materialId, setMaterialId] = useState("");
  const [consumption, setConsumption] = useState("1");
  const [waste, setWaste] = useState("");

  function submit(nextMaterialId = materialId) {
    if (!nextMaterialId) return;
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("orderItemId", itemId);
    formData.set("materialId", nextMaterialId);
    formData.set("consumptionPerUnit", consumption || "1");
    formData.set("wastePercent", hideCosts ? "" : waste);
    formData.set("sizeCode", sizeCode);
    startTransition(async () => {
      await addOrderMaterialAction(formData);
      setMaterialId("");
      setConsumption("1");
      setWaste("");
      router.refresh();
    });
  }

  return (
    <SoftBusy busy={pending} label="Додаємо матеріал…">
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] bg-[var(--color-surface-subtle)] px-3 py-2">
      <Select
        size="sm"
        className="min-w-[160px] flex-1"
        value={materialId}
        disabled={pending}
        onChange={(event) => setMaterialId(event.target.value)}
        aria-label="Матеріал з каталогу"
      >
        <option value="">+ матеріал…</option>
        {materials.map((row) => (
          <option
            key={row.id}
            value={row.id}
            data-description={materialOptionDescription(
              row.densityGsm,
              row.composition,
              row.supplierNames,
            )}
          >
            {row.label}
          </option>
        ))}
      </Select>
      <input
        type="number"
        min={0}
        step="0.0001"
        value={consumption}
        onChange={(event) => setConsumption(event.target.value)}
        aria-label="Норма"
        title="Норма"
        className="h-8 w-[68px] rounded-[6px] border border-[var(--color-border)] bg-white px-1.5 text-right text-[12.5px] tabular outline-none focus:border-[var(--color-primary-500)]"
      />
      {!hideCosts ? (
        <input
          type="number"
          min={0}
          step="0.01"
          value={waste}
          placeholder="%"
          title="Відходи %"
          aria-label="Відходи %"
          onChange={(event) => setWaste(event.target.value)}
          className="h-8 w-[56px] rounded-[6px] border border-[var(--color-border)] bg-white px-1.5 text-right text-[12.5px] tabular outline-none placeholder:text-[11px] focus:border-[var(--color-primary-500)]"
        />
      ) : null}
      <Button
        type="button"
        size="sm"
        disabled={!materialId || pending}
        loading={pending}
        onClick={() => submit()}
        className="inline-flex items-center gap-1"
      >
        <IconPlus size={14} />
        Додати
      </Button>
      {canCreateCatalog ? (
        <MaterialCreatePanel
          units={units}
          variant="ghost"
          size="sm"
          triggerLabel="Новий"
          onCreated={(result) => {
            const id = typeof result.materialId === "string" ? result.materialId : null;
            if (id) submit(id);
          }}
        />
      ) : null}
      </div>
    </SoftBusy>
  );
}

function InlineAddOrderOperation({
  orderId,
  itemId,
  operations,
  sizeCode,
  canCreateCatalog = false,
}: {
  orderId: string;
  itemId: string;
  operations: Array<{ id: string; label: string }>;
  sizeCode: string;
  canCreateCatalog?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [operationId, setOperationId] = useState("");

  function submit(nextId = operationId) {
    if (!nextId) return;
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("orderItemId", itemId);
    formData.set("operationId", nextId);
    formData.set("sizeCode", sizeCode);
    startTransition(async () => {
      await addOrderOperationAction(formData);
      setOperationId("");
      router.refresh();
    });
  }

  return (
    <SoftBusy busy={pending} label="Додаємо операцію…">
      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] bg-[var(--color-surface-subtle)] px-3 py-2">
      <Select
        size="sm"
        className="min-w-[180px] flex-1"
        value={operationId}
        disabled={pending}
        onChange={(event) => setOperationId(event.target.value)}
        aria-label="Операція з каталогу"
      >
        <option value="">+ операція…</option>
        {operations.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
          </option>
        ))}
      </Select>
      <Button
        type="button"
        size="sm"
        disabled={!operationId || pending}
        loading={pending}
        onClick={() => submit()}
        className="inline-flex items-center gap-1"
      >
        <IconPlus size={14} />
        Додати
      </Button>
      {canCreateCatalog ? (
        <OperationCreatePanel
          variant="ghost"
          size="sm"
          triggerLabel="Нова"
          onCreated={(result) => {
            const id = typeof result.operationId === "string" ? result.operationId : null;
            if (id) submit(id);
          }}
        />
      ) : null}
      </div>
    </SoftBusy>
  );
}
