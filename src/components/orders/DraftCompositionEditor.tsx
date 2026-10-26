"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Page";
import { SizeRun } from "@/components/orders/SizeRun";
import {
  ProductThumb,
  type CatalogProduct,
  type DraftComposition,
} from "@/components/orders/ProductCatalogPanel";
import { DraftCompositionBomEditor } from "@/components/composition/DraftCompositionBomEditor";
import {
  type DecorationCatalogOption,
  type MaterialCatalogOption,
  type OperationCatalogOption,
} from "@/components/composition/DraftCompositionForms";
import { syncDraftMaterialPrices, compositionMissingMaterialChoices } from "@/lib/draft-composition";
import type { MaterialCostVatMode } from "@/lib/fabric-pricing";
import { cn } from "@/lib/utils";

export {
  DraftAddDecorationForm,
  DraftAddMaterialForm,
  DraftAddOperationForm,
  type DecorationCatalogOption,
  type MaterialCatalogOption,
  type OperationCatalogOption,
} from "@/components/composition/DraftCompositionForms";

export { cloneComposition, materialUnitCost } from "@/lib/draft-composition";

const TOTAL_SIZE = { code: "ONE", nameUk: "Тираж (орієнтовно)" };

/**
 * Left-workspace: review/edit product composition before adding the line to the order list.
 * Edits stay on the order draft — catalog product is never mutated.
 */
export function DraftCompositionEditor({
  product,
  composition,
  quantities,
  comment,
  editing,
  inList = false,
  confirmLabel,
  materialOptions = [],
  operationOptions = [],
  decorationOptions = [],
  unitOptions = [],
  onMaterialCatalogAdd,
  onMaterialCatalogColorsChange,
  onOperationCatalogAdd,
  onDecorationCatalogAdd,
  onQuantitiesChange,
  onCommentChange,
  onCompositionChange,
  onCancel,
  onConfirm,
  confirmDisabled,
  companyCostMode = "NET",
  fabricGlobals,
  /** Order create: color / ПДВ are chosen later inside the order, not here. */
  enableLinePricingControls = false,
  showSubtotals = true,
  /**
   * `fixed` — pinned above the create footer (order /new).
   * `inline` — sticky under BOM (default / in-order flows).
   */
  tirageDock = "inline",
}: {
  product: CatalogProduct;
  composition: DraftComposition;
  quantities: Record<string, number>;
  comment: string;
  editing?: boolean;
  /** Line already in the order list and no unsaved edits. */
  inList?: boolean;
  confirmLabel?: string;
  materialOptions?: MaterialCatalogOption[];
  operationOptions?: OperationCatalogOption[];
  decorationOptions?: DecorationCatalogOption[];
  unitOptions?: Array<{ id: string; label: string }>;
  onMaterialCatalogAdd?: (option: MaterialCatalogOption) => void;
  onMaterialCatalogColorsChange?: (materialId: string, colors: string[]) => void;
  onOperationCatalogAdd?: (option: OperationCatalogOption) => void;
  onDecorationCatalogAdd?: (option: DecorationCatalogOption) => void;
  onQuantitiesChange: (code: string, quantity: number) => void;
  onCommentChange: (value: string) => void;
  onCompositionChange: (next: DraftComposition) => void;
  onCancel: () => void;
  onConfirm: () => void;
  confirmDisabled?: boolean;
  companyCostMode?: MaterialCostVatMode;
  fabricGlobals?: { usdUahRate: number; fabricCargoUsdPerKg: number };
  enableLinePricingControls?: boolean;
  showSubtotals?: boolean;
  tirageDock?: "inline" | "fixed";
}) {
  const productSizes = product.sizes.length
    ? product.sizes
    : [{ code: "ONE", nameUk: "Без розміру" }];
  const hasRealSizes = product.sizes.length > 0;
  const startsAsTotal =
    !hasRealSizes ||
    ((quantities.ONE ?? 0) > 0 &&
      productSizes.every((size) => size.code === "ONE" || !(quantities[size.code] > 0)));
  const [qtyMode, setQtyMode] = useState<"bySize" | "total">(
    hasRealSizes && !startsAsTotal ? "bySize" : "total",
  );

  const sizes = qtyMode === "total" ? [TOTAL_SIZE] : productSizes;
  const compositionReady = composition.materials.length > 0 && composition.operations.length > 0;
  const incompleteMaterials = enableLinePricingControls
    ? compositionMissingMaterialChoices(composition, {
        enableLinePricingControls: true,
        companyCostMode,
      })
    : [];
  const choicesComplete = incompleteMaterials.length === 0;
  const compositionReadyLabel = !compositionReady
    ? "Потрібен склад"
    : enableLinePricingControls && !choicesComplete
      ? `Потрібен вибір · ${incompleteMaterials.length}`
      : null;

  const totalQty = sizes.reduce((sum, size) => sum + (quantities[size.code] || 0), 0);
  const productLabel = product.nameUk ?? product.label;

  function applyQtyMode(next: "bySize" | "total") {
    if (next === qtyMode) return;
    setQtyMode(next);
    if (next === "total") {
      const total = productSizes.reduce((sum, size) => sum + (quantities[size.code] || 0), 0);
      const fromOne = quantities.ONE || 0;
      const value = total > 0 ? total : fromOne;
      for (const size of productSizes) {
        if (size.code !== "ONE") onQuantitiesChange(size.code, 0);
      }
      onQuantitiesChange("ONE", value);
      onCompositionChange(
        syncDraftMaterialPrices(composition, { ONE: value }, companyCostMode),
      );
      return;
    }
    const total = quantities.ONE || 0;
    onQuantitiesChange("ONE", 0);
    if (productSizes.length === 1) {
      onQuantitiesChange(productSizes[0]!.code, total);
      onCompositionChange(
        syncDraftMaterialPrices(
          composition,
          { [productSizes[0]!.code]: total },
          companyCostMode,
        ),
      );
    }
  }

  function onQtyChange(code: string, quantity: number) {
    onQuantitiesChange(code, quantity);
    const nextQty = { ...quantities, [code]: quantity };
    onCompositionChange(syncDraftMaterialPrices(composition, nextQty, companyCostMode));
  }

  const statusHint = confirmDisabled ? (
    <span className="type-caption text-[var(--color-text-tertiary)]">
      {enableLinePricingControls && incompleteMaterials.length > 0
        ? `${incompleteMaterials.length} без параметрів`
        : inList
          ? "змініть тираж або склад, щоб знову зберегти"
          : "вкажіть кількість"}
    </span>
  ) : (
    <span className="type-caption text-[var(--color-primary-700)]">
      {editing ? "є зміни — збережіть у список" : "готово до додавання"}
    </span>
  );

  const tirageBody = (
    <div className="space-y-2">
      {tirageDock === "fixed" ? (
        <div className="flex min-w-0 items-center gap-2">
          <ProductThumb
            imageUrl={product.imageUrl}
            label={productLabel}
            active
            size="sm"
          />
          <div className="min-w-0">
            <p className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
              {productLabel}
            </p>
            <p className="type-caption truncate">
              {totalQty > 0
                ? `Разом ${totalQty} шт`
                : "Виріб обрано — впишіть тираж, щоб додати в замовлення"}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="shrink-0 text-[11px] font-medium text-[var(--color-text-tertiary)]">
          К-сть
        </span>
        {hasRealSizes ? (
          <div className="inline-flex rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-0.5">
            <button
              type="button"
              onClick={() => applyQtyMode("total")}
              className={`rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${
                qtyMode === "total"
                  ? "bg-white text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-secondary)]"
              }`}
            >
              Загальний тираж
            </button>
            <button
              type="button"
              onClick={() => applyQtyMode("bySize")}
              className={`rounded-[5px] px-2 py-0.5 text-[11px] font-medium ${
                qtyMode === "bySize"
                  ? "bg-white text-[var(--color-text-primary)] shadow-sm"
                  : "text-[var(--color-text-secondary)]"
              }`}
            >
              По розмірах
            </button>
          </div>
        ) : null}
        <SizeRun sizes={sizes} quantities={quantities} quiet onChange={onQtyChange} />
        {tirageDock === "inline" ? statusHint : null}
        {tirageDock === "fixed" && totalQty > 0 ? (
          <span className="type-caption tabular text-[var(--color-text-secondary)]">
            Разом {totalQty} шт
          </span>
        ) : null}
        {tirageDock === "fixed" ? statusHint : null}
      </div>

      {qtyMode === "total" && hasRealSizes ? (
        <p className="type-caption text-[var(--color-text-tertiary)]">
          Орієнтовний тираж без розкладки по розмірах. Точну сітку задасте перед виробництвом у
          комплектації замовлення.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] pt-2">
        <input
          type="text"
          value={comment}
          onChange={(event) => onCommentChange(event.target.value)}
          placeholder="Коментар (необовʼязково)"
          className="h-8 min-w-[160px] flex-1 rounded-[6px] border border-[var(--color-border)] bg-transparent px-2.5 text-[12.5px] outline-none placeholder:text-[var(--color-text-tertiary)] focus:border-[var(--color-primary-500)]"
        />
        <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
          Скасувати
        </Button>
        <Button type="button" size="sm" disabled={confirmDisabled} onClick={onConfirm}>
          {confirmLabel ?? (editing ? "Зберегти в список" : "Погодити і додати")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={cn("space-y-3", tirageDock === "fixed" && "pb-[11rem]")}>
      <div className="flex flex-wrap items-start justify-between gap-2 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2.5 shadow-[var(--shadow-card)]">
        <div className="flex min-w-0 flex-1 gap-3">
          <ProductThumb
            imageUrl={product.imageUrl}
            label={productLabel}
            active
            size="lg"
          />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="type-subsection truncate">
                {editing ? "Редагування складу" : "Склад позиції"}
              </h3>
              {inList ? (
                <StatusBadge tone="success" dot>
                  У списку
                </StatusBadge>
              ) : compositionReadyLabel ? (
                <StatusBadge tone="warning" dot>
                  {compositionReadyLabel}
                </StatusBadge>
              ) : totalQty <= 0 ? (
                <StatusBadge tone="warning" dot>
                  Потрібен тираж
                </StatusBadge>
              ) : null}
            </div>
            <p className="type-caption mt-0.5 truncate">
              {productLabel}
              {inList
                ? " · збережено нижче в «Позиції замовлення»"
                : enableLinePricingControls && !choicesComplete
                  ? " · оберіть колір і ПДВ у рядках з маркером"
                  : tirageDock === "fixed"
                    ? " · тираж — у панелі внизу екрана"
                    : " · вкажіть тираж і натисніть кнопку нижче"}
            </p>
          </div>
        </div>
        {tirageDock === "inline" ? (
          <div className="flex shrink-0 flex-wrap items-center gap-1.5">
            <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
              Скасувати
            </Button>
            <Button type="button" size="sm" disabled={confirmDisabled} onClick={onConfirm}>
              {confirmLabel ?? (editing ? "Зберегти в список" : "Погодити і додати")}
            </Button>
          </div>
        ) : null}
      </div>

      <DraftCompositionBomEditor
        composition={composition}
        onCompositionChange={onCompositionChange}
        sizes={productSizes}
        materialOptions={materialOptions}
        operationOptions={operationOptions}
        decorationOptions={decorationOptions}
        unitOptions={unitOptions}
        onMaterialCatalogAdd={onMaterialCatalogAdd}
        onMaterialCatalogColorsChange={onMaterialCatalogColorsChange}
        onOperationCatalogAdd={onOperationCatalogAdd}
        onDecorationCatalogAdd={onDecorationCatalogAdd}
        quantitiesBySize={quantities}
        enableLinePricingControls={enableLinePricingControls}
        showSubtotals={showSubtotals}
        companyCostMode={companyCostMode}
        fabricGlobals={fabricGlobals}
      />

      {tirageDock === "inline" ? (
        <div className="sticky bottom-14 z-10 space-y-2 rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 shadow-[var(--shadow-card)]">
          {tirageBody}
        </div>
      ) : (
        <FixedTirageDock>{tirageBody}</FixedTirageDock>
      )}
    </div>
  );
}

/** Pinned above OrderCreateFooter (h-12) for create flow. */
function FixedTirageDock({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-12 z-40 md:left-[var(--sidebar-width)]"
      role="region"
      aria-label="Тираж позиції"
    >
      <div className="pointer-events-auto border-t border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2.5 shadow-[0_-6px_20px_rgba(15,23,32,0.08)] sm:px-6 xl:px-8">
        <div className="mx-auto max-w-[1440px]">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
