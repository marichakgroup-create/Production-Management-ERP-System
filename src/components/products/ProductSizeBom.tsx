"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition, type CSSProperties, type DragEvent } from "react";
import { useRouter } from "next/navigation";
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
import { IconGrip } from "@/components/ui/Icons";
import { RowEditActions, ROW_DIRTY_CLASS } from "@/components/ui/RowEditActions";
import { formatMoneyUah, formatUnit, cn } from "@/lib/utils";
import { OversizeCoeffFields } from "@/components/catalog/OversizeCoeffFields";
import {
  isOversizeCode,
  OVERSIZE_RANGE_LABEL,
  resolveOversizeUplift,
  type SizeCoeffRule,
} from "@/lib/size-coeffs";
import { materialOptionDescription } from "@/lib/material-catalog-options";
import { ALL_SIZES } from "@/lib/size-bom";
import {
  removeProductMaterialAction,
  removeProductOperationAction,
  reorderProductBomAction,
  updateProductMaterialConsumptionAction,
  updateProductMaterialWasteAction,
  updateProductOperationRateAction,
} from "@/server/domains/products/actions";
import {
  AddProductMaterialPanel,
  AddProductOperationPanel,
  ProductAddMaterialBar,
} from "@/app/(app)/products/[id]/ProductCompositionForms";
import { ProductOperationRateEditor } from "@/components/products/ProductOperationRateEditor";
import { useProductPreviewQty } from "@/components/products/ProductPreviewQtyContext";
import { ProductMaterialSupplierColorEditor } from "@/components/catalog/SupplierColorFields";
import {
  isCutOperationName,
  CUT_RATES_TAB_HINT,
  summarizeCutOperationDisplay,
  type CutRateTier,
} from "@/lib/cut-rate";
import { isDeliveryOperationName, resolveQuantityTierRate } from "@/lib/quantity-tiers";
import { isFixedCostOperationName } from "@/lib/fixed-costs";

function moveIdRelative(
  ids: string[],
  fromId: string,
  targetId: string,
  edge: "before" | "after",
): string[] {
  if (fromId === targetId) return ids;
  const without = ids.filter((id) => id !== fromId);
  let to = without.indexOf(targetId);
  if (to < 0) return ids;
  if (edge === "after") to += 1;
  without.splice(to, 0, fromId);
  return without;
}

function dropEdgeFromEvent(event: DragEvent<HTMLElement>): "before" | "after" {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function runWithReorderMotion(apply: () => void) {
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const doc = typeof document !== "undefined" ? document : null;
  if (!reduced && doc && "startViewTransition" in doc) {
    (
      doc as Document & { startViewTransition: (cb: () => void) => void }
    ).startViewTransition(apply);
    return;
  }
  apply();
}

function BomDragHandle({
  disabled,
  onDragStart,
}: {
  disabled?: boolean;
  onDragStart: (event: DragEvent) => void;
}) {
  if (disabled) return null;
  return (
    <span
      draggable
      onDragStart={onDragStart}
      onClick={(event) => event.preventDefault()}
      className="inline-flex h-7 w-6 cursor-grab items-center justify-center rounded-[6px] text-[var(--color-text-secondary)] transition-colors active:cursor-grabbing hover:bg-[var(--color-primary-50)] hover:text-[var(--color-primary-700)]"
      title="Перетягніть, щоб змінити порядок"
      aria-label="Перемістити рядок"
      role="button"
      tabIndex={0}
    >
      <IconGrip size={15} />
    </span>
  );
}
type SizeOpt = { id: string; code: string; nameUk: string };
type MaterialView = {
  id: string;
  name: string;
  unit: string;
  consumption: number;
  waste: number;
  price: number;
  sizeCodes: string[] | null;
  sizeConsumption: Record<string, number>;
  sizeWaste?: Record<string, number>;
  composition?: string | null;
  densityGsm?: string | null;
  supplierId?: string | null;
  deliveryType?: string | null;
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
};
type OperationView = {
  id: string;
  name: string;
  method: string;
  methodCode: string;
  unitCost: number;
  catalogRate?: number;
  rateOverride?: number | null;
  sizeCodes: string[] | null;
  rateTiers: Array<{ minQuantity: number; ratePerUnit: number }>;
  isCut?: boolean;
  cutDisplay?: {
    methodLabel: string;
    configured: boolean;
    minRate: number | null;
    maxRate: number | null;
    previewQty: number;
    previewRate: number | null;
  } | null;
  cutFallbackRate?: number;
};

type CutRateContext = {
  optimalQty: number | null;
  tiers: CutRateTier[];
};

function formatCutCostCell(row: OperationView, previewQty: number, cutRateContext?: CutRateContext) {
  if (!cutRateContext) {
    return { primary: "—", title: CUT_RATES_TAB_HINT };
  }

  const cut = summarizeCutOperationDisplay({
    optimalQty: cutRateContext.optimalQty,
    tiers: cutRateContext.tiers,
    fallbackRate: row.cutFallbackRate ?? 0,
    previewQty,
  });

  if (!cut.configured || cut.previewRate == null) {
    return { primary: "—", title: CUT_RATES_TAB_HINT };
  }

  const range =
    cut.minRate != null && cut.maxRate != null && cut.minRate !== cut.maxRate
      ? `${formatMoneyUah(cut.minRate)}–${formatMoneyUah(cut.maxRate)}`
      : cut.previewRate != null
        ? formatMoneyUah(cut.previewRate)
        : null;

  return {
    primary: range ?? formatMoneyUah(cut.previewRate),
    secondary: "₴/од. залежно від тиражу",
    title: CUT_RATES_TAB_HINT,
  };
}

function deliveryUnitRate(row: OperationView, previewQty: number) {
  return resolveQuantityTierRate({
    quantity: previewQty,
    tiers: row.rateTiers,
    fallbackRate: row.unitCost,
  });
}

const inputClass =
  "h-7 w-[64px] rounded-[6px] border border-[var(--color-border)] bg-white px-1.5 text-right text-[12.5px] tabular outline-none focus:border-[var(--color-primary-500)]";

export function ProductSizeBom({
  productId,
  sizes,
  materials,
  operations,
  decorations,
  materialsSubtotal,
  operationsSubtotal,
  hasCutOperation = false,
  decorationSetupTotal = 0,
  decorationUnitRateTotal = 0,
  materialOptions,
  operationOptions,
  decorationOptions,
  unitOptions,
  cutRateContext,
  hideCosts = false,
  readOnly = false,
  sizeRules = [],
  fixedCostPreview = null,
}: {
  productId: string;
  sizes: SizeOpt[];
  materials: MaterialView[];
  operations: OperationView[];
  decorations: Array<{ id: string; name: string; setupCost: number; unitRate: number }>;
  materialsSubtotal: number;
  operationsSubtotal: number;
  hasCutOperation?: boolean;
  decorationSetupTotal?: number;
  decorationUnitRateTotal?: number;
  materialOptions: Array<{
    id: string;
    label: string;
    unit?: string;
    composition?: string | null;
    densityGsm?: string | null;
    supplierNames?: string[];
  }>;
  operationOptions: Array<{ id: string; label: string }>;
  decorationOptions: Array<{ id: string; label: string }>;
  unitOptions: Array<{ id: string; label: string }>;
  cutRateContext?: CutRateContext;
  hideCosts?: boolean;
  readOnly?: boolean;
  sizeRules?: SizeCoeffRule[];
  fixedCostPreview?: {
    perUnit: number;
    coefficient: number;
    sewingPerUnit: number;
    sewerCount: number;
  } | null;
}) {
  const router = useRouter();
  const previewQty = useProductPreviewQty();
  const [pending, startTransition] = useTransition();
  // Per-size BOM tabs temporarily disabled — one shared spec + oversize % only.
  const sizeScope = ALL_SIZES;
  const [materialIds, setMaterialIds] = useState(() => materials.map((row) => row.id));
  const [operationIds, setOperationIds] = useState(() => operations.map((row) => row.id));
  const [materialDrafts, setMaterialDrafts] = useState<
    Record<string, { consumption: string; waste: string }>
  >({});
  const [operationDrafts, setOperationDrafts] = useState<Record<string, { rate: string }>>({});
  const [dragMaterialId, setDragMaterialId] = useState<string | null>(null);
  const [dragOperationId, setDragOperationId] = useState<string | null>(null);
  const [dropHint, setDropHint] = useState<{
    kind: "materials" | "operations";
    id: string;
    edge: "before" | "after";
  } | null>(null);

  useEffect(() => {
    setMaterialIds(materials.map((row) => row.id));
  }, [materials]);
  useEffect(() => {
    setOperationIds(operations.map((row) => row.id));
  }, [operations]);

  const sizeIdsForAdd: string[] = [];
  const sizeLabelForAdd: string | undefined = undefined;

  const materialsById = useMemo(
    () => new Map(materials.map((row) => [row.id, row])),
    [materials],
  );
  const operationsById = useMemo(
    () => new Map(operations.map((row) => [row.id, row])),
    [operations],
  );
  const orderedMaterials = materialIds
    .map((id) => materialsById.get(id))
    .filter((row): row is MaterialView => Boolean(row));
  const orderedOperations = operationIds
    .map((id) => operationsById.get(id))
    .filter((row): row is OperationView => Boolean(row));

  const canReorder = !readOnly;
  const visibleMaterials = orderedMaterials;
  const visibleOperations = orderedOperations;
  const hasDeliveryOp = operations.some((row) => isDeliveryOperationName(row.name));
  const deliveryOpRow = operations.find((row) => isDeliveryOperationName(row.name));
  const deliveryPerUnit = deliveryOpRow ? deliveryUnitRate(deliveryOpRow, previewQty) : 0;
  const hasOversizeSizes = sizes.some((size) => isOversizeCode(size.code));
  const scopeIsOversize = false;
  const oversizeUplift = resolveOversizeUplift(sizeRules);
  const materialPct = Math.round((oversizeUplift.materialCoeff - 1) * 100);
  const operationPct = Math.round((oversizeUplift.operationCoeff - 1) * 100);

  function persistBomOrder(kind: "materials" | "operations", orderedIds: string[]) {
    startTransition(async () => {
      await reorderProductBomAction({ productId, kind, orderedIds });
      router.refresh();
    });
  }

  function clearDrag() {
    setDragMaterialId(null);
    setDragOperationId(null);
    setDropHint(null);
  }

  useEffect(() => {
    if (!dragMaterialId && !dragOperationId) return;
    function onDragEnd() {
      clearDrag();
    }
    window.addEventListener("dragend", onDragEnd);
    return () => window.removeEventListener("dragend", onDragEnd);
  }, [dragMaterialId, dragOperationId]);

  function previewMaterialDrop(targetId: string, edge: "before" | "after") {
    if (!canReorder || !dragMaterialId) return;
    setDropHint({ kind: "materials", id: targetId, edge });
  }

  function previewOperationDrop(targetId: string, edge: "before" | "after") {
    if (!canReorder || !dragOperationId) return;
    setDropHint({ kind: "operations", id: targetId, edge });
  }

  function dropMaterialOn(targetId: string, edge: "before" | "after") {
    if (!canReorder || !dragMaterialId) return;
    const next = moveIdRelative(materialIds, dragMaterialId, targetId, edge);
    clearDrag();
    if (next.join() === materialIds.join()) return;
    runWithReorderMotion(() => setMaterialIds(next));
    persistBomOrder("materials", next);
  }

  function dropOperationOn(targetId: string, edge: "before" | "after") {
    if (!canReorder || !dragOperationId) return;
    const next = moveIdRelative(operationIds, dragOperationId, targetId, edge);
    clearDrag();
    if (next.join() === operationIds.join()) return;
    runWithReorderMotion(() => setOperationIds(next));
    persistBomOrder("operations", next);
  }

  function removeMaterial(id: string) {
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("id", id);
    startTransition(async () => {
      await removeProductMaterialAction(formData);
      router.refresh();
    });
  }

  function removeOperation(id: string) {
    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("id", id);
    startTransition(async () => {
      await removeProductOperationAction(formData);
      router.refresh();
    });
  }

  function confirmMaterialDraft(
    id: string,
    currentConsumption: number,
    currentWaste: number,
  ) {
    const draft = materialDrafts[id];
    if (!draft) return;
    const nextConsumption = Math.max(0, Number(draft.consumption) || 0);
    const nextWaste = Math.max(0, Number(draft.waste) || 0);
    startTransition(async () => {
      if (Math.abs(nextConsumption - currentConsumption) >= 0.0000001) {
        const formData = new FormData();
        formData.set("productId", productId);
        formData.set("id", id);
        formData.set("consumptionPerUnit", String(nextConsumption));
        await updateProductMaterialConsumptionAction(formData);
      }
      if (!hideCosts && Math.abs(nextWaste - currentWaste) >= 0.0000001) {
        const formData = new FormData();
        formData.set("productId", productId);
        formData.set("id", id);
        formData.set("wastePercent", String(nextWaste));
        await updateProductMaterialWasteAction(formData);
      }
      setMaterialDrafts((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      router.refresh();
    });
  }

  function cancelMaterialDraft(id: string) {
    setMaterialDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  function confirmOperationDraft(id: string, currentRate: number) {
    const draft = operationDrafts[id];
    if (!draft) return;
    const next = Math.max(0, Number(draft.rate) || 0);
    if (Math.abs(next - currentRate) < 0.0001) {
      setOperationDrafts((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      return;
    }
    startTransition(async () => {
      const formData = new FormData();
      formData.set("productId", productId);
      formData.set("id", id);
      formData.set("rateOverride", String(next));
      await updateProductOperationRateAction(formData);
      setOperationDrafts((prev) => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      router.refresh();
    });
  }

  function cancelOperationDraft(id: string) {
    setOperationDrafts((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  }

  return (
    <div className="space-y-4">
      <TableCard>
        <TableToolbar
          left={
            <div className="min-w-0">
              <span className="type-subsection">Матеріали</span>
              {hasOversizeSizes ? (
                <p className="type-caption mt-0.5 text-[var(--color-text-quiet)]">
                  Одна специфікація на всі розміри. Для {OVERSIZE_RANGE_LABEL} — надбавка % справа.
                </p>
              ) : null}
            </div>
          }
          right={
            <div className="flex flex-col items-end gap-2">
              {hasOversizeSizes ? (
                <OversizeCoeffFields
                  materialPct={materialPct}
                  operationPct={operationPct}
                  disabled={readOnly || pending}
                  className="ml-auto"
                />
              ) : null}
              {!readOnly ? (
                <AddProductMaterialPanel
                  productId={productId}
                  materials={materialOptions}
                  units={unitOptions}
                  sizeIds={sizeIdsForAdd}
                  sizeLabel={sizeLabelForAdd}
                />
              ) : null}
            </div>
          }
        />
        <Table>
          <THead>
            {canReorder ? <TH width="36px" /> : null}
            <TH className="min-w-[12rem] w-[38%]">Матеріал</TH>
            <TH align="right">Норма / виріб</TH>
            {!hideCosts ? <TH align="right">Відходи</TH> : null}
            {!hideCosts ? <TH align="right">Ціна</TH> : null}
            {!hideCosts ? <TH align="right">Собівартість / од.</TH> : null}
            {!readOnly ? <TH width="52px" /> : null}
          </THead>
          <TBody>
            {visibleMaterials.length === 0 ? (
              <TableEmpty
                colSpan={2 + (canReorder ? 1 : 0) + (hideCosts ? 0 : 3) + (readOnly ? 0 : 1)}
                title="Матеріалів ще немає"
                description={
                  hideCosts
                    ? "Склад матеріалів для цього виробу."
                    : "Додайте з рядка нижче — без матеріалів собівартість не розрахується."
                }
              />
            ) : (
              visibleMaterials.map((row) => {
                const hasSizeNorm = false;
                // Shared base norms — oversize markups apply in orders via %.
                const displayConsumption = row.consumption;
                const waste = row.waste;
                const draft = materialDrafts[row.id];
                const draftConsumption =
                  draft != null ? Math.max(0, Number(draft.consumption) || 0) : displayConsumption;
                const draftWaste =
                  draft != null ? Math.max(0, Number(draft.waste) || 0) : waste;
                const rowDirty =
                  draft != null &&
                  (Math.abs(draftConsumption - displayConsumption) >= 0.0000001 ||
                    (!hideCosts && Math.abs(draftWaste - waste) >= 0.0000001));
                const mixed =
                  sizeScope === ALL_SIZES &&
                  (Object.keys(row.sizeConsumption).length > 0 ||
                    Object.keys(row.sizeWaste ?? {}).length > 0);
                const unitCost =
                  draftConsumption * (1 + draftWaste / 100) * row.price;
                const specHint = materialOptionDescription(
                  row.densityGsm,
                  row.composition,
                  row.supplierOffers?.map((offer) => offer.supplierName) ?? [],
                );
                return (
                  <TR
                    key={row.id}
                    style={
                      canReorder
                        ? ({ viewTransitionName: `bom-m-${row.id}` } as CSSProperties)
                        : undefined
                    }
                    className={cn(
                      canReorder && "bom-sortable",
                      dragMaterialId === row.id && "bom-dragging",
                      rowDirty && ROW_DIRTY_CLASS,
                      dropHint?.kind === "materials" &&
                        dropHint.id === row.id &&
                        dropHint.edge === "before" &&
                        "bom-drop-before",
                      dropHint?.kind === "materials" &&
                        dropHint.id === row.id &&
                        dropHint.edge === "after" &&
                        "bom-drop-after",
                    )}
                    onDragOver={
                      canReorder
                        ? (event) => {
                            event.preventDefault();
                            event.dataTransfer.dropEffect = "move";
                            previewMaterialDrop(row.id, dropEdgeFromEvent(event));
                          }
                        : undefined
                    }
                    onDragLeave={
                      canReorder
                        ? (event) => {
                            if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                            setDropHint((prev) =>
                              prev?.kind === "materials" && prev.id === row.id ? null : prev,
                            );
                          }
                        : undefined
                    }
                    onDrop={
                      canReorder
                        ? (event) => {
                            event.preventDefault();
                            const edge =
                              dropHint?.kind === "materials" && dropHint.id === row.id
                                ? dropHint.edge
                                : dropEdgeFromEvent(event);
                            dropMaterialOn(row.id, edge);
                          }
                        : undefined
                    }
                  >
                    {canReorder ? (
                      <TD className="!px-1 align-middle">
                        <BomDragHandle
                          onDragStart={(event) => {
                            setDragMaterialId(row.id);
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", row.id);
                          }}
                        />
                      </TD>
                    ) : null}
                    <TD title={row.name} className="min-w-[12rem] w-[38%] align-top">
                      <div className="space-y-1">
                        <div className="min-w-0">
                          <CellStack
                            title={row.name}
                            subtitle={
                              [
                                row.sizeCodes?.length
                                  ? row.sizeCodes.join(" · ")
                                  : mixed
                                    ? "Базова норма; по розмірах є перевизначення"
                                    : scopeIsOversize && hasSizeNorm
                                      ? "своя норма для розміру"
                                      : scopeIsOversize
                                        ? `база · націнка ${OVERSIZE_RANGE_LABEL} лише в замовленні`
                                        : null,
                              ]
                                .filter(Boolean)
                                .join(" · ") || undefined
                            }
                            wrap
                          />
                          {specHint ? (
                            <p
                              className="mt-0.5 truncate text-[11.5px] leading-snug text-[var(--color-text-quiet)]"
                              title={specHint}
                            >
                              {specHint}
                            </p>
                          ) : null}
                        </div>
                        {(row.supplierOffers?.length ?? 0) > 0 ||
                        (row.materialAvailableColors?.length ?? 0) > 0 ? (
                          <ProductMaterialSupplierColorEditor
                            productId={productId}
                            productMaterialId={row.id}
                            supplierId={row.supplierId ?? null}
                            deliveryType={row.deliveryType ?? null}
                            color={row.colorSnapshot ?? null}
                            offers={row.supplierOffers ?? []}
                            materialFallbackColors={row.materialAvailableColors}
                            readOnly={readOnly}
                          />
                        ) : null}
                      </div>
                    </TD>
                    <TD numeric>
                      <span className="inline-flex flex-col items-end gap-0.5">
                        <span className="inline-flex items-center justify-end gap-1">
                          {readOnly ? (
                            <span className="tabular">{displayConsumption}</span>
                          ) : (
                            <input
                              type="text"
                              inputMode="decimal"
                              value={draft?.consumption ?? String(displayConsumption)}
                              title={
                                mixed && sizeScope === ALL_SIZES
                                  ? "Редагує базову норму. Перевизначення по розмірах лишаються."
                                  : scopeIsOversize && !hasSizeNorm
                                    ? `Базова норма. Націнка +${materialPct}% застосовується лише в замовленні, якщо є ${OVERSIZE_RANGE_LABEL}.`
                                    : undefined
                              }
                              onChange={(event) =>
                                setMaterialDrafts((prev) => ({
                                  ...prev,
                                  [row.id]: {
                                    consumption: event.target.value,
                                    waste: prev[row.id]?.waste ?? String(waste),
                                  },
                                }))
                              }
                              className={inputClass + " w-[72px]"}
                            />
                          )}
                          <span className="text-[12px] text-[var(--color-text-secondary)]">
                            {formatUnit(row.unit)}
                          </span>
                        </span>
                        {mixed && sizeScope === ALL_SIZES ? (
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            базова
                          </span>
                        ) : null}
                      </span>
                    </TD>
                    {!hideCosts ? (
                      <TD numeric>
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="inline-flex items-center justify-end gap-0.5">
                            {readOnly ? (
                              <span>{waste}%</span>
                            ) : (
                              <>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  value={draft?.waste ?? String(waste)}
                                  title={
                                    mixed && sizeScope === ALL_SIZES
                                      ? "Редагує базові відходи. Перевизначення по розмірах лишаються."
                                      : undefined
                                  }
                                  onChange={(event) =>
                                    setMaterialDrafts((prev) => ({
                                      ...prev,
                                      [row.id]: {
                                        consumption:
                                          prev[row.id]?.consumption ?? String(displayConsumption),
                                        waste: event.target.value,
                                      },
                                    }))
                                  }
                                  className={inputClass}
                                />
                                <span className="text-[12px] text-[var(--color-text-secondary)]">%</span>
                              </>
                            )}
                          </span>
                          {mixed && sizeScope === ALL_SIZES ? (
                            <span className="text-[10px] text-[var(--color-text-tertiary)]">
                              баз.
                            </span>
                          ) : null}
                        </span>
                      </TD>
                    ) : null}
                    {!hideCosts ? (
                      <TD numeric className="text-[var(--color-text-secondary)]">
                        {formatMoneyUah(row.price)}
                      </TD>
                    ) : null}
                    {!hideCosts ? (
                      <TD numeric className="font-medium">
                        {formatMoneyUah(unitCost)}
                      </TD>
                    ) : null}
                    {!readOnly ? (
                      <TD align="center">
                        <RowEditActions
                          dirty={rowDirty}
                          pending={pending}
                          onConfirm={() =>
                            confirmMaterialDraft(row.id, displayConsumption, waste)
                          }
                          onCancel={() => cancelMaterialDraft(row.id)}
                          onRemove={() => removeMaterial(row.id)}
                          removeLabel={`Прибрати ${row.name}`}
                        />
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
                <TD
                  colSpan={4 + (canReorder ? 1 : 0)}
                  className="text-[var(--color-text-secondary)]"
                >
                  Матеріали разом / од.
                </TD>
                <TD numeric>{formatMoneyUah(materialsSubtotal)}</TD>
                {!readOnly ? <TD /> : null}
              </tr>
            </TFoot>
          ) : null}
        </Table>
        {!readOnly ? (
          <ProductAddMaterialBar
            productId={productId}
            materials={materialOptions}
            units={unitOptions}
            sizeIds={sizeIdsForAdd}
            sizeLabel={sizeLabelForAdd}
          />
        ) : null}
      </TableCard>

      <TableCard>
        <TableToolbar
          left={<span className="type-subsection">Операції</span>}
          right={
            !readOnly ? (
              <AddProductOperationPanel
                productId={productId}
                operations={operationOptions}
                sizeIds={sizeIdsForAdd}
                sizeLabel={sizeLabelForAdd}
              />
            ) : null
          }
        />
        <Table>
          <THead>
            {canReorder ? <TH width="36px" /> : null}
            <TH>Операція</TH>
            <TH>Метод</TH>
            {!hideCosts ? <TH align="right">Вартість / од.</TH> : null}
            {!readOnly ? <TH width="52px" /> : null}
          </THead>
          <TBody>
            {visibleOperations.length === 0 ? (
              <TableEmpty
                colSpan={2 + (canReorder ? 1 : 0) + (hideCosts ? 0 : 1) + (readOnly ? 0 : 1)}
                title={
                  "Операцій ще немає"
                }
                description="Додайте технологічні операції, щоб врахувати роботу у собівартості."
              />
            ) : (
              visibleOperations.map((row) => {
                const cutCell = row.isCut ? formatCutCostCell(row, previewQty, cutRateContext) : null;
                const currentRate =
                  row.rateOverride != null ? row.rateOverride : row.unitCost;
                const opDraft = operationDrafts[row.id];
                const opDirty =
                  opDraft != null &&
                  Math.abs(Math.max(0, Number(opDraft.rate) || 0) - currentRate) >= 0.0001;
                return (
                <TR
                  key={row.id}
                  style={
                    canReorder
                      ? ({ viewTransitionName: `bom-o-${row.id}` } as CSSProperties)
                      : undefined
                  }
                  className={cn(
                    canReorder && "bom-sortable",
                    dragOperationId === row.id && "bom-dragging",
                    opDirty && ROW_DIRTY_CLASS,
                    dropHint?.kind === "operations" &&
                      dropHint.id === row.id &&
                      dropHint.edge === "before" &&
                      "bom-drop-before",
                    dropHint?.kind === "operations" &&
                      dropHint.id === row.id &&
                      dropHint.edge === "after" &&
                      "bom-drop-after",
                  )}
                  onDragOver={
                    canReorder
                      ? (event) => {
                          event.preventDefault();
                          event.dataTransfer.dropEffect = "move";
                          previewOperationDrop(row.id, dropEdgeFromEvent(event));
                        }
                      : undefined
                  }
                  onDragLeave={
                    canReorder
                      ? (event) => {
                          if (event.currentTarget.contains(event.relatedTarget as Node)) return;
                          setDropHint((prev) =>
                            prev?.kind === "operations" && prev.id === row.id ? null : prev,
                          );
                        }
                      : undefined
                  }
                  onDrop={
                    canReorder
                      ? (event) => {
                          event.preventDefault();
                          const edge =
                            dropHint?.kind === "operations" && dropHint.id === row.id
                              ? dropHint.edge
                              : dropEdgeFromEvent(event);
                          dropOperationOn(row.id, edge);
                        }
                      : undefined
                  }
                >
                  {canReorder ? (
                    <TD className="!px-1 align-middle">
                      <BomDragHandle
                        onDragStart={(event) => {
                          setDragOperationId(row.id);
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", row.id);
                        }}
                      />
                    </TD>
                  ) : null}
                  <TD className="min-w-0">
                    <CellStack
                      title={row.name}
                      subtitle={
                        row.sizeCodes?.length ? row.sizeCodes.join(" · ") : undefined
                      }
                      maxWidth="100%"
                    />
                  </TD>
                  <TD className="min-w-0">
                    {row.isCut && cutCell?.secondary ? (
                      <div className="min-w-0">
                        <div className="text-[13px] text-[var(--color-text-secondary)]">{row.method}</div>
                        <div className="mt-0.5 break-words text-[12px] text-[var(--color-text-quiet)]">
                          {cutCell.secondary}
                        </div>
                      </div>
                    ) : (
                      <span className="block truncate text-[var(--color-text-secondary)]" title={row.method}>
                        {row.method}
                      </span>
                    )}
                  </TD>
                  {!hideCosts ? (
                    <TD
                      numeric={!row.isCut}
                      align={row.isCut ? "right" : undefined}
                      className={cn("font-medium", row.isCut && "!whitespace-normal")}
                      title={cutCell?.title}
                    >
                      {row.isCut && cutCell ? (
                        <div className="text-right">
                          <div>{cutCell.primary}</div>
                          <Link
                            href={`/products/${productId}?tab=pricing`}
                            className="type-caption text-[var(--color-primary-700)] hover:underline"
                          >
                            редагувати крій →
                          </Link>
                        </div>
                      ) : row.methodCode === "QUANTITY_TIER" && isDeliveryOperationName(row.name) ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="tabular">
                            {formatMoneyUah(deliveryUnitRate(row, previewQty))}
                          </span>
                          <Link
                            href={`/products/${productId}?tab=pricing`}
                            className="type-caption text-[var(--color-primary-700)] hover:underline"
                          >
                            сітка в «Прайс і крій» →
                          </Link>
                        </span>
                      ) : isFixedCostOperationName(row.name) ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="type-caption">довідник ПВ</span>
                          <span className="type-caption text-[var(--color-text-quiet)]">
                            не окрема ставка
                          </span>
                        </span>
                      ) : row.methodCode === "QUANTITY_TIER" ? (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="tabular">{formatMoneyUah(row.unitCost)}</span>
                          <span className="text-[10px] text-[var(--color-text-tertiary)]">
                            сітка ставок нижче
                          </span>
                        </span>
                      ) : readOnly ? (
                        <span className="tabular">{formatMoneyUah(row.unitCost)}</span>
                      ) : (
                        <span className="inline-flex flex-col items-end gap-0.5">
                          <span className="inline-flex items-center justify-end gap-1">
                            <input
                              type="text"
                              inputMode="decimal"
                              value={opDraft?.rate ?? String(currentRate)}
                              disabled={pending}
                              title={
                                row.rateOverride != null
                                  ? `Перевизначення на виробі (довідник ${formatMoneyUah(row.catalogRate ?? 0)})`
                                  : "Ставка на виробі. Підтвердіть галочкою — збережеться окремо від довідника."
                              }
                              onChange={(event) =>
                                setOperationDrafts((prev) => ({
                                  ...prev,
                                  [row.id]: { rate: event.target.value },
                                }))
                              }
                              className={inputClass + " w-[72px]"}
                            />
                            <span className="text-[12px] text-[var(--color-text-secondary)]">₴</span>
                          </span>
                          {row.rateOverride != null ? (
                            <span className="text-[10px] text-[var(--color-text-tertiary)]">
                              довідн. {formatMoneyUah(row.catalogRate ?? 0)}
                            </span>
                          ) : null}
                        </span>
                      )}
                    </TD>
                  ) : null}
                  {!readOnly ? (
                    <TD align="center">
                      <RowEditActions
                        dirty={opDirty}
                        pending={pending}
                        onConfirm={() => confirmOperationDraft(row.id, currentRate)}
                        onCancel={() => cancelOperationDraft(row.id)}
                        onRemove={() => removeOperation(row.id)}
                        removeLabel={`Прибрати ${row.name}`}
                      />
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
                <TD
                  colSpan={2 + (canReorder ? 1 : 0)}
                  className="text-[var(--color-text-secondary)]"
                >
                  {hasCutOperation || hasDeliveryOp
                    ? hasCutOperation && hasDeliveryOp
                      ? "Операції без крою/доставки / од."
                      : hasCutOperation
                        ? "Операції без крою / од."
                        : "Операції без доставки / од."
                    : "Операції разом / од."}
                </TD>
                <TD numeric>{formatMoneyUah(operationsSubtotal)}</TD>
                {!readOnly ? <TD /> : null}
              </tr>
              {hasCutOperation || hasDeliveryOp ? (
                <tr>
                  <TD
                    colSpan={2 + (canReorder ? 1 : 0)}
                    className="text-[var(--color-text-secondary)]"
                  >
                    {hasCutOperation && hasDeliveryOp
                      ? "Крій і доставка"
                      : hasCutOperation
                        ? "Крій"
                        : "Доставка"}
                  </TD>
                  <TD numeric className="type-caption">
                    {hasDeliveryOp && !hasCutOperation
                      ? formatMoneyUah(deliveryPerUnit)
                      : hasDeliveryOp && hasCutOperation
                        ? `доставка ${formatMoneyUah(deliveryPerUnit)}/од. · крій за тиражем`
                        : "за тиражем →"}
                  </TD>
                  {!readOnly ? <TD /> : null}
                </tr>
              ) : null}
            </TFoot>
          ) : null}
        </Table>
      </TableCard>

      {!hideCosts && fixedCostPreview && fixedCostPreview.perUnit > 0 ? (
        <TableCard>
          <TableToolbar left={<span className="type-subsection">Постійні витрати</span>} />
          <Table>
            <THead>
              <TH>Розрахунок</TH>
              <TH align="right">₴ / од.</TH>
            </THead>
            <TBody>
              <TR>
                <TD>
                  <p className="font-medium">ПВ до собівартості</p>
                  <p className="type-caption mt-0.5">
                    пошив {formatMoneyUah(fixedCostPreview.sewingPerUnit)} ÷ коеф.{" "}
                    {fixedCostPreview.coefficient} · {fixedCostPreview.sewerCount} швей у довіднику
                  </p>
                </TD>
                <TD numeric className="font-medium">
                  {formatMoneyUah(fixedCostPreview.perUnit)}
                </TD>
              </TR>
            </TBody>
          </Table>
        </TableCard>
      ) : null}

      {!hideCosts && !readOnly
        ? operations
            .filter(
              (row) =>
                row.methodCode === "QUANTITY_TIER" &&
                !isCutOperationName(row.name) &&
                !isDeliveryOperationName(row.name) &&
                !isFixedCostOperationName(row.name),
            )
            .map((row) => (
              <ProductOperationRateEditor
                key={`tiers-${row.id}`}
                productId={productId}
                productOperationId={row.id}
                operationName={row.name}
                tiers={row.rateTiers}
              />
            ))
        : null}

      {!hideCosts &&
      operations.some(
        (row) =>
          row.methodCode === "QUANTITY_TIER" && isDeliveryOperationName(row.name),
      ) ? (
        <p className="type-caption rounded-[10px] border border-dashed border-[var(--color-border)] px-3 py-2.5">
          Доставка в комплектації — ₴ на 1 шт. На тираж: ставка × кількість (напр. 1,50 × 100 = 150).
          Сітку ставок редагуйте в «Прайс і крій» (колонка «Достав.»).
        </p>
      ) : null}

      {!hideCosts ? (
        <p className="type-caption rounded-[10px] border border-dashed border-[var(--color-border)] px-3 py-2.5">
          Нанесення (шовкотрафарет тощо) додається лише в замовленні — не в картці базового виробу.
        </p>
      ) : null}
    </div>
  );
}
