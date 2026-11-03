"use client";

import { useEffect, useId, useMemo, useState, useTransition, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormGroup, Textarea, Select } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { SidePanel } from "@/components/ui/Overlay";
import { IconCheckCircle, IconPlus, IconProducts } from "@/components/ui/Icons";
import { PRODUCT_IMAGE_MAX_MB } from "@/lib/product-image";
import {
  createProductAction,
  uploadProductImageAction,
} from "@/server/domains/products/actions";
import { DraftCompositionBomEditor } from "@/components/composition/DraftCompositionBomEditor";
import {
  type DecorationCatalogOption,
  type MaterialCatalogOption,
  type OperationCatalogOption,
} from "@/components/composition/DraftCompositionForms";
import { CompositionScopeHint } from "@/app/(app)/products/[id]/ProductCompositionForms";
import { type DraftComposition } from "@/components/orders/ProductCatalogPanel";
import {
  DEFAULT_CUT_RATE_TIERS,
  ProductCutRateFields,
  type CutRateTierDraft,
} from "@/components/products/ProductCutRateFields";
import {
  DEFAULT_COMMERCIAL_PRICE_TIERS,
  ProductPriceFields,
  type CommercialPriceTierDraft,
} from "@/components/products/ProductPriceFields";
import { isCutOperationName } from "@/lib/cut-rate";
import { emptyComposition } from "@/lib/draft-composition";
import { ALL_SIZES } from "@/lib/size-bom";
import { cn } from "@/lib/utils";

export type CreatedCatalogProduct = {
  id: string;
  label: string;
  nameUk?: string;
  internalCode?: string | null;
  imageUrl?: string | null;
  materialsCount: number;
  operationsCount: number;
  decorationsCount: number;
  sizes: Array<{ code: string; nameUk: string }>;
  priceTiers: Array<{ qty: number; price: number }>;
  composition: {
    materials: Array<{
      materialId: string;
      name: string;
      unit: string;
      consumption: number;
      waste: number;
      price: number;
      sizeCodes?: string[] | null;
      sizeConsumption?: Record<string, number>;
    }>;
    operations: Array<{
      operationId: string;
      name: string;
      method: string;
      unitRate: number | null;
      shiftCost: number | null;
      standardOutput: number | null;
      sizeCodes?: string[] | null;
    }>;
    decorations: Array<{
      decorationMethodId: string;
      name: string;
      setupCost: number;
      unitRate: number;
    }>;
  };
};

/**
 * Full product card creation in-context: photo, identity, sizes, and BOM.
 * Used from orders and the products list without leaving the flow.
 */
export function ProductCreatePanel({
  sizes,
  sizeVariants = [],
  materialCatalog: initialMaterials = [],
  operationCatalog: initialOperations = [],
  decorationCatalog: initialDecorations = [],
  unitOptions = [],
  onCreated,
  triggerLabel = "Новий виріб",
  variant = "secondary",
  size = "sm",
}: {
  sizes: Array<{ id: string; label: string; code?: string; variantId?: string }>;
  sizeVariants?: Array<{ id: string; nameUk: string }>;
  materialCatalog?: MaterialCatalogOption[];
  operationCatalog?: OperationCatalogOption[];
  decorationCatalog?: DecorationCatalogOption[];
  unitOptions?: Array<{ id: string; label: string }>;
  onCreated?: (product: CreatedCatalogProduct) => void;
  triggerLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [sizeVariantId, setSizeVariantId] = useState(sizeVariants[0]?.id ?? "");
  const [sizesByVariant, setSizesByVariant] = useState<Record<string, string[]>>({});
  const selectedSizes = sizesByVariant[sizeVariantId] ?? [];
  const [composition, setComposition] = useState<DraftComposition>(emptyComposition);
  const [materialCatalog, setMaterialCatalog] = useState(initialMaterials);
  const [operationCatalog, setOperationCatalog] = useState(initialOperations);
  const [decorationCatalog, setDecorationCatalog] = useState(initialDecorations);
  const [cutTiers, setCutTiers] = useState<CutRateTierDraft[]>([]);
  const [cutOptimalQty, setCutOptimalQty] = useState(100);
  const [cutOptimalTotal, setCutOptimalTotal] = useState(0);
  const [isBaseModel, setIsBaseModel] = useState(true);
  const [priceTiers, setPriceTiers] = useState<CommercialPriceTierDraft[]>([]);

  useEffect(() => {
    setMaterialCatalog(initialMaterials);
  }, [initialMaterials]);
  useEffect(() => {
    setOperationCatalog(initialOperations);
  }, [initialOperations]);
  useEffect(() => {
    setDecorationCatalog(initialDecorations);
  }, [initialDecorations]);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!sizeVariantId && sizeVariants[0]?.id) setSizeVariantId(sizeVariants[0].id);
  }, [sizeVariants, sizeVariantId]);

  const sizesForVariant = useMemo(() => {
    if (!sizeVariantId) return sizes;
    return sizes.filter((row) => !row.variantId || row.variantId === sizeVariantId);
  }, [sizes, sizeVariantId]);

  const hasCutOperation = composition.operations.some((row) => isCutOperationName(row.name));

  useEffect(() => {
    if (hasCutOperation && cutTiers.length === 0) {
      setCutTiers(DEFAULT_CUT_RATE_TIERS);
    }
  }, [hasCutOperation, cutTiers.length]);

  function resetForm() {
    setName("");
    setImageUrl("");
    setPreviewUrl(null);
    setSizesByVariant({});
    setSizeVariantId(sizeVariants[0]?.id ?? "");
    setComposition(emptyComposition());
    setCutTiers([]);
    setCutOptimalQty(100);
    setCutOptimalTotal(0);
    setIsBaseModel(true);
    setPriceTiers([]);
    setError(null);
  }

  function toggleSize(id: string) {
    setSizesByVariant((prev) => {
      const current = prev[sizeVariantId] ?? [];
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      return { ...prev, [sizeVariantId]: next };
    });
  }

  async function onPickImage(file: File | null) {
    if (!file) return;
    setError(null);
    setUploading(true);
    const localPreview = URL.createObjectURL(file);
    setPreviewUrl(localPreview);
    try {
      const data = new FormData();
      data.set("file", file);
      const result = await uploadProductImageAction(data);
      if (!result.ok || !("url" in result) || !result.url) {
        setError(
          result.error === "TOO_LARGE"
            ? `Фото має бути до ${PRODUCT_IMAGE_MAX_MB} МБ.`
            : result.error === "TYPE"
              ? "Потрібен файл зображення."
              : "message" in result && result.message
                ? `Не вдалося завантажити фото: ${result.message}. Можна вставити посилання нижче.`
                : "Не вдалося завантажити фото. Можна вставити посилання нижче.",
        );
        return;
      }
      setImageUrl(result.url);
      setPreviewUrl(result.url);
    } finally {
      setUploading(false);
    }
  }

  function submit(formData: FormData) {
    setError(null);
    formData.set("imageUrl", imageUrl);
    formData.set(
      "compositionJson",
      JSON.stringify({
        materials: composition.materials.map((row) => ({
          materialId: row.materialId,
          consumptionPerUnit: row.consumption,
          wastePercent: row.waste,
          sizeCodes: row.sizeCodes ?? null,
          sizeConsumption: row.sizeConsumption,
        })),
        operations: composition.operations.map((row) => ({
          operationId: row.operationId,
          sizeCodes: row.sizeCodes ?? null,
        })),
        decorations: [],
      }),
    );
    if (hasCutOperation && cutTiers.some((row) => row.ratePerUnit > 0 || row.minQuantity > 0)) {
      formData.set(
        "cutRatesJson",
        JSON.stringify({
          optimalQty: cutOptimalQty,
          tiers: cutTiers,
        }),
      );
    }
    if (isBaseModel || priceTiers.some((row) => row.pricePerUnit > 0)) {
      formData.set(
        "priceListJson",
        JSON.stringify({
          isBaseModel,
          tiers: priceTiers,
        }),
      );
    }

    startTransition(async () => {
      const result = await createProductAction(formData);
      if (!result.ok) {
        setError("Перевірте назву та поля комплектації — виріб не збережено.");
        return;
      }

      const created = result;
      const compositionResult = created.composition ?? {
        materials: [],
        operations: [],
        decorations: [],
      };

      onCreated?.({
        id: created.productId,
        label: created.label,
        nameUk: created.nameUk,
        internalCode: created.internalCode,
        imageUrl: created.imageUrl,
        materialsCount: created.materialsCount,
        operationsCount: created.operationsCount,
        decorationsCount: created.decorationsCount,
        sizes: created.sizes,
        priceTiers: [],
        composition: compositionResult,
      });

      setOpen(false);
      resetForm();
      setToast("Виріб збережено в каталозі.");
      router.refresh();
    });
  }

  const displayImage = previewUrl || imageUrl || null;
  const hasIdentity = name.trim().length > 0;
  const hasComposition =
    composition.materials.length > 0 && composition.operations.length > 0;
  const readyHint = hasComposition
    ? "Готовий до розрахунку"
    : "Можна зберегти чернетку — комплектацію доповните пізніше";
  const selectedSizeRefs = sizes
    .filter((row) => selectedSizes.includes(row.id) && row.code)
    .map((row) => ({ code: row.code as string, nameUk: row.label }));
  const createStep: 1 | 2 | 3 = !hasIdentity ? 1 : !hasComposition ? 2 : 3;

  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>
        <IconPlus size={16} />
        {triggerLabel}
      </Button>

      <SidePanel
        open={open}
        onClose={() => {
          if (pending || uploading) return;
          setOpen(false);
          resetForm();
        }}
        title="Новий виріб"
        description="Еталонна картка: ідентифікація → комплектація → крій → збереження."
        width="2xl"
        footer={
          <>
            <p className="mr-auto hidden text-[12.5px] text-[var(--color-text-tertiary)] sm:block">
              {readyHint}
            </p>
            <Button
              variant="ghost"
              onClick={() => {
                setOpen(false);
                resetForm();
              }}
              disabled={pending || uploading}
            >
              Скасувати
            </Button>
            <Button type="submit" form={formId} disabled={pending || uploading || !name.trim()}>
              {pending ? "Збереження…" : "Створити виріб"}
            </Button>
          </>
        }
      >
        <form id={formId} action={submit} className="space-y-5">
          {error ? <Banner tone="danger">{error}</Banner> : null}

          <CreateSteps current={createStep} />

          <ReadinessStrip
            sizes={selectedSizes.length}
            materials={composition.materials.length}
            operations={composition.operations.length}
            decorations={composition.decorations.length}
            ready={hasComposition}
            canSave={hasIdentity}
          />

          <section className="space-y-3">
            <SectionTitle>Фото виробу</SectionTitle>
            <div className="flex flex-wrap items-start gap-4">
              <div className="relative flex h-28 w-28 shrink-0 items-center justify-center overflow-hidden rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-tint-slate)]">
                {displayImage ? (
                  <Image src={displayImage} alt="" fill sizes="112px" className="object-cover" unoptimized={displayImage.startsWith("blob:")} />
                ) : (
                  <span className="flex flex-col items-center gap-1 text-[var(--color-text-tertiary)]">
                    <IconProducts size={22} />
                    <span className="text-[10px] font-medium">Немає фото</span>
                  </span>
                )}
              </div>
              <div className="min-w-0 flex-1 space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[13px] font-medium transition-colors hover:bg-[var(--color-surface-hover)]">
                  <input
                    type="file"
                    accept="image/*"
                    className="sr-only"
                    disabled={uploading || pending}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void onPickImage(file);
                      event.target.value = "";
                    }}
                  />
                  {uploading ? "Завантаження…" : "Завантажити фото"}
                </label>
                <Input
                  label="Або посилання на зображення"
                  type="url"
                  placeholder="https://…"
                  value={imageUrl}
                  onChange={(event) => {
                    setImageUrl(event.target.value);
                    setPreviewUrl(event.target.value || null);
                  }}
                  hint={`JPEG/PNG до ${PRODUCT_IMAGE_MAX_MB} МБ, або публічний URL`}
                />
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Ідентифікація</SectionTitle>
            <FormGroup label="Основне" columns={2}>
              <Input
                name="nameUk"
                label="Назва виробу"
                required
                autoFocus
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Костюм робочий"
              />
              <Input name="internalCode" label="Внутрішній код" placeholder="Необовʼязково" />
              <Textarea
                name="description"
                label="Короткий опис"
                className="sm:col-span-2"
                placeholder="Призначення, склад тканини, особливості моделі"
              />
            </FormGroup>
          </section>

          <section className="space-y-3">
            <SectionTitle>Розмірна сітка</SectionTitle>
            <p className="type-caption">
              Спочатку варіант сітки, потім розміри. Можна залишити порожньою — у замовленні буде
              «Без розміру».
            </p>
            {sizeVariants.length > 0 ? (
              <Select
                label="Варіант сітки"
                name="sizeChartVariantId"
                value={sizeVariantId}
                onChange={(event) => {
                  const next = event.target.value;
                  setSizeVariantId(next);
                  setSizesByVariant((prev) =>
                    prev[next] !== undefined ? prev : { ...prev, [next]: [] },
                  );
                }}
              >
                {sizeVariants.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.nameUk}
                  </option>
                ))}
              </Select>
            ) : null}
            <div className="flex flex-wrap gap-1.5">
              {sizesForVariant.length === 0 ? (
                <p className="type-body-secondary">Розміри ще не заведені в довіднику.</p>
              ) : (
                sizesForVariant.map((row) => {
                  const active = selectedSizes.includes(row.id);
                  return (
                    <label
                      key={row.id}
                      className={cn(
                        "inline-flex cursor-pointer items-center gap-1.5 rounded-[var(--radius-control)] border px-2.5 py-1.5 text-[13px] font-medium transition-colors",
                        active
                          ? "border-[var(--color-border-strong)] bg-[var(--color-tint-sage)] text-[var(--color-primary-800)]"
                          : "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-hover)]",
                      )}
                    >
                      <input
                        type="checkbox"
                        name="sizeIds"
                        value={row.id}
                        checked={active}
                        onChange={() => toggleSize(row.id)}
                        className="h-3.5 w-3.5 accent-[var(--color-primary-600)]"
                      />
                      {row.label}
                    </label>
                  );
                })
              )}
            </div>
          </section>

          <section className="space-y-3">
            <SectionTitle>Комплектація</SectionTitle>
            <DraftCompositionBomEditor
              composition={composition}
              onCompositionChange={setComposition}
              sizes={selectedSizeRefs}
              materialOptions={materialCatalog}
              operationOptions={operationCatalog}
              decorationOptions={decorationCatalog}
              unitOptions={unitOptions}
              cutRatePreview={
                hasCutOperation
                  ? {
                      optimalQty: cutOptimalQty,
                      tiers: cutTiers,
                    }
                  : undefined
              }
              cutRateHint="тарифи у блоці «Крій за тиражем» нижче"
              onMaterialCatalogAdd={(option) =>
                setMaterialCatalog((prev) =>
                  prev.some((row) => row.id === option.id) ? prev : [...prev, option],
                )
              }
              onMaterialCatalogColorsChange={(materialId, colors) =>
                setMaterialCatalog((prev) =>
                  prev.map((row) =>
                    row.id === materialId ? { ...row, availableColors: colors } : row,
                  ),
                )
              }
              onOperationCatalogAdd={(option) =>
                setOperationCatalog((prev) =>
                  prev.some((row) => row.id === option.id) ? prev : [...prev, option],
                )
              }
              onDecorationCatalogAdd={(option) =>
                setDecorationCatalog((prev) =>
                  prev.some((row) => row.id === option.id) ? prev : [...prev, option],
                )
              }
              showSubtotals={false}
              scopeHint={(sizeScope) =>
                selectedSizeRefs.length > 1 ? (
                  <CompositionScopeHint
                    sizeIds={
                      sizeScope === ALL_SIZES
                        ? []
                        : selectedSizes.filter((id) => {
                            const row = sizes.find((s) => s.id === id);
                            return row?.code === sizeScope;
                          })
                    }
                    sizeLabel={sizeScope === ALL_SIZES ? undefined : sizeScope}
                  />
                ) : (
                  <CompositionScopeHint sizeIds={[]} />
                )
              }
            />
          </section>
          {hasCutOperation ? (
            <section className="space-y-3 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div>
                <SectionTitle>Крій за тиражем</SectionTitle>
                <p className="type-caption mt-1">
                  Оптимальний тираж і вартість крою → ₴/шт = вартість ÷ тираж. Від оптимуму й вище
                  ставка не падає (напр. 250 = 6 → і 500 теж 6).
                </p>
              </div>
              <ProductCutRateFields
                tiers={cutTiers}
                onTiersChange={setCutTiers}
                optimalQty={cutOptimalQty}
                onOptimalQtyChange={setCutOptimalQty}
                optimalCutTotal={cutOptimalTotal}
                onOptimalCutTotalChange={setCutOptimalTotal}
              />
            </section>
          ) : (
            <p className="type-caption rounded-[var(--radius-control)] border border-dashed border-[var(--color-border)] px-3 py-2.5">
              Додайте операцію «Розкрій» — зʼявиться блок тарифів крою за тиражем.
            </p>
          )}

          <section className="space-y-3 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div>
              <SectionTitle>Комерційний прайс за тиражем</SectionTitle>
              <p className="type-caption mt-1">
                Фіксована ціна для клієнта (без брендування). Брендування додається в замовленні.
                Собівартість рахується окремо.
              </p>
            </div>
            <label className="inline-flex items-center gap-2 text-[13px]">
              <input
                type="checkbox"
                checked={isBaseModel}
                onChange={(event) => {
                  setIsBaseModel(event.target.checked);
                  if (event.target.checked && priceTiers.length === 0) {
                    setPriceTiers(DEFAULT_COMMERCIAL_PRICE_TIERS);
                  }
                }}
                className="h-4 w-4 accent-[var(--color-primary-600)]"
              />
              Базова модель каталогу
            </label>
            {(isBaseModel || priceTiers.length > 0) && (
              <ProductPriceFields tiers={priceTiers} onTiersChange={setPriceTiers} />
            )}
          </section>

        </form>
      </SidePanel>

      {toast ? <Toast text={toast} /> : null}
    </>
  );
}

function CreateSteps({ current }: { current: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: "Ідентифікація" },
    { n: 2 as const, label: "Комплектація" },
    { n: 3 as const, label: "Зберегти" },
  ];
  return (
    <ol className="flex flex-wrap items-center gap-2">
      {steps.map((step, index) => {
        const done = current > step.n;
        const active = current === step.n;
        return (
          <li key={step.n} className="flex items-center gap-2">
            {index > 0 ? (
              <span className="text-[var(--color-border-strong)]" aria-hidden>
                ·
              </span>
            ) : null}
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] font-medium",
                active && "bg-[var(--color-tint-sage)] text-[var(--color-primary-800)]",
                done && !active && "text-[var(--color-text-secondary)]",
                !done && !active && "text-[var(--color-text-tertiary)]",
              )}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 items-center justify-center rounded-full text-[11px] tabular",
                  active || done
                    ? "bg-[var(--color-primary-600)] text-white"
                    : "bg-[var(--color-surface-subtle)] text-[var(--color-text-tertiary)]",
                )}
              >
                {done ? "✓" : step.n}
              </span>
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

function ReadinessStrip({
  sizes,
  materials,
  operations,
  decorations,
  ready,
  canSave,
}: {
  sizes: number;
  materials: number;
  operations: number;
  decorations: number;
  ready: boolean;
  canSave: boolean;
}) {
  return (
    <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12.5px]">
        <span className="font-medium text-[var(--color-text-primary)]">
          {ready ? "Готовий до розрахунку" : canSave ? "Чернетка" : "Заповніть назву"}
        </span>
        <span className="text-[var(--color-text-secondary)]">
          Розміри {sizes} · Матеріали {materials} · Операції {operations}
        </span>
      </div>
      {!ready && canSave ? (
        <p className="type-caption mt-1">
          Без матеріалів і операцій виріб збережеться, але розрахункова ціна зʼявиться після комплектації.
        </p>
      ) : null}
    </div>
  );
}

function SectionTitle({
  children,
  icon,
  meta,
}: {
  children: ReactNode;
  icon?: ReactNode;
  meta?: string;
}) {
  return (
    <div className="flex items-center gap-2 border-b border-[var(--color-divider)] pb-2">
      {icon ? <span className="text-[var(--color-text-tertiary)]">{icon}</span> : null}
      <h3 className="type-subsection">{children}</h3>
      {meta != null ? (
        <span className="tabular ml-auto text-[12px] text-[var(--color-text-tertiary)]">{meta}</span>
      ) : null}
    </div>
  );
}

function Toast({ text }: { text: string }) {
  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="anim-modal fixed bottom-5 right-5 z-[60] flex max-w-sm items-start gap-2 rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 py-2.5 text-[13px] shadow-[var(--shadow-panel)]">
      <IconCheckCircle size={16} className="mt-0.5 text-[var(--color-success-text)]" />
      <span className="text-[var(--color-text-primary)]">{text}</span>
    </div>,
    document.body,
  );
}
