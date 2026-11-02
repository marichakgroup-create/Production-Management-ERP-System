"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { useRouter } from "next/navigation";
import { SidePanel } from "@/components/ui/Overlay";
import { Button } from "@/components/ui/Button";
import { SidePanelSkeleton } from "@/components/ui/Skeleton";
import { Select } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedCloseGuard } from "@/hooks/useUnsavedCloseGuard";
import { formatMoneyUah, formatUnit } from "@/lib/utils";
import { materialQtyUnitShort } from "@/lib/material-pack-labels";
import {
  effectiveOversizeConsumption,
  isOversizeCode,
  OVERSIZE_RANGE_LABEL,
  oversizeMaterialPct,
  oversizeUpliftCaption,
} from "@/lib/size-coeffs";
import {
  fabricPricingModeLabel,
  resolveFabricUnitMode,
  resolveOrderFabricPurchasePrice,
} from "@/lib/fabric-pricing";
import {
  getOrderMaterialDetailAction,
  updateOrderMaterialTermsAction,
} from "@/server/domains/orders/actions";
import { SupplierColorFields } from "@/components/catalog/SupplierColorFields";
import { reconcileColorForSupplier } from "@/lib/supplier-colors";

type MaterialDetail = NonNullable<
  Extract<Awaited<ReturnType<typeof getOrderMaterialDetailAction>>, { ok: true }>["detail"]
>;

type FabricPreview = NonNullable<MaterialDetail["catalogPreview"]>;
type VatMode = "NET" | "GROSS";

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

function vatLabel(mode: VatMode) {
  return mode === "NET" ? "без ПДВ" : "з ПДВ";
}

function previewForSupplier(detail: MaterialDetail, supplierId: string): FabricPreview | null {
  if (!detail.isFabric) return null;
  if (supplierId) {
    const offer = detail.offers.find((row) => row.supplierId === supplierId);
    if (offer && "purchasePricePerMeter" in offer && typeof offer.purchasePricePerMeter === "number") {
      return offer as unknown as FabricPreview;
    }
    return detail.catalogPreview ?? null;
  }
  return detail.catalogPreview ?? null;
}

function deliveryFromCargo(
  kgNeeded: number | null | undefined,
  cargoUsdPerKg: number,
  usdUahRate: number,
) {
  if (kgNeeded == null || kgNeeded <= 0 || cargoUsdPerKg <= 0 || usdUahRate <= 0) return 0;
  return round1(kgNeeded * cargoUsdPerKg * usdUahRate);
}

function parseOptionalNumber(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const value = Number(trimmed);
  return Number.isFinite(value) ? value : null;
}

function lineQuantity(detail: MaterialDetail): number {
  if (!detail.quantitiesBySize) return detail.totalQuantity;
  if (detail.sizeCode) return detail.quantitiesBySize[detail.sizeCode] ?? 0;
  return detail.totalQuantity;
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2.5 rounded-[var(--radius-control)] border border-[var(--color-border)] p-3">
      <h3 className="type-label">{title}</h3>
      {children}
    </section>
  );
}

function Segmented({
  options,
  value,
  disabled,
  onChange,
}: {
  options: { value: string; label: string }[];
  value: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="inline-flex rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className={`rounded-[5px] px-2.5 py-1 text-[12px] font-medium ${
            value === option.value
              ? "bg-white text-[var(--color-text-primary)] shadow-sm"
              : "text-[var(--color-text-secondary)]"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function NumberField({
  label,
  value,
  placeholder,
  prefix,
  suffix,
  step = "0.01",
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  step?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-tertiary)]">
        {label}
      </span>
      <div className="inline-flex h-8 max-w-[180px] items-center overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-white focus-within:border-[var(--color-primary-500)]">
        {prefix ? (
          <span className="shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 text-[12px] font-medium text-[var(--color-text-secondary)]">
            {prefix}
          </span>
        ) : null}
        <input
          type="number"
          min={0}
          step={step}
          disabled={disabled}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
          className="h-full min-w-0 flex-1 bg-transparent px-2 text-right text-[13px] tabular outline-none"
        />
        {suffix ? (
          <span className="shrink-0 border-l border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2 text-[12px] text-[var(--color-text-tertiary)]">
            {suffix}
          </span>
        ) : null}
      </div>
    </label>
  );
}

export function OrderMaterialDetailPanel({
  orderId,
  orderItemMaterialId,
  locked,
  onClose,
}: {
  orderId: string;
  orderItemMaterialId: string | null;
  locked: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState<MaterialDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [supplierId, setSupplierId] = useState("");
  const [colorSnapshot, setColorSnapshot] = useState<string | null>(null);
  const [vatMode, setVatMode] = useState<VatMode>("NET");
  const [cargoUsdPerKg, setCargoUsdPerKg] = useState("");
  const [deliveryType, setDeliveryType] = useState("");
  const [usdUahRate, setUsdUahRate] = useState("");
  const [deliveryManual, setDeliveryManual] = useState(false);
  const [deliveryAmount, setDeliveryAmount] = useState("");
  const [thresholdOverride, setThresholdOverride] = useState("");

  useEffect(() => {
    if (!orderItemMaterialId) {
      setDetail(null);
      return;
    }
    setLoading(true);
    setError(null);
    startTransition(async () => {
      const result = await getOrderMaterialDetailAction(orderItemMaterialId);
      setLoading(false);
      if (!result.ok) {
        setError("Не вдалося завантажити матеріал.");
        return;
      }
      const loaded = result.detail;
      setDetail(loaded);
      setSupplierId(loaded.supplierId ?? "");
      setColorSnapshot(loaded.colorSnapshot ?? null);
      if (loaded.isFabric && loaded.companyCostVatMode) {
        setVatMode(loaded.costVatOverride ?? loaded.companyCostVatMode);
      }
      setCargoUsdPerKg(
        loaded.cargoUsdPerKg != null ? String(loaded.cargoUsdPerKg) : "",
      );
      setDeliveryType(
        "deliveryType" in loaded && loaded.deliveryType
          ? String(loaded.deliveryType)
          : "",
      );
      const hasRateOverride =
        loaded.defaultUsdUahRate != null &&
        Math.abs(loaded.usdUahRate - loaded.defaultUsdUahRate) > 0.0001;
      setUsdUahRate(hasRateOverride ? String(loaded.usdUahRate) : "");
      setDeliveryManual(Boolean(loaded.fabricDeliveryManual));
      setDeliveryAmount(String(loaded.fabricDeliveryAmount ?? 0));
      setThresholdOverride(
        loaded.minWholesaleMetersOverride != null
          ? String(loaded.minWholesaleMetersOverride)
          : "",
      );
    });
  }, [orderItemMaterialId]);

  const live = useMemo(() => {
    if (!detail?.isFabric) return null;
    const base = previewForSupplier(detail, supplierId);
    if (!base) return null;

    const metersNeeded = base.metersNeeded;
    const metersPerKg = detail.metersPerKg;
    const kgNeeded =
      metersPerKg != null && metersPerKg > 0 && metersNeeded > 0
        ? round1(metersNeeded / metersPerKg)
        : base.kgNeeded;

    const overrideParsed = parseOptionalNumber(thresholdOverride);
    const catalogThreshold = base.catalogMinWholesaleMeters ?? null;
    const hasCut = Boolean(base.hasCutPrice ?? detail.hasCutPrice);
    const hasWholesale = Boolean(
      base.hasWholesalePrice ??
        detail.hasWholesalePrice ??
        ((base.wholesalePurchasePriceNet ?? base.wholesalePurchasePrice ?? 0) > 0),
    );
    const effectiveThreshold =
      overrideParsed != null && overrideParsed > 0
        ? overrideParsed
        : hasCut && catalogThreshold != null && catalogThreshold > 0
          ? catalogThreshold
          : null;

    const wholesaleForVat =
      vatMode === "NET"
        ? (base.wholesalePurchasePriceNet ?? base.wholesalePurchasePrice ?? 0)
        : (base.wholesalePurchasePriceGross ?? base.wholesalePurchasePrice ?? 0);
    const priced = resolveOrderFabricPurchasePrice({
      metersNeeded,
      wholesalePurchasePrice: wholesaleForVat,
      cutPurchasePrice: base.cutPurchasePrice,
      minWholesaleMeters: effectiveThreshold,
    });
    const purchasePrice = priced.purchasePrice;
    const pricingMode = priced.pricingMode;
    const pricingModeLabel = fabricPricingModeLabel(pricingMode);

    const cargoParsed = parseOptionalNumber(cargoUsdPerKg);
    const cargo =
      cargoParsed != null && cargoParsed >= 0
        ? cargoParsed
        : base.cargoUsdPerKg ?? detail.defaultCargoUsdPerKg;
    const rateParsed = parseOptionalNumber(usdUahRate);
    const rate =
      rateParsed != null && rateParsed > 0
        ? rateParsed
        : (detail.defaultUsdUahRate ?? detail.usdUahRate ?? 0);
    const deliveryComputed = deliveryFromCargo(kgNeeded, cargo, rate);
    const materialPartyCost = Math.round(purchasePrice * metersNeeded * 100) / 100;

    return {
      ...base,
      purchasePrice,
      cargo,
      rate,
      metersNeeded,
      kgNeeded,
      deliveryComputed,
      materialPartyCost,
      pricingMode,
      pricingModeLabel,
      hasCutPrice: hasCut,
      hasWholesalePrice: hasWholesale,
      effectiveThreshold,
      catalogMinWholesaleMeters: catalogThreshold,
      thresholdIsOverride: overrideParsed != null && overrideParsed > 0,
    };
  }, [detail, supplierId, vatMode, cargoUsdPerKg, usdUahRate, thresholdOverride]);

  useEffect(() => {
    if (!live || deliveryManual) return;
    setDeliveryAmount(String(live.deliveryComputed));
  }, [live?.deliveryComputed, deliveryManual]);

  function handleSupplierChange(nextSupplierId: string) {
    setSupplierId(nextSupplierId);
    if (detail) {
      const offers = (detail.offers ?? []).map((offer) => ({
        supplierId: offer.supplierId,
        isPrimary: offer.isPrimary,
        availableColors: ("availableColors" in offer ? offer.availableColors : []) ?? [],
      }));
      setColorSnapshot(
        reconcileColorForSupplier({
          color: colorSnapshot,
          supplierId: nextSupplierId || null,
          offers,
          materialFallback: detail.materialAvailableColors ?? [],
        }),
      );
    }
    const offer = (detail?.offers ?? []).find((row) => row.supplierId === nextSupplierId) as
      | {
          deliveryType?: string;
          deliveryOptions?: Array<{ type: string; rateUsdPerKg?: number; rateUah?: number; label: string }>;
          purchasePricePerUnit?: number | null;
        }
      | undefined;
    const options = offer?.deliveryOptions ?? [];
    if (options.length > 0) {
      const preferred =
        options.find((opt) => opt.type === offer?.deliveryType) ?? options[0]!;
      setDeliveryType(preferred.type);
      if (detail?.isFabric && preferred.rateUsdPerKg != null) {
        setCargoUsdPerKg(String(preferred.rateUsdPerKg));
      }
    } else if (detail?.isFabric) {
      const preview = previewForSupplier(detail, nextSupplierId);
      if (preview?.cargoUsdPerKg != null) {
        setCargoUsdPerKg(String(preview.cargoUsdPerKg));
      }
      setDeliveryType("");
    } else {
      setDeliveryType("");
    }
  }

  const isDirty = useMemo(() => {
    if (!detail || locked) return false;
    if ((supplierId || "") !== (detail.supplierId ?? "")) return true;
    if ((colorSnapshot ?? null) !== (detail.colorSnapshot ?? null)) return true;
    if (!detail.isFabric) {
      return deliveryType !== (detail.deliveryType ? String(detail.deliveryType) : "");
    }
    const loadedVat = detail.costVatOverride ?? detail.companyCostVatMode;
    if (vatMode !== loadedVat) return true;
    const loadedCargo =
      detail.cargoUsdPerKg != null ? String(detail.cargoUsdPerKg) : "";
    if (cargoUsdPerKg.trim() !== loadedCargo) return true;
    const loadedDeliveryType =
      "deliveryType" in detail && detail.deliveryType
        ? String(detail.deliveryType)
        : "";
    if (deliveryType !== loadedDeliveryType) return true;
    const hasRateOverride =
      detail.defaultUsdUahRate != null &&
      Math.abs(detail.usdUahRate - detail.defaultUsdUahRate) > 0.0001;
    const loadedRate = hasRateOverride ? String(detail.usdUahRate) : "";
    if (usdUahRate.trim() !== loadedRate) return true;
    if (Boolean(deliveryManual) !== Boolean(detail.fabricDeliveryManual)) return true;
    if (deliveryManual) {
      const loadedAmount = String(detail.fabricDeliveryAmount ?? 0);
      if (deliveryAmount.trim() !== loadedAmount) return true;
    }
    const loadedThreshold =
      detail.minWholesaleMetersOverride != null
        ? String(detail.minWholesaleMetersOverride)
        : "";
    if (thresholdOverride.trim() !== loadedThreshold) return true;
    return false;
  }, [
    detail,
    locked,
    supplierId,
    colorSnapshot,
    deliveryType,
    vatMode,
    cargoUsdPerKg,
    usdUahRate,
    deliveryManual,
    deliveryAmount,
    thresholdOverride,
  ]);

  const discardClose = useCallback(() => {
    onClose();
  }, [onClose]);

  const { leaveOpen, requestClose, stay, discard } = useUnsavedCloseGuard({
    dirty: isDirty,
    pending,
    onDiscard: discardClose,
  });

  function apply() {
    if (!detail) return;
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("id", detail.id);
    formData.set("supplierId", supplierId);
    formData.set("colorSnapshot", colorSnapshot ?? "");
    if (!detail.isFabric) {
      if (deliveryType) formData.set("deliveryType", deliveryType);
      startTransition(async () => {
        const result = await updateOrderMaterialTermsAction(formData);
        if (!result.ok) {
          setError("Не вдалося зберегти постачальника / колір.");
          return;
        }
        router.refresh();
        onClose();
      });
      return;
    }
    formData.set("cargoUsdPerKg", cargoUsdPerKg);
    formData.set("deliveryType", deliveryType);
    formData.set("usdUahRate", usdUahRate);
    formData.set(
      "costVatOverride",
      vatMode === detail.companyCostVatMode ? "COMPANY" : vatMode,
    );
    formData.set("fabricDeliveryManual", deliveryManual ? "1" : "0");
    formData.set(
      "fabricDeliveryAmount",
      deliveryManual ? deliveryAmount : String(live?.deliveryComputed ?? detail.fabricDeliveryComputed),
    );
    formData.set("minWholesaleMetersOverride", thresholdOverride.trim());
    startTransition(async () => {
      const result = await updateOrderMaterialTermsAction(formData);
      if (!result.ok) {
        setError("Не вдалося застосувати умови.");
        return;
      }
      router.refresh();
      onClose();
    });
  }

  const open = Boolean(orderItemMaterialId);
  const qtyUnit = detail
    ? materialQtyUnitShort(resolveFabricUnitMode(detail.unit))
    : "м";

  return (
    <>
    <SidePanel
      open={open}
      onClose={locked ? onClose : requestClose}
      title={detail?.name ?? "Матеріал"}
      description="Закупівля, партія та доставка для цієї позиції"
      width="lg"
      footer={
        locked ? (
          <Button variant="ghost" onClick={onClose}>
            Закрити
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={requestClose} disabled={pending}>
              Скасувати
            </Button>
            <Button onClick={apply} loading={pending} disabled={pending || loading || !detail}>
              {pending ? "Збереження…" : "Застосувати до замовлення"}
            </Button>
          </>
        )
      }
    >
      {loading && !detail ? (
        <SidePanelSkeleton sections={3} />
      ) : error ? (
        <Banner tone="danger">{error}</Banner>
      ) : detail ? (
        <SoftBusy busy={pending} label="Збереження матеріалу…">
        <div className="space-y-4">
          {detail.isFabric && live ? (
            <>
              <Section title="Закупівля">
                <SupplierColorFields
                  supplierId={supplierId || null}
                  deliveryType={deliveryType || null}
                  color={colorSnapshot}
                  offers={(detail.offers ?? []).map((offer) => ({
                    supplierId: offer.supplierId,
                    supplierName: offer.supplierName,
                    isPrimary: offer.isPrimary,
                    availableColors:
                      ("availableColors" in offer ? offer.availableColors : []) ?? [],
                    preferredDeliveryType:
                      "deliveryType" in offer ? offer.deliveryType : null,
                    deliveryOptions:
                      "deliveryOptions" in offer
                        ? (offer.deliveryOptions ?? []).map((opt) => ({
                            type: opt.type,
                            label: opt.label,
                            rateLabel:
                              "rateLabel" in opt && opt.rateLabel
                                ? String(opt.rateLabel)
                                : opt.rateUsdPerKg
                                  ? `${opt.rateUsdPerKg} $/кг`
                                  : undefined,
                          }))
                        : undefined,
                  }))}
                  materialFallbackColors={detail.materialAvailableColors ?? []}
                  disabled={locked || pending}
                  onSupplierDeliveryChange={(next) => {
                    handleSupplierChange(next.supplierId ?? "");
                    if (next.deliveryType) setDeliveryType(next.deliveryType);
                    else setDeliveryType("");
                  }}
                  onColorChange={setColorSnapshot}
                />

                <div className="space-y-1.5">
                  <span className="block text-[11px] font-medium text-[var(--color-text-tertiary)]">
                    ПДВ у ціні постачальника
                  </span>
                  <Segmented
                    disabled={locked || pending}
                    value={vatMode}
                    onChange={(value) => setVatMode(value as VatMode)}
                    options={[
                      { value: "NET", label: "без ПДВ" },
                      { value: "GROSS", label: "з ПДВ" },
                    ]}
                  />
                  <p className="type-caption">
                    За замовчуванням у компанії:{" "}
                    {vatLabel(detail.companyCostVatMode ?? "NET")}
                  </p>
                </div>

                <dl className="grid gap-2 text-[13px]">
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">
                      ₴/{qtyUnit} (без доставки)
                    </dt>
                    <dd className="tabular text-[15px] font-semibold">
                      {formatMoneyUah(live.purchasePrice)}
                      <span className="ml-1.5 text-[11px] font-normal text-[var(--color-text-tertiary)]">
                        · {vatLabel(vatMode)}
                      </span>
                      {live.pricingModeLabel ? (
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--color-text-tertiary)]">
                          · {live.pricingModeLabel}
                        </span>
                      ) : null}
                    </dd>
                  </div>
                </dl>
              </Section>

              <Section title="Партія замовлення">
                <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Кількість виробів</dt>
                    <dd className="tabular font-medium">
                      {detail.totalQuantity} шт
                      {detail.sizeCode ? ` (${detail.sizeCode})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Витрата партії</dt>
                    <dd className="tabular font-medium">
                      {live.metersNeeded} {qtyUnit}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Вага партії</dt>
                    <dd className="tabular font-medium">
                      {live.kgNeeded != null ? `${live.kgNeeded} кг` : "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Вартість матеріалу</dt>
                    <dd className="tabular font-semibold">
                      {formatMoneyUah(live.materialPartyCost)}
                    </dd>
                  </div>
                </dl>
                <p className="type-caption">
                  {detail.consumption} {formatUnit(detail.unit)}/од. × (1 + {detail.waste}%) ×{" "}
                  {lineQuantity(detail)} шт = {live.metersNeeded} {qtyUnit}
                </p>
                {(() => {
                  const oversizeQty = Object.entries(detail.quantitiesBySize ?? {}).filter(
                    ([code, qty]) => isOversizeCode(code) && qty > 0,
                  );
                  if (oversizeQty.length === 0) return null;
                  const base = detail.consumption;
                  const effective = effectiveOversizeConsumption(base);
                  return (
                    <div className="mt-2 space-y-1 rounded-[6px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-2.5 py-2">
                      <p className="text-[11.5px] font-medium text-[var(--color-text-secondary)]">
                        Крупні розміри в тиражі
                      </p>
                      <p className="type-caption">
                        База {base} {formatUnit(detail.unit)}/од. → {OVERSIZE_RANGE_LABEL} ≈ {effective}{" "}
                        {formatUnit(detail.unit)}/од. (+{oversizeMaterialPct()}% у калькуляції).{" "}
                        {oversizeUpliftCaption()}.
                      </p>
                      <p className="type-caption">
                        {oversizeQty
                          .map(([code, qty]) => `${code}: ${qty} шт`)
                          .join(" · ")}
                      </p>
                    </div>
                  );
                })()}
              </Section>

              <Section title="Опт">
                {(() => {
                  const hasWholesale = Boolean(live.hasWholesalePrice);
                  const hasCut = Boolean(live.hasCutPrice);
                  const threshold = live.effectiveThreshold;
                  const atWholesale =
                    !hasCut ||
                    live.pricingMode === "wholesale" ||
                    (threshold != null && live.metersNeeded >= threshold);
                  const modeLabel =
                    !hasCut
                      ? "Ціна"
                      : atWholesale
                        ? "Ціна"
                        : live.pricingMode === "cut"
                          ? "Роздріб"
                          : "Ціна";
                  const catalogHint =
                    live.catalogMinWholesaleMeters != null
                      ? `${live.catalogMinWholesaleMeters} ${qtyUnit}`
                      : "не задана";

                  return (
                    <>
                      <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">Межа зараз</dt>
                          <dd className="tabular font-medium">
                            {threshold != null ? `${threshold} ${qtyUnit}` : "—"}
                            {live.thresholdIsOverride ? (
                              <span className="ml-1.5 text-[11px] font-normal text-[var(--color-text-tertiary)]">
                                · для замовлення
                              </span>
                            ) : null}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">Режим зараз</dt>
                          <dd className="font-medium">{modeLabel}</dd>
                        </div>
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">Витрата партії</dt>
                          <dd className="tabular font-medium">
                            {live.metersNeeded} {qtyUnit}
                          </dd>
                        </div>
                      </dl>

                      {hasWholesale && !locked ? (
                        <div className="space-y-1.5 border-t border-[var(--color-divider)] pt-3">
                          <NumberField
                            label="Межа витрати для цього замовлення"
                            value={thresholdOverride}
                            placeholder={
                              live.catalogMinWholesaleMeters != null
                                ? String(live.catalogMinWholesaleMeters)
                                : "напр. 50"
                            }
                            suffix={qtyUnit}
                            step="0.1"
                            disabled={pending}
                            onChange={setThresholdOverride}
                          />
                          <p className="type-caption">
                            Порожньо = з каталогу ({catalogHint}). Зміна лише для цієї позиції
                            замовлення.
                          </p>
                        </div>
                      ) : null}

                      {detail.wholesaleNote ? (
                        <p className="type-caption">Примітка: {detail.wholesaleNote}</p>
                      ) : null}
                      {!hasWholesale ? (
                        <p className="type-caption">
                          Немає ціни роздробу у каталозі — межу задати неможливо.
                        </p>
                      ) : !hasCut ? (
                        <p className="type-caption">
                          У каталозі одна ціна — ₴/{qtyUnit} не перемикається. Межу все одно можна
                          зафіксувати для цього замовлення.
                          {threshold != null
                            ? live.metersNeeded >= threshold
                              ? ` Витрата ≥ ${threshold} ${qtyUnit}.`
                              : ` До межі ще ${Math.round((threshold - live.metersNeeded) * 10) / 10} ${qtyUnit}.`
                            : ""}
                        </p>
                      ) : threshold != null ? (
                        <p className="type-caption">
                          {atWholesale
                            ? `Витрата ≥ ${threshold} ${qtyUnit} — базова ціна.`
                            : `До базової ще ${Math.round((threshold - live.metersNeeded) * 10) / 10} ${qtyUnit} (зараз роздріб).`}
                        </p>
                      ) : (
                        <p className="type-caption">
                          Задайте межу вище або в картці матеріалу (умови постачальника).
                        </p>
                      )}
                    </>
                  );
                })()}
              </Section>

              <Section title="Доставка">
                <dl className="grid gap-2 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">Розрахунок</dt>
                    <dd className="tabular font-semibold">
                      {formatMoneyUah(live.deliveryComputed)}
                      {deliveryManual ? (
                        <span className="ml-1.5 text-[11px] font-normal text-[var(--color-text-tertiary)]">
                          · довідково (cargo)
                        </span>
                      ) : null}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--color-text-tertiary)]">У калькуляції</dt>
                    <dd className="tabular font-semibold">
                      {formatMoneyUah(
                        deliveryManual ? Number(deliveryAmount) || 0 : live.deliveryComputed,
                      )}
                      {deliveryManual ? " · вручну" : " · авто"}
                    </dd>
                  </div>
                </dl>

                {!locked ? (
                  <div className="space-y-3 border-t border-[var(--color-divider)] pt-3">
                    <div className="space-y-1.5">
                      <span className="block text-[11px] font-medium text-[var(--color-text-tertiary)]">
                        Як потрапляє в калькуляцію
                      </span>
                      <Segmented
                        disabled={pending}
                        value={deliveryManual ? "manual" : "auto"}
                        onChange={(value) => {
                          const manual = value === "manual";
                          setDeliveryManual(manual);
                          if (!manual && live) {
                            setDeliveryAmount(String(live.deliveryComputed));
                          }
                        }}
                        options={[
                          { value: "auto", label: "Авто" },
                          { value: "manual", label: "Вручну (фіксована сума)" },
                        ]}
                      />
                    </div>

                    {deliveryManual ? (
                      <div className="space-y-2">
                        <NumberField
                          label="Сума доставки цієї тканини в калькуляції"
                          suffix="₴"
                          step="0.1"
                          value={deliveryAmount}
                          onChange={setDeliveryAmount}
                        />
                      </div>
                    ) : (
                      <>
                        {(() => {
                          const offer = (detail.offers ?? []).find(
                            (row) => row.supplierId === supplierId,
                          ) as
                            | {
                                deliveryOptions?: Array<{
                                  type: string;
                                  rateUsdPerKg: number;
                                  label: string;
                                }>;
                              }
                            | undefined;
                          const options = offer?.deliveryOptions ?? [];
                          if (options.length === 0) {
                            return (
                              <p className="type-caption text-[var(--color-warning-text)]">
                                У цього постачальника не задано тарифів доставки — пропишіть
                                CARGO / НП у картці матеріалу.
                              </p>
                            );
                          }
                          const activeType = deliveryType || options[0]!.type;
                          return (
                            <Select
                              label="Тип доставки"
                              value={activeType}
                              onChange={(event) => {
                                const next = event.target.value;
                                setDeliveryType(next);
                                const match = options.find((opt) => opt.type === next);
                                if (match) setCargoUsdPerKg(String(match.rateUsdPerKg));
                              }}
                              disabled={locked || pending}
                            >
                              {options.map((opt) => (
                                <option key={opt.type} value={opt.type}>
                                  {opt.label} · {opt.rateUsdPerKg} $/кг
                                </option>
                              ))}
                            </Select>
                          );
                        })()}
                        <div className="flex flex-wrap gap-4">
                          <NumberField
                            label="Тариф"
                            prefix="$"
                            suffix="/кг"
                            value={cargoUsdPerKg}
                            placeholder={String(detail.defaultCargoUsdPerKg)}
                            onChange={setCargoUsdPerKg}
                          />
                          <NumberField
                            label="Курс"
                            suffix="₴/$"
                            step="0.01"
                            value={usdUahRate}
                            placeholder={String(detail.defaultUsdUahRate ?? detail.usdUahRate)}
                            onChange={setUsdUahRate}
                          />
                        </div>
                        <p className="type-caption tabular text-[var(--color-text-secondary)]">
                          {live.kgNeeded ?? "—"} кг × ${live.cargo}/кг × {live.rate} ₴/$ ={" "}
                          {formatMoneyUah(live.deliveryComputed)}
                        </p>
                      </>
                    )}
                  </div>
                ) : null}
              </Section>
            </>
          ) : detail && !detail.isFabric ? (
            <Section title="Постачальник і колір">
              <SupplierColorFields
                supplierId={supplierId || null}
                deliveryType={deliveryType || null}
                color={colorSnapshot}
                offers={(detail.offers ?? []).map((offer) => ({
                  supplierId: offer.supplierId,
                  supplierName: offer.supplierName,
                  isPrimary: offer.isPrimary,
                  availableColors:
                    ("availableColors" in offer ? offer.availableColors : []) ?? [],
                  preferredDeliveryType:
                    "deliveryType" in offer ? offer.deliveryType : null,
                  deliveryOptions:
                    "deliveryOptions" in offer
                      ? (offer.deliveryOptions ?? []).map((opt) => ({
                          type: opt.type,
                          label: opt.label,
                          rateLabel:
                            "rateLabel" in opt && opt.rateLabel
                              ? String(opt.rateLabel)
                              : opt.rateUsdPerKg
                                ? `${opt.rateUsdPerKg} $/кг`
                                : undefined,
                        }))
                      : undefined,
                }))}
                materialFallbackColors={detail.materialAvailableColors ?? []}
                disabled={locked || pending}
                onSupplierDeliveryChange={(next) => {
                  handleSupplierChange(next.supplierId ?? "");
                  if (next.deliveryType) setDeliveryType(next.deliveryType);
                  else setDeliveryType("");
                }}
                onColorChange={setColorSnapshot}
              />
              <dl className="mt-3 grid gap-2 text-[13px] sm:grid-cols-2">
                <div>
                  <dt className="text-[var(--color-text-tertiary)]">Ціна закупівлі / од.</dt>
                  <dd className="tabular font-semibold">
                    {formatMoneyUah(
                      (() => {
                        const offer = (detail.offers ?? []).find(
                          (row) => row.supplierId === supplierId,
                        ) as
                          | {
                              purchasePackPrice?: number | null;
                              purchasePricePerUnit?: number | null;
                            }
                          | undefined;
                        const pack = detail as MaterialDetail & {
                          unitsPerPack?: number | null;
                          purchasePackPrice?: number | null;
                        };
                        if (
                          offer?.purchasePackPrice != null &&
                          pack.unitsPerPack != null &&
                          pack.unitsPerPack > 0
                        ) {
                          const n = Math.floor(pack.unitsPerPack);
                          return (
                            Math.round((Number(offer.purchasePackPrice) / n) * 10000) /
                            10000
                          );
                        }
                        return offer?.purchasePricePerUnit ?? detail.purchasePrice;
                      })(),
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--color-text-tertiary)]">У собівартість партії</dt>
                  <dd className="tabular font-medium">
                    {lineQuantity(detail)} шт · {formatMoneyUah(detail.materialPartyCost ?? 0)}
                  </dd>
                </div>
                {(() => {
                  const pack = detail as MaterialDetail & {
                    unitsNeeded?: number;
                    unitsPerPack?: number | null;
                    packsToOrder?: number;
                    purchasePackPrice?: number | null;
                    packGoodsCost?: number | null;
                    packDeliveryCost?: number | null;
                    packOrderTotal?: number | null;
                  };
                  return (
                    <>
                      {pack.unitsNeeded != null ? (
                        <div>
                          <dt className="text-[var(--color-text-tertiary)]">Потрібно</dt>
                          <dd className="tabular font-medium">
                            {pack.unitsNeeded} {detail.unit || "од."}
                          </dd>
                        </div>
                      ) : null}
                      {pack.unitsPerPack != null && pack.unitsPerPack > 0 ? (
                        <>
                          <div>
                            <dt className="text-[var(--color-text-tertiary)]">Замовити упаковок</dt>
                            <dd className="tabular font-semibold">
                              {pack.packsToOrder ?? 0} × {pack.unitsPerPack} шт
                            </dd>
                          </div>
                          {pack.purchasePackPrice != null ? (
                            <div>
                              <dt className="text-[var(--color-text-tertiary)]">Товар (упаковки)</dt>
                              <dd className="tabular font-medium">
                                {formatMoneyUah(pack.packGoodsCost ?? 0)}
                              </dd>
                            </div>
                          ) : null}
                          {pack.packDeliveryCost != null && pack.packDeliveryCost > 0 ? (
                            <div>
                              <dt className="text-[var(--color-text-tertiary)]">Доставка упаковок</dt>
                              <dd className="tabular font-medium">
                                {formatMoneyUah(pack.packDeliveryCost)}
                              </dd>
                            </div>
                          ) : null}
                          {pack.packOrderTotal != null ? (
                            <div className="sm:col-span-2">
                              <dt className="text-[var(--color-text-tertiary)]">
                                Сума закупівлі фурнітури
                              </dt>
                              <dd className="tabular font-semibold">
                                {formatMoneyUah(pack.packOrderTotal)}
                              </dd>
                            </div>
                          ) : null}
                        </>
                      ) : null}
                    </>
                  );
                })()}
              </dl>
              <Banner tone="info">
                {detail.unitsPerPack != null && detail.unitsPerPack > 0
                  ? "Оберіть постачальника — підставляться його ціна й доставка упаковки. Собівартість виробу = ₴/од."
                  : "У картці матеріалу задайте «шт в упаковці», а в умовах постачальника — ціну й доставку упаковки."}
              </Banner>
            </Section>
          ) : null}
        </div>
        </SoftBusy>
      ) : null}
    </SidePanel>
    <UnsavedChangesDialog
      open={leaveOpen}
      pending={pending}
      onStay={stay}
      onDiscard={discard}
    />
    </>
  );
}
