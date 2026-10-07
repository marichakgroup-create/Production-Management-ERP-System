"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, FormGroup } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { IconClients, IconPurchaseKg } from "@/components/ui/Icons";
import { SupplierPaletteEditor } from "@/components/catalog/SupplierPaletteEditor";
import { DeliveryRatesFields } from "@/components/catalog/DeliveryRatesFields";
import {
  deriveFabricPricing,
  fabricQuoteSuffix,
  meterUahFromSupplierQuote,
  supplierQuoteFromMeterUah,
  type FabricPricingGlobals,
  type FabricQuoteCurrency,
  type FabricQuoteUnit,
  type FabricUnitMode,
} from "@/lib/fabric-pricing";
import {
  ModeSegment,
  PurchaseModeRow,
  inferFabricDeliveryUiMode,
  inferFabricQuoteCurrency,
  inferFabricQuoteUnit,
  inferFabricTierMode,
  inferUnitDeliveryUiMode,
  inferUnitQuoteMode,
  amountToUah,
  amountFromUah,
  type FabricDeliveryUiMode,
  type FabricTierMode,
  type MoneyCurrency,
  type UnitDeliveryUiMode,
  type UnitQuoteMode,
} from "@/components/catalog/FabricPurchaseModes";
import {
  fabricDeliveryTypeLabel,
  type FabricDeliveryTypeCode,
} from "@/lib/fabric-delivery-types";
import { resolveSupplierDeliveryRate } from "@/lib/supplier-delivery-rates";
import { formatMoneyUah, cn } from "@/lib/utils";
import { swatchForColorLabel } from "@/lib/trim-colors";
import { getSupplierPaletteAction } from "@/server/domains/catalog/actions";
import {
  deriveTrimUnitPriceFromSupplier,
  hasTrimKgQuote,
  hasTrimPackQuote,
  unitPriceFromKgUsd,
} from "@/lib/trim-pack-pricing";
import { materialPackLabels, materialQtyUnitShort } from "@/lib/material-pack-labels";

export type MaterialSupplierOfferDraft = {
  key: string;
  isPrimary: boolean;
  supplierName: string;
  deliveryType: FabricDeliveryTypeCode;
  cargoUsdPerKg: string;
  npStandardUsdPerKg: string;
  npVolumeUsdPerKg: string;
  priceKgUsd: string;
  priceKgUsdVat: string;
  priceMeterUahNoVat: string;
  priceMeterUahVat: string;
  priceMeterUahCutVat: string;
  minWholesaleMeters: string;
  wholesaleNote: string;
  /** Trim: supplier pack quote (₴). */
  purchasePackPrice: string;
  /** Trim: delivery for pack (₴), or from typed delivery tabs. */
  packDeliveryCostUah: string;
  /** Comma-separated color labels (same wire format as MaterialSuppliersEditor). */
  availableColors: string;
};

type DraftForm = Omit<MaterialSupplierOfferDraft, "key" | "isPrimary"> & {
  asPrimary: boolean;
};

function emptyForm(
  asPrimary: boolean,
  deliveryType: FabricDeliveryTypeCode = "CARGO",
  _fabricGlobals?: FabricPricingGlobals,
): DraftForm {
  void _fabricGlobals;
  return {
    supplierName: "",
    deliveryType,
    cargoUsdPerKg: "",
    npStandardUsdPerKg: "",
    npVolumeUsdPerKg: "",
    priceKgUsd: "",
    priceKgUsdVat: "",
    priceMeterUahNoVat: "",
    priceMeterUahVat: "",
    priceMeterUahCutVat: "",
    minWholesaleMeters: "",
    wholesaleNote: "",
    purchasePackPrice: "",
    packDeliveryCostUah: "",
    availableColors: "",
    asPrimary,
  };
}

function formFromOffer(row: MaterialSupplierOfferDraft): DraftForm {
  return {
    supplierName: row.supplierName,
    deliveryType: row.deliveryType,
    cargoUsdPerKg: row.cargoUsdPerKg,
    npStandardUsdPerKg: row.npStandardUsdPerKg ?? "",
    npVolumeUsdPerKg: row.npVolumeUsdPerKg ?? "",
    priceKgUsd: row.priceKgUsd,
    priceKgUsdVat: row.priceKgUsdVat,
    priceMeterUahNoVat: row.priceMeterUahNoVat,
    priceMeterUahVat: row.priceMeterUahVat,
    priceMeterUahCutVat: row.priceMeterUahCutVat,
    minWholesaleMeters: row.minWholesaleMeters,
    wholesaleNote: row.wholesaleNote,
    purchasePackPrice: row.purchasePackPrice ?? "",
    packDeliveryCostUah: row.packDeliveryCostUah ?? "",
    availableColors: row.availableColors,
    asPrimary: row.isPrimary,
  };
}

function trimDraftRates(draft: DraftForm) {
  return {
    deliveryType: draft.deliveryType,
    cargoUsdPerKg: draft.cargoUsdPerKg ? Number(draft.cargoUsdPerKg) : null,
    npStandardUsdPerKg: draft.npStandardUsdPerKg
      ? Number(draft.npStandardUsdPerKg)
      : null,
    npVolumeUsdPerKg: draft.npVolumeUsdPerKg ? Number(draft.npVolumeUsdPerKg) : null,
  };
}

function newKey() {
  return `draft-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function MaterialSupplierDraftsEditor({
  offers,
  onChange,
  metersPerKg,
  unitsPerPack = null,
  unitsPerKg = null,
  unitMode = "pcs",
  fabricGlobals,
  knownSuppliers,
  defaultDeliveryType = "CARGO",
  onEditingChange,
  pricingKind = "fabric",
  usdUahRate,
  onUsdUahRateChange,
  allowPackQuote = true,
}: {
  offers: MaterialSupplierOfferDraft[];
  onChange: (next: MaterialSupplierOfferDraft[]) => void;
  metersPerKg?: number | null;
  unitsPerPack?: number | null;
  unitsPerKg?: number | null;
  unitMode?: FabricUnitMode;
  fabricGlobals: FabricPricingGlobals;
  knownSuppliers: string[];
  defaultDeliveryType?: FabricDeliveryTypeCode;
  onEditingChange: (editing: boolean) => void;
  pricingKind?: "fabric" | "unit";
  usdUahRate?: number;
  onUsdUahRateChange?: (next: number) => void;
  /** False for «Інший матеріал» — only ₴/од., no pack / $/кг modes. */
  allowPackQuote?: boolean;
}) {
  const packLabels = materialPackLabels(unitMode);
  const qtyUnit = materialQtyUnitShort(unitMode);
  const [error, setError] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<DraftForm>(() =>
    emptyForm(true, defaultDeliveryType, fabricGlobals),
  );
  const [quoteCurrency, setQuoteCurrency] = useState<FabricQuoteCurrency>("uah");
  const [quoteUnit, setQuoteUnit] = useState<FabricQuoteUnit>("meter");
  const [tierMode, setTierMode] = useState<FabricTierMode>("single");
  const [deliveryUiMode, setDeliveryUiMode] = useState<FabricDeliveryUiMode>("kg");
  const [unitQuoteMode, setUnitQuoteMode] = useState<UnitQuoteMode>("each");
  const [unitDeliveryUiMode, setUnitDeliveryUiMode] = useState<UnitDeliveryUiMode>("kg");
  const [unitQuoteCurrency, setUnitQuoteCurrency] = useState<MoneyCurrency>("uah");
  const [fixedDeliveryCurrency, setFixedDeliveryCurrency] = useState<MoneyCurrency>("uah");
  const [localUsdRate, setLocalUsdRate] = useState(
    String(usdUahRate ?? fabricGlobals.usdUahRate),
  );

  useEffect(() => {
    if (usdUahRate != null && usdUahRate > 0) {
      setLocalUsdRate(String(usdUahRate));
    }
  }, [usdUahRate]);

  useEffect(() => {
    if (!allowPackQuote && unitQuoteMode !== "each") {
      setUnitQuoteMode("each");
      setDraft((prev) => ({
        ...prev,
        purchasePackPrice: "",
        priceKgUsd: "",
        priceKgUsdVat: "",
      }));
    }
  }, [allowPackQuote, unitQuoteMode]);

  function applyModesFromDraft(next: DraftForm) {
    setQuoteCurrency(inferFabricQuoteCurrency(next));
    setQuoteUnit(inferFabricQuoteUnit(next));
    setTierMode(inferFabricTierMode(next));
    setDeliveryUiMode(inferFabricDeliveryUiMode(next));
    setUnitQuoteMode(allowPackQuote ? inferUnitQuoteMode(next) : "each");
    setUnitDeliveryUiMode(inferUnitDeliveryUiMode(next));
    setUnitQuoteCurrency("uah");
    setFixedDeliveryCurrency("uah");
  }

  const effectiveUsdRate = (() => {
    const n = Number(String(localUsdRate).replace(",", "."));
    if (Number.isFinite(n) && n > 0) return n;
    return usdUahRate ?? fabricGlobals.usdUahRate;
  })();

  const liveGlobals = useMemo<FabricPricingGlobals>(() => {
    const resolved = resolveSupplierDeliveryRate(
      {
        deliveryType: draft.deliveryType,
        cargoUsdPerKg: draft.cargoUsdPerKg ? Number(draft.cargoUsdPerKg) : null,
        npStandardUsdPerKg: draft.npStandardUsdPerKg
          ? Number(draft.npStandardUsdPerKg)
          : null,
        npVolumeUsdPerKg: draft.npVolumeUsdPerKg ? Number(draft.npVolumeUsdPerKg) : null,
      },
      fabricGlobals,
    );
    return {
      ...fabricGlobals,
      usdUahRate: effectiveUsdRate,
      fabricCargoUsdPerKg: resolved.rateUsdPerKg,
    };
  }, [fabricGlobals, draft, effectiveUsdRate]);

  function setCourse(next: string) {
    setLocalUsdRate(next);
    const n = Number(String(next).replace(",", "."));
    if (Number.isFinite(n) && n > 0) onUsdUahRateChange?.(n);
  }

  const derived = useMemo(
    () =>
      deriveFabricPricing(
        {
          metersPerKg: metersPerKg ?? null,
          priceKgUsd: draft.priceKgUsd ? Number(draft.priceKgUsd) : null,
          priceKgUsdVat: draft.priceKgUsdVat ? Number(draft.priceKgUsdVat) : null,
          priceMeterUahNoVat: draft.priceMeterUahNoVat
            ? Number(draft.priceMeterUahNoVat)
            : null,
          priceMeterUahVat: draft.priceMeterUahVat ? Number(draft.priceMeterUahVat) : null,
          priceMeterUahCutVat: draft.priceMeterUahCutVat
            ? Number(draft.priceMeterUahCutVat)
            : null,
        },
        liveGlobals,
      ),
    [draft, metersPerKg, liveGlobals],
  );

  function setEditing(next: string | "new" | null) {
    setEditingKey(next);
    onEditingChange(next != null);
  }

  function openNew(asPrimary: boolean) {
    setError(null);
    const next = emptyForm(asPrimary || offers.length === 0, defaultDeliveryType, fabricGlobals);
    setDraft(next);
    if (pricingKind === "fabric") {
      setQuoteCurrency("uah");
      setQuoteUnit("meter");
      setTierMode("single");
      setDeliveryUiMode("kg");
    } else {
      setUnitQuoteMode("each");
      setUnitDeliveryUiMode("kg");
      setUnitQuoteCurrency("uah");
      setFixedDeliveryCurrency("uah");
      setTierMode("single");
    }
    setEditing("new");
  }

  function openEdit(row: MaterialSupplierOfferDraft) {
    setError(null);
    const next = formFromOffer(row);
    setDraft(next);
    applyModesFromDraft(next);
    setEditing(row.key);
  }

  function applyDeliveryRates(
    patch: Pick<
      DraftForm,
      "deliveryType" | "cargoUsdPerKg" | "npStandardUsdPerKg" | "npVolumeUsdPerKg"
    >,
  ) {
    setDraft((prev) => {
      const merged = { ...prev, ...patch };
      if (!merged.priceKgUsd) return merged;
      const resolved = resolveSupplierDeliveryRate(
        {
          deliveryType: merged.deliveryType,
          cargoUsdPerKg: merged.cargoUsdPerKg ? Number(merged.cargoUsdPerKg) : null,
          npStandardUsdPerKg: merged.npStandardUsdPerKg
            ? Number(merged.npStandardUsdPerKg)
            : null,
          npVolumeUsdPerKg: merged.npVolumeUsdPerKg
            ? Number(merged.npVolumeUsdPerKg)
            : null,
        },
        fabricGlobals,
      );
      const auto = deriveFabricPricing(
        {
          metersPerKg: metersPerKg ?? null,
          priceKgUsd: Number(merged.priceKgUsd),
          priceKgUsdVat: merged.priceKgUsdVat ? Number(merged.priceKgUsdVat) : null,
        },
        { ...fabricGlobals, fabricCargoUsdPerKg: resolved.rateUsdPerKg },
      );
      return {
        ...merged,
        priceMeterUahNoVat:
          auto.priceMeterUahNoVat != null
            ? String(auto.priceMeterUahNoVat)
            : merged.priceMeterUahNoVat,
        priceMeterUahVat:
          auto.priceMeterUahVat != null
            ? String(auto.priceMeterUahVat)
            : merged.priceMeterUahVat,
      };
    });
  }

  function saveDraft() {
    setError(null);
    if (!draft.supplierName.trim()) {
      setError("Вкажіть постачальника.");
      return;
    }
    if (pricingKind === "unit") {
      const packPrice = draft.purchasePackPrice.trim();
      const hasPack =
        unitQuoteMode === "pack" &&
        unitsPerPack != null &&
        unitsPerPack > 0 &&
        packPrice !== "" &&
        Number(packPrice) >= 0;
      const hasKg =
        unitQuoteMode === "kg" &&
        hasTrimKgQuote({
          unitsPerKg,
          priceKgUsd: draft.priceKgUsd ? Number(draft.priceKgUsd) : null,
          usdUahRate: effectiveUsdRate,
        });
      const unit = Number(draft.priceMeterUahNoVat);
      if (unitQuoteMode === "kg" && !hasKg) {
        setError(
          unitsPerKg != null && unitsPerKg > 0
            ? "Вкажіть ціну $/кг."
            : "Спочатку вкажіть «Шт / кг» на матеріалі.",
        );
        return;
      }
      if (unitQuoteMode === "pack" && !hasPack) {
        setError(
          unitsPerPack != null && unitsPerPack > 0
            ? "Вкажіть ціну упаковки."
            : "Спочатку вкажіть «Шт в упаковці» на матеріалі.",
        );
        return;
      }
      if (
        unitQuoteMode === "each" &&
        (!(unit >= 0) || draft.priceMeterUahNoVat.trim() === "")
      ) {
        setError(`Вкажіть ціну закупки (${packLabels.unitSuffixUah}).`);
        return;
      }
      if (tierMode === "tier") {
        const cutCheck = draft.priceMeterUahCutVat.trim();
        const thresholdCheck = draft.minWholesaleMeters.trim();
        if (!thresholdCheck || Number(thresholdCheck) <= 0) {
          setError("Вкажіть межу роздробу.");
          return;
        }
        if (!(cutCheck !== "" && Number(cutCheck) > 0)) {
          setError("Вкажіть ціну роздробу.");
          return;
        }
      }
    }
    const cut = draft.priceMeterUahCutVat.trim();
    const threshold = draft.minWholesaleMeters.trim();
    const cutValue = cut ? Number(cut) : 0;
    const hasCut = cutValue > 0;
    if (pricingKind === "fabric") {
      if (tierMode === "tier") {
        if (!hasCut) {
          setError("Вкажіть ціну роздробу.");
          return;
        }
        if (!threshold || Number(threshold) <= 0) {
          setError("Вкажіть межу роздробу.");
          return;
        }
        if (!draft.priceMeterUahNoVat.trim()) {
          setError("Вкажіть базову ціну.");
          return;
        }
      } else {
        const ordinary = draft.priceMeterUahNoVat.trim();
        const needsKg = quoteUnit === "kg";
        const hasUsdKg = draft.priceKgUsd.trim() !== "" && Number(draft.priceKgUsd) > 0;
        if (quoteCurrency === "uah" && quoteUnit === "meter" && !ordinary) {
          setError("Вкажіть ціну ₴/м.");
          return;
        }
        if (quoteCurrency === "usd" && quoteUnit === "kg" && !hasUsdKg && !ordinary) {
          setError("Вкажіть $/кг або ₴/м.");
          return;
        }
        if (needsKg && quoteCurrency === "uah" && !ordinary) {
          setError("Вкажіть ціну ₴/кг (потрібні м.п./кг на матеріалі).");
          return;
        }
        if (quoteCurrency === "usd" && quoteUnit === "meter" && !ordinary) {
          setError("Вкажіть ціну $/м.");
          return;
        }
      }
    }

    const rates = trimDraftRates(draft);
    const saveFixed = pricingKind === "unit" && unitDeliveryUiMode === "fixed";
    const packEntered =
      unitQuoteMode === "pack" && draft.purchasePackPrice.trim() !== ""
        ? Number(draft.purchasePackPrice)
        : null;
    const packPriceUah =
      packEntered != null && Number.isFinite(packEntered)
        ? amountToUah(packEntered, unitQuoteCurrency, effectiveUsdRate)
        : null;
    const fixedEntered =
      saveFixed && draft.packDeliveryCostUah.trim() !== ""
        ? Number(draft.packDeliveryCostUah)
        : null;
    const packDelivery =
      fixedEntered != null && Number.isFinite(fixedEntered)
        ? amountToUah(fixedEntered, fixedDeliveryCurrency, effectiveUsdRate)
        : null;
    const eachEntered =
      unitQuoteMode === "each" && draft.priceMeterUahNoVat.trim() !== ""
        ? Number(draft.priceMeterUahNoVat)
        : null;
    const eachUah =
      eachEntered != null && Number.isFinite(eachEntered)
        ? amountToUah(eachEntered, unitQuoteCurrency, effectiveUsdRate)
        : null;
    const unitFromQuote =
      pricingKind === "unit"
        ? deriveTrimUnitPriceFromSupplier({
            unitsPerPack,
            purchasePackPrice: packPriceUah,
            deliveryRates: rates,
            packDeliveryCostUah:
              packDelivery != null && Number.isFinite(packDelivery) && packDelivery >= 0
                ? packDelivery
                : null,
            unitsPerKg,
            priceKgUsd:
              unitQuoteMode === "kg" && draft.priceKgUsd
                ? Number(draft.priceKgUsd)
                : null,
            usdUahRate: effectiveUsdRate,
            fallbackUnitPrice: eachUah ?? 0,
          })
        : null;

    const deliveryOn =
      (pricingKind === "unit" && unitDeliveryUiMode === "kg") ||
      (pricingKind === "fabric" && deliveryUiMode === "kg");

    const wantPrimary = draft.asPrimary || offers.length === 0;
    const row: MaterialSupplierOfferDraft = {
      key: editingKey === "new" || editingKey == null ? newKey() : editingKey,
      isPrimary: wantPrimary,
      supplierName: draft.supplierName.trim(),
      deliveryType: draft.deliveryType,
      cargoUsdPerKg: deliveryOn ? draft.cargoUsdPerKg : "",
      npStandardUsdPerKg: deliveryOn ? draft.npStandardUsdPerKg : "",
      npVolumeUsdPerKg: deliveryOn ? draft.npVolumeUsdPerKg : "",
      priceKgUsd:
        pricingKind === "unit" && unitQuoteMode === "kg"
          ? draft.priceKgUsd
          : pricingKind === "fabric" && quoteCurrency === "usd" && quoteUnit === "kg"
            ? draft.priceKgUsd
            : "",
      priceKgUsdVat: draft.priceKgUsdVat,
      priceMeterUahNoVat:
        pricingKind === "unit" && unitFromQuote != null && unitFromQuote > 0
          ? String(unitFromQuote)
          : draft.priceMeterUahNoVat ||
            (derived.priceMeterUahNoVat != null ? String(derived.priceMeterUahNoVat) : ""),
      priceMeterUahVat:
        pricingKind === "unit" && unitFromQuote != null && unitFromQuote > 0
          ? String(unitFromQuote)
          : draft.priceMeterUahVat ||
            (derived.priceMeterUahVat != null ? String(derived.priceMeterUahVat) : ""),
      priceMeterUahCutVat: tierMode === "tier" && hasCut ? cut : "",
      minWholesaleMeters:
        tierMode === "tier" && threshold && Number(threshold) > 0 ? threshold : "",
      wholesaleNote: draft.wholesaleNote,
      purchasePackPrice:
        pricingKind === "unit" && packPriceUah != null ? String(packPriceUah) : "",
      packDeliveryCostUah:
        saveFixed && packDelivery != null && Number.isFinite(packDelivery) && packDelivery >= 0
          ? String(packDelivery)
          : "",
      availableColors: draft.availableColors,
    };

    let next = [...offers];
    if (wantPrimary) {
      next = next.map((item) => ({ ...item, isPrimary: false }));
      row.isPrimary = true;
    }

    const index = next.findIndex((item) => item.key === row.key);
    if (index >= 0) next[index] = row;
    else next.push(row);

    if (!next.some((item) => item.isPrimary) && next.length > 0) {
      next[0] = { ...next[0], isPrimary: true };
    }

    onChange(next);
    setEditing(null);
  }

  function removeOffer(key: string) {
    const target = offers.find((item) => item.key === key);
    if (!target) return;
    if (target.isPrimary && offers.length > 1) {
      setError("Спочатку зробіть іншу пропозицію основною.");
      return;
    }
    const next = offers.filter((item) => item.key !== key);
    if (next.length === 1) next[0] = { ...next[0], isPrimary: true };
    onChange(next);
    if (editingKey === key) setEditing(null);
  }

  function makePrimary(key: string) {
    onChange(
      offers.map((item) => ({
        ...item,
        isPrimary: item.key === key,
      })),
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="type-subsection inline-flex items-center gap-1.5">
          <IconClients size={14} />
          Постачальники
        </h4>
        {editingKey == null ? (
          <Button type="button" size="sm" onClick={() => openNew(offers.length === 0)}>
            {offers.length === 0 ? "Додати постачальника" : "Додати ще"}
          </Button>
        ) : null}
      </div>

      {error ? <Banner tone="danger">{error}</Banner> : null}

      {offers.length > 0 ? (
        <ul className="space-y-1.5">
          {offers.map((row) => {
            const colors = row.availableColors
              .split(",")
              .map((c) => c.trim())
              .filter(Boolean);
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] bg-[var(--color-surface-subtle)] px-2.5 py-1.5 text-[13px]"
              >
                <span className="min-w-0">
                  <span className="font-medium">{row.supplierName}</span>
                  {row.isPrimary ? (
                    <span className="ml-2 rounded-[4px] bg-[var(--color-tint-sage)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-primary-800)]">
                      основний
                    </span>
                  ) : null}
                  <span className="type-caption ml-2">
                    {pricingKind === "unit"
                      ? row.priceKgUsd
                        ? `${row.priceKgUsd} $/кг → ${
                            row.priceMeterUahNoVat
                              ? formatMoneyUah(Number(row.priceMeterUahNoVat))
                              : "—"
                          }/${qtyUnit}`
                        : row.priceMeterUahNoVat
                          ? formatMoneyUah(Number(row.priceMeterUahNoVat))
                          : "без ціни"
                      : (() => {
                          const rate =
                            row.deliveryType === "NP_STANDARD"
                              ? row.npStandardUsdPerKg
                              : row.deliveryType === "NP_VOLUME"
                                ? row.npVolumeUsdPerKg
                                : row.cargoUsdPerKg;
                          return `${fabricDeliveryTypeLabel(row.deliveryType)}${
                            rate ? ` · ${rate} $/кг` : ""
                          }`;
                        })()}
                  </span>
                  {colors.length > 0 ? (
                    <span className="type-caption ml-2 inline-flex flex-wrap items-center gap-1">
                      {colors.slice(0, 6).map((label) => {
                        const swatch = swatchForColorLabel(label);
                        return (
                          <span
                            key={label}
                            className="inline-flex items-center gap-1"
                            title={label}
                          >
                            <span
                              className={cn(
                                "size-2.5 rounded-full ring-1 ring-black/15",
                                swatch.bordered && "border border-[var(--color-border-strong)]",
                              )}
                              style={{ backgroundColor: swatch.swatch }}
                              aria-hidden
                            />
                          </span>
                        );
                      })}
                      {colors.length > 6 ? (
                        <span className="text-[11px]">+{colors.length - 6}</span>
                      ) : null}
                    </span>
                  ) : null}
                </span>
                <span className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => openEdit(row)}>
                    Змінити
                  </Button>
                  {!row.isPrimary ? (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => makePrimary(row.key)}
                      >
                        Основний
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => removeOffer(row.key)}
                      >
                        Прибрати
                      </Button>
                    </>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      ) : null}

      {editingKey != null ? (
        <div className="space-y-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-3">
          <FormGroup columns={2} compact>
            <Select
              className="sm:col-span-2"
              label="Постачальник"
              required
              value={
                knownSuppliers.some(
                  (name) => name.toLowerCase() === draft.supplierName.toLowerCase(),
                )
                  ? knownSuppliers.find(
                      (name) => name.toLowerCase() === draft.supplierName.toLowerCase(),
                    ) ?? draft.supplierName
                  : draft.supplierName
                    ? "__custom__"
                    : ""
              }
              onChange={(event) => {
                const value = event.target.value;
                if (value === "__custom__") {
                  setDraft((prev) => ({
                    ...prev,
                    supplierName: "",
                    availableColors: "",
                  }));
                  return;
                }
                if (!value) {
                  setDraft((prev) => ({ ...prev, supplierName: "", availableColors: "" }));
                  return;
                }
                setDraft((prev) => ({ ...prev, supplierName: value }));
                void getSupplierPaletteAction(value).then((result) => {
                  if (!result.ok || result.colors.length === 0) return;
                  setDraft((prev) => {
                    if (prev.supplierName.toLowerCase() !== value.toLowerCase()) return prev;
                    return {
                      ...prev,
                      availableColors: result.colors.join(", "),
                    };
                  });
                });
              }}
            >
              <option value="">Оберіть…</option>
              {knownSuppliers.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
              <option value="__custom__">Новий постачальник…</option>
            </Select>
            {!knownSuppliers.some(
              (name) => name.toLowerCase() === draft.supplierName.toLowerCase(),
            ) ? (
              <Input
                className="sm:col-span-2"
                label="Назва нового"
                required
                value={draft.supplierName}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, supplierName: event.target.value }))
                }
                placeholder="Зейджан"
                autoFocus
              />
            ) : null}
          </FormGroup>

          <FormGroup label="Палітра" columns={1} compact>
            <SupplierPaletteEditor
              value={draft.availableColors}
              onChange={(next) => setDraft((prev) => ({ ...prev, availableColors: next }))}
            />
          </FormGroup>

          {pricingKind === "unit" ? (
            <>
            <FormGroup label="Закупівля" icon={<IconPurchaseKg size={14} />} columns={2} compact>
              <PurchaseModeRow>
                {unitQuoteMode !== "kg" ? (
                  <ModeSegment
                    label="Валюта"
                    value={unitQuoteCurrency}
                    options={[
                      { value: "uah", label: "₴" },
                      { value: "usd", label: "$" },
                    ]}
                    onChange={(next) => {
                      if (next === unitQuoteCurrency) return;
                      setDraft((prev) => {
                        const pack = prev.purchasePackPrice
                          ? Number(prev.purchasePackPrice)
                          : null;
                        const unit = prev.priceMeterUahNoVat
                          ? Number(prev.priceMeterUahNoVat)
                          : null;
                        const packUah =
                          pack != null && Number.isFinite(pack)
                            ? amountToUah(pack, unitQuoteCurrency, effectiveUsdRate)
                            : null;
                        const unitUah =
                          unit != null && Number.isFinite(unit)
                            ? amountToUah(unit, unitQuoteCurrency, effectiveUsdRate)
                            : null;
                        return {
                          ...prev,
                          purchasePackPrice:
                            packUah != null
                              ? String(amountFromUah(packUah, next, effectiveUsdRate))
                              : "",
                          priceMeterUahNoVat:
                            unitUah != null
                              ? String(amountFromUah(unitUah, next, effectiveUsdRate))
                              : "",
                          priceMeterUahVat:
                            unitUah != null
                              ? String(amountFromUah(unitUah, next, effectiveUsdRate))
                              : "",
                        };
                      });
                      setUnitQuoteCurrency(next);
                    }}
                  />
                ) : null}
                <ModeSegment
                  label="Ціна"
                  value={unitQuoteMode}
                  options={[
                    { value: "each", label: packLabels.eachQuote },
                    ...(allowPackQuote
                      ? [{ value: "pack" as const, label: packLabels.packQuote }]
                      : []),
                    ...(allowPackQuote && packLabels.showUnitsPerKg
                      ? [{ value: "kg" as const, label: "$/кг" }]
                      : []),
                  ]}
                  onChange={(next) => {
                    setUnitQuoteMode(next);
                    setDraft((prev) => ({
                      ...prev,
                      purchasePackPrice: next === "pack" ? prev.purchasePackPrice : "",
                      priceKgUsd: next === "kg" ? prev.priceKgUsd : "",
                      priceKgUsdVat: next === "kg" ? prev.priceKgUsdVat : "",
                    }));
                  }}
                />
                <ModeSegment
                  label="Тариф"
                  value={tierMode}
                  options={[
                    { value: "single", label: "Ціна" },
                    { value: "tier", label: "Ціна + роздріб" },
                  ]}
                  onChange={(next) => {
                    setTierMode(next);
                    if (next !== "tier") {
                      setDraft((prev) => ({
                        ...prev,
                        priceMeterUahCutVat: "",
                        minWholesaleMeters: "",
                      }));
                    }
                  }}
                />
              </PurchaseModeRow>
              {allowPackQuote && unitQuoteMode === "pack" ? (
                <Input
                  label={packLabels.packPriceLabel}
                  type="number"
                  min={0}
                  step="0.01"
                  suffix={
                    unitQuoteCurrency === "usd"
                      ? packLabels.packSuffixUsd
                      : packLabels.packSuffixUah
                  }
                  value={draft.purchasePackPrice}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, purchasePackPrice: event.target.value }))
                  }
                  hint={
                    unitsPerPack != null && unitsPerPack > 0
                      ? undefined
                      : packLabels.packPriceEmptyHint
                  }
                />
              ) : null}
              {allowPackQuote && unitQuoteMode === "kg" ? (
                <Input
                  label="Прайс"
                  type="number"
                  min={0}
                  step="0.01"
                  suffix="$/кг"
                  value={draft.priceKgUsd}
                  onChange={(event) =>
                    setDraft((prev) => ({ ...prev, priceKgUsd: event.target.value }))
                  }
                  hint={
                    unitsPerKg != null && unitsPerKg > 0
                      ? undefined
                      : "Спочатку «Шт / кг» на матеріалі"
                  }
                />
              ) : null}
              <Input
                label="Ціна"
                type="number"
                min={0}
                step="0.01"
                suffix={
                  unitQuoteMode === "kg"
                    ? packLabels.unitSuffixUah
                    : unitQuoteCurrency === "usd"
                      ? packLabels.unitSuffixUsd
                      : packLabels.unitSuffixUah
                }
                readOnly={unitQuoteMode === "pack" || unitQuoteMode === "kg"}
                value={
                  unitQuoteMode === "kg"
                    ? String(
                        unitPriceFromKgUsd(
                          draft.priceKgUsd ? Number(draft.priceKgUsd) : null,
                          unitsPerKg,
                          effectiveUsdRate,
                        ) ?? "",
                      )
                    : unitQuoteMode === "pack" &&
                        hasTrimPackQuote({
                          unitsPerPack,
                          purchasePackPrice: draft.purchasePackPrice
                            ? amountToUah(
                                Number(draft.purchasePackPrice),
                                unitQuoteCurrency,
                                effectiveUsdRate,
                              )
                            : null,
                          packDeliveryCostUah:
                            unitDeliveryUiMode === "fixed" && draft.packDeliveryCostUah
                              ? amountToUah(
                                  Number(draft.packDeliveryCostUah),
                                  fixedDeliveryCurrency,
                                  effectiveUsdRate,
                                )
                              : null,
                        })
                      ? String(
                          (() => {
                            const uah = deriveTrimUnitPriceFromSupplier({
                              unitsPerPack,
                              purchasePackPrice: draft.purchasePackPrice
                                ? amountToUah(
                                    Number(draft.purchasePackPrice),
                                    unitQuoteCurrency,
                                    effectiveUsdRate,
                                  )
                                : null,
                              packDeliveryCostUah:
                                unitDeliveryUiMode === "fixed" && draft.packDeliveryCostUah
                                  ? amountToUah(
                                      Number(draft.packDeliveryCostUah),
                                      fixedDeliveryCurrency,
                                      effectiveUsdRate,
                                    )
                                  : null,
                              fallbackUnitPrice: 0,
                            });
                            return unitQuoteCurrency === "usd"
                              ? amountFromUah(uah, "usd", effectiveUsdRate)
                              : uah;
                          })(),
                        )
                      : draft.priceMeterUahNoVat
                }
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    priceMeterUahNoVat: event.target.value,
                    priceMeterUahVat: event.target.value,
                  }))
                }
              />
              {tierMode === "tier" ? (
                <>
                  <Input
                    label="Межа роздробу"
                    type="number"
                    min={0}
                    step="0.1"
                    suffix={qtyUnit}
                    value={draft.minWholesaleMeters}
                    onChange={(event) => {
                      const value = event.target.value;
                      setDraft((prev) => ({
                        ...prev,
                        minWholesaleMeters: value,
                      }));
                    }}
                    hint={`Якщо витрата < межі — ціна роздробу (${qtyUnit})`}
                  />
                  <Input
                    label="Ціна роздробу"
                    type="number"
                    min={0}
                    step="0.01"
                    suffix={packLabels.unitSuffixUah}
                    disabled={
                      draft.minWholesaleMeters.trim() === "" ||
                      Number(draft.minWholesaleMeters) <= 0
                    }
                    value={draft.priceMeterUahCutVat}
                    onChange={(event) =>
                      setDraft((prev) => ({
                        ...prev,
                        priceMeterUahCutVat: event.target.value,
                      }))
                    }
                    hint={
                      draft.minWholesaleMeters.trim() === "" ||
                      Number(draft.minWholesaleMeters) <= 0
                        ? "Спочатку вкажіть межу роздробу"
                        : undefined
                    }
                  />
                </>
              ) : null}
              <Input
                className="sm:col-span-2"
                label="Примітка"
                optional
                value={draft.wholesaleNote}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, wholesaleNote: event.target.value }))
                }
              />
            </FormGroup>
            <FormGroup label="Доставка" icon={<IconPurchaseKg size={14} />} columns={3} compact>
              <PurchaseModeRow>
                <ModeSegment
                  value={unitDeliveryUiMode}
                  options={[
                    { value: "kg", label: "За кг ($)" },
                    { value: "fixed", label: "Фікс" },
                    { value: "none", label: "Немає" },
                  ]}
                  onChange={(next) => {
                    setUnitDeliveryUiMode(next);
                    if (next === "none") {
                      setDraft((prev) => ({
                        ...prev,
                        cargoUsdPerKg: "",
                        npStandardUsdPerKg: "",
                        npVolumeUsdPerKg: "",
                        packDeliveryCostUah: "",
                      }));
                    } else if (next === "fixed") {
                      setDraft((prev) => ({
                        ...prev,
                        cargoUsdPerKg: "",
                        npStandardUsdPerKg: "",
                        npVolumeUsdPerKg: "",
                      }));
                    } else {
                      setDraft((prev) => ({
                        ...prev,
                        packDeliveryCostUah: "",
                      }));
                    }
                  }}
                />
              </PurchaseModeRow>
              {unitDeliveryUiMode === "kg" ? (
                <DeliveryRatesFields
                  mode="fabric"
                  fabricGlobals={fabricGlobals}
                  usdUahRate={localUsdRate}
                  onUsdUahRateChange={setCourse}
                  draft={draft}
                  onChange={(next) => setDraft((prev) => ({ ...prev, ...next }))}
                />
              ) : unitDeliveryUiMode === "fixed" ? (
                <div className="sm:col-span-full flex flex-col gap-1">
                  <span className="type-label inline-flex flex-wrap items-baseline gap-1.5">
                    <span>Сума доставки</span>
                    <span className="text-[10.5px] font-normal normal-case tracking-normal text-[var(--color-text-tertiary)]">
                      необовʼязково
                    </span>
                  </span>
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={draft.packDeliveryCostUah}
                      onChange={(event) =>
                        setDraft((prev) => ({
                          ...prev,
                          packDeliveryCostUah: event.target.value,
                        }))
                      }
                      className="h-10 min-w-[8rem] max-w-[12rem] flex-1 rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 text-[14px] tabular-nums outline-none focus:border-[var(--color-primary-500)] focus:ring-2 focus:ring-[var(--color-focus-ring)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                    />
                    <ModeSegment
                      value={fixedDeliveryCurrency}
                      options={[
                        { value: "uah", label: "₴" },
                        { value: "usd", label: "$" },
                      ]}
                      onChange={(next) => {
                        if (next === fixedDeliveryCurrency) return;
                        setDraft((prev) => {
                          const raw = prev.packDeliveryCostUah
                            ? Number(prev.packDeliveryCostUah)
                            : null;
                          if (raw == null || !Number.isFinite(raw)) return prev;
                          const uah = amountToUah(raw, fixedDeliveryCurrency, effectiveUsdRate);
                          return {
                            ...prev,
                            packDeliveryCostUah: String(
                              amountFromUah(uah, next, effectiveUsdRate),
                            ),
                          };
                        });
                        setFixedDeliveryCurrency(next);
                      }}
                    />
                  </div>
                  <span className="type-caption">
                    {unitsPerPack != null && unitsPerPack > 0
                      ? `Розкладається на ${unitsPerPack} од. у собівартість`
                      : fixedDeliveryCurrency === "usd"
                        ? `Курс ${effectiveUsdRate} ₴/$ · фікс за пачку/поставку`
                        : "Фікс за пачку / поставку · додається до собівартості"}
                  </span>
                </div>
              ) : (
                <p className="type-caption sm:col-span-3 text-[var(--color-text-tertiary)]">
                  Тарифи доставки вимкнено.
                </p>
              )}
            </FormGroup>
            </>
          ) : (
          <>
          <FormGroup label="Закупівля" icon={<IconPurchaseKg size={14} />} columns={2} compact>
            <PurchaseModeRow>
            <ModeSegment
              label="Валюта"
              value={quoteCurrency}
              options={[
                { value: "uah", label: "₴" },
                { value: "usd", label: "$" },
              ]}
              onChange={(next) => {
                setQuoteCurrency(next);
                if (!(next === "usd" && quoteUnit === "kg")) {
                  setDraft((prev) => ({ ...prev, priceKgUsd: "", priceKgUsdVat: "" }));
                }
              }}
            />
            <ModeSegment
              label="За"
              value={quoteUnit}
              options={[
                { value: "meter", label: "м" },
                { value: "kg", label: "кг" },
              ]}
              onChange={(next) => {
                setQuoteUnit(next);
                if (!(quoteCurrency === "usd" && next === "kg")) {
                  setDraft((prev) => ({ ...prev, priceKgUsd: "", priceKgUsdVat: "" }));
                }
              }}
            />
            <ModeSegment
              label="Тариф"
              value={tierMode}
              options={[
                { value: "single", label: "Ціна" },
                { value: "tier", label: "Ціна + роздріб" },
              ]}
              onChange={(next) => {
                setTierMode(next);
                if (next === "tier") {
                  // Base stays in priceMeterUahNoVat; retail is entered in CutVat.
                  setDraft((prev) => ({
                    ...prev,
                    priceMeterUahCutVat: "",
                  }));
                } else {
                  setDraft((prev) => ({
                    ...prev,
                    priceMeterUahCutVat: "",
                    minWholesaleMeters: "",
                  }));
                }
              }}
            />
          </PurchaseModeRow>
            {(() => {
              const suffix = fabricQuoteSuffix(quoteCurrency, quoteUnit);
              const isUsdKg = quoteCurrency === "usd" && quoteUnit === "kg";

              function quoteDisplayFromMeter(
                meterRaw: string,
                preferKgUsd: boolean,
              ): string {
                if (preferKgUsd && isUsdKg && draft.priceKgUsd.trim()) {
                  return draft.priceKgUsd;
                }
                if (quoteCurrency === "uah" && quoteUnit === "meter") return meterRaw;
                const reversed = supplierQuoteFromMeterUah({
                  currency: quoteCurrency,
                  unit: quoteUnit,
                  meterUah: meterRaw ? Number(meterRaw) : null,
                  metersPerKg: metersPerKg ?? null,
                  usdUahRate: effectiveUsdRate,
                });
                return reversed != null ? String(reversed) : "";
              }

              function applyQuote(value: string, target: "base" | "retail") {
                const n =
                  value.trim() === "" ? null : Number(String(value).replace(",", "."));
                const meter = meterUahFromSupplierQuote({
                  currency: quoteCurrency,
                  unit: quoteUnit,
                  quote: n != null && Number.isFinite(n) ? n : null,
                  metersPerKg: metersPerKg ?? null,
                  usdUahRate: effectiveUsdRate,
                });
                const meterStr = meter != null ? String(meter) : "";
                setDraft((prev) => {
                  const next = { ...prev, priceMeterUahVat: "", priceKgUsdVat: "" };
                  if (target === "base") {
                    if (isUsdKg) next.priceKgUsd = value;
                    next.priceMeterUahNoVat = meterStr;
                  } else {
                    next.priceMeterUahCutVat = meterStr;
                  }
                  return next;
                });
              }

              return (
                <>
                  <Input
                    label="Ціна"
                    type="number"
                    min={0}
                    step="0.01"
                    suffix={suffix}
                    value={quoteDisplayFromMeter(draft.priceMeterUahNoVat, true)}
                    onChange={(event) => applyQuote(event.target.value, "base")}
                  />
                  {tierMode === "tier" ? (
                    <>
                      <Input
                        label="Межа роздробу"
                        type="number"
                        min={0}
                        step="0.1"
                        suffix={qtyUnit}
                        value={draft.minWholesaleMeters}
                        onChange={(event) => {
                          const value = event.target.value;
                          setDraft((prev) => ({
                            ...prev,
                            minWholesaleMeters: value,
                          }));
                        }}
                        hint={`Якщо витрата < межі — ціна роздробу (${qtyUnit})`}
                      />
                      <Input
                        label="Ціна роздробу"
                        type="number"
                        min={0}
                        step="0.01"
                        suffix={suffix}
                        disabled={
                          draft.minWholesaleMeters.trim() === "" ||
                          Number(draft.minWholesaleMeters) <= 0
                        }
                        value={quoteDisplayFromMeter(draft.priceMeterUahCutVat, false)}
                        onChange={(event) => applyQuote(event.target.value, "retail")}
                        hint={
                          draft.minWholesaleMeters.trim() === "" ||
                          Number(draft.minWholesaleMeters) <= 0
                            ? "Спочатку вкажіть межу роздробу"
                            : undefined
                        }
                      />
                    </>
                  ) : null}
                </>
              );
            })()}
            <Input
              className="sm:col-span-2"
              label="Примітка"
              optional
              value={draft.wholesaleNote}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, wholesaleNote: event.target.value }))
              }
            />
            {derived.purchasePrice > 0 ? (
              <p className="type-caption sm:col-span-2 tabular">
                Собівартість: {formatMoneyUah(derived.purchasePrice)}/{qtyUnit}
                {tierMode === "tier" &&
                draft.minWholesaleMeters.trim() !== "" &&
                Number(draft.minWholesaleMeters) > 0
                  ? draft.priceMeterUahCutVat.trim() && Number(draft.priceMeterUahCutVat) > 0
                    ? ` · < ${draft.minWholesaleMeters} ${qtyUnit} → роздріб`
                    : ` · роздріб до ${draft.minWholesaleMeters} ${qtyUnit}`
                  : " · ціна"}
                {quoteCurrency === "usd" ? ` · курс ${effectiveUsdRate} ₴/$` : ""}
              </p>
            ) : null}
          </FormGroup>
          <FormGroup label="Доставка" icon={<IconPurchaseKg size={14} />} columns={3} compact>
            <PurchaseModeRow>
              <ModeSegment
                value={deliveryUiMode}
                options={[
                  { value: "kg", label: "За кг ($)" },
                  { value: "none", label: "Немає" },
                ]}
                onChange={(next) => {
                  setDeliveryUiMode(next);
                  if (next === "none") {
                    setDraft((prev) => ({
                      ...prev,
                      cargoUsdPerKg: "",
                      npStandardUsdPerKg: "",
                      npVolumeUsdPerKg: "",
                    }));
                  }
                }}
              />
            </PurchaseModeRow>
            {deliveryUiMode === "kg" ? (
              <DeliveryRatesFields
                mode="fabric"
                fabricGlobals={fabricGlobals}
                usdUahRate={localUsdRate}
                onUsdUahRateChange={setCourse}
                draft={draft}
                onChange={(next) => applyDeliveryRates(next)}
              />
            ) : (
                <p className="type-caption sm:col-span-3 text-[var(--color-text-tertiary)]">
                  Тарифи доставки вимкнено.
                </p>
            )}
          </FormGroup>
          </>
          )}

          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={saveDraft}>
              Зберегти постачальника
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(null)}>
              Скасувати
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
