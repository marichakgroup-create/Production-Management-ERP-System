"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, FormGroup } from "@/components/ui/Field";
import { Banner } from "@/components/ui/Banner";
import { IconClients, IconPurchaseKg } from "@/components/ui/Icons";
import {
  deleteMaterialSupplierOfferAction,
  getSupplierPaletteAction,
  listMaterialSupplierOffersAction,
  listSupplierNamesAction,
  setPrimaryMaterialSupplierOfferAction,
  upsertMaterialSupplierOfferAction,
} from "@/server/domains/catalog/actions";
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
  normalizeFabricDeliveryType,
  type FabricDeliveryTypeCode,
} from "@/lib/fabric-delivery-types";
import {
  configuredSupplierDeliveryOptions,
  resolveSupplierDeliveryRate,
} from "@/lib/supplier-delivery-rates";
import {
  deriveTrimUnitPriceFromSupplier,
  hasTrimKgQuote,
  hasTrimPackQuote,
  trimConfiguredDeliveryOptions,
  unitPriceFromKgUsd,
} from "@/lib/trim-pack-pricing";
import { materialPackLabels, materialQtyUnitShort } from "@/lib/material-pack-labels";
import { SupplierPaletteEditor } from "@/components/catalog/SupplierPaletteEditor";
import { DeliveryRatesFields } from "@/components/catalog/DeliveryRatesFields";
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
import { formatMoneyUah, cn } from "@/lib/utils";
import { swatchForColorLabel } from "@/lib/trim-colors";

type OfferRow = {
  id: string;
  isPrimary: boolean;
  supplierName: string;
  availableColors: string[];
  deliveryType: FabricDeliveryTypeCode;
  cargoUsdPerKg: number | null;
  npStandardUsdPerKg: number | null;
  npVolumeUsdPerKg: number | null;
  purchasePackPrice: number | null;
  packDeliveryCostUah: number | null;
  priceKgUsd: number | null;
  priceKgUsdVat: number | null;
  priceMeterUahNoVat: number | null;
  priceMeterUahVat: number | null;
  priceMeterUahCutVat: number | null;
  minWholesaleMeters: number | null;
  wholesaleNote: string | null;
  purchaseHint: number | null;
};

type OfferDraft = {
  supplierName: string;
  deliveryType: FabricDeliveryTypeCode;
  cargoUsdPerKg: string;
  npStandardUsdPerKg: string;
  npVolumeUsdPerKg: string;
  purchasePackPrice: string;
  packDeliveryCostUah: string;
  priceKgUsd: string;
  priceKgUsdVat: string;
  priceMeterUahNoVat: string;
  priceMeterUahVat: string;
  priceMeterUahCutVat: string;
  minWholesaleMeters: string;
  wholesaleNote: string;
  availableColors: string;
  asPrimary: boolean;
};

const emptyDraft = (
  asPrimary: boolean,
  _globals?: FabricPricingGlobals,
): OfferDraft => {
  void _globals;
  return {
    supplierName: "",
    deliveryType: "CARGO",
    cargoUsdPerKg: "",
    npStandardUsdPerKg: "",
    npVolumeUsdPerKg: "",
    purchasePackPrice: "",
    packDeliveryCostUah: "",
    priceKgUsd: "",
    priceKgUsdVat: "",
    priceMeterUahNoVat: "",
    priceMeterUahVat: "",
    priceMeterUahCutVat: "",
    minWholesaleMeters: "",
    wholesaleNote: "",
    availableColors: "",
    asPrimary,
  };
};

function numStr(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

function draftFromOffer(row: OfferRow, pricingKind: "fabric" | "unit" = "fabric"): OfferDraft {
  const hasTypedRates =
    row.cargoUsdPerKg != null ||
    row.npStandardUsdPerKg != null ||
    row.npVolumeUsdPerKg != null;
  return {
    supplierName: row.supplierName,
    deliveryType: normalizeFabricDeliveryType(row.deliveryType),
    cargoUsdPerKg:
      numStr(row.cargoUsdPerKg) ||
      // Trim only: legacy pack delivery in UAH must not leak into fabric $/кг.
      (pricingKind === "unit" && !hasTypedRates ? numStr(row.packDeliveryCostUah) : ""),
    npStandardUsdPerKg: numStr(row.npStandardUsdPerKg),
    npVolumeUsdPerKg: numStr(row.npVolumeUsdPerKg),
    purchasePackPrice: numStr(row.purchasePackPrice),
    packDeliveryCostUah: numStr(row.packDeliveryCostUah),
    priceKgUsd: numStr(row.priceKgUsd),
    priceKgUsdVat: numStr(row.priceKgUsdVat),
    priceMeterUahNoVat: numStr(row.priceMeterUahNoVat),
    priceMeterUahVat: numStr(row.priceMeterUahVat),
    priceMeterUahCutVat: numStr(row.priceMeterUahCutVat),
    minWholesaleMeters: numStr(row.minWholesaleMeters),
    wholesaleNote: row.wholesaleNote ?? "",
    availableColors: (row.availableColors ?? []).join(", "),
    asPrimary: row.isPrimary,
  };
}

function trimDraftRates(draft: OfferDraft) {
  return {
    deliveryType: draft.deliveryType,
    cargoUsdPerKg: draft.cargoUsdPerKg ? Number(draft.cargoUsdPerKg) : null,
    npStandardUsdPerKg: draft.npStandardUsdPerKg
      ? Number(draft.npStandardUsdPerKg)
      : null,
    npVolumeUsdPerKg: draft.npVolumeUsdPerKg ? Number(draft.npVolumeUsdPerKg) : null,
  };
}

export function MaterialSuppliersEditor({
  materialId,
  metersPerKg,
  unitsPerPack = null,
  unitsPerKg = null,
  unitMode = "pcs",
  fabricGlobals,
  onPrimaryChanged,
  pricingKind = "fabric",
  embedded = false,
  allowPackQuote = true,
}: {
  materialId: string;
  metersPerKg?: number | null;
  /** Trim: шт/м в упаковці / бобіні з картки матеріалу. */
  unitsPerPack?: number | null;
  /** Trim: шт/кг з картки матеріалу (закупівля $/кг). */
  unitsPerKg?: number | null;
  /** BOM consumption unit — drives pack / quote labels. */
  unitMode?: FabricUnitMode;
  fabricGlobals: FabricPricingGlobals;
  onPrimaryChanged?: () => void;
  pricingKind?: "fabric" | "unit";
  /** Inside edit-panel tab: hide redundant title / captions. */
  embedded?: boolean;
  /** False for «Інший матеріал» — only ₴/од., no pack / $/кг modes. */
  allowPackQuote?: boolean;
}) {
  const packLabels = materialPackLabels(unitMode);
  const qtyUnit = materialQtyUnitShort(unitMode);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [usdUahRate, setUsdUahRate] = useState(fabricGlobals.usdUahRate);
  const [usdUahRateInput, setUsdUahRateInput] = useState(String(fabricGlobals.usdUahRate));
  const [knownSuppliers, setKnownSuppliers] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [draft, setDraft] = useState<OfferDraft>(() => emptyDraft(true, fabricGlobals));
  const [quoteCurrency, setQuoteCurrency] = useState<FabricQuoteCurrency>("uah");
  const [quoteUnit, setQuoteUnit] = useState<FabricQuoteUnit>("meter");
  const [tierMode, setTierMode] = useState<FabricTierMode>("single");
  const [deliveryUiMode, setDeliveryUiMode] = useState<FabricDeliveryUiMode>("kg");
  const [unitQuoteMode, setUnitQuoteMode] = useState<UnitQuoteMode>("each");
  const [unitDeliveryUiMode, setUnitDeliveryUiMode] = useState<UnitDeliveryUiMode>("kg");
  const [unitQuoteCurrency, setUnitQuoteCurrency] = useState<MoneyCurrency>("uah");
  const [fixedDeliveryCurrency, setFixedDeliveryCurrency] = useState<MoneyCurrency>("uah");

  function applyModesFromDraft(next: OfferDraft) {
    setQuoteCurrency(inferFabricQuoteCurrency(next));
    setQuoteUnit(inferFabricQuoteUnit(next));
    setTierMode(inferFabricTierMode(next));
    setDeliveryUiMode(inferFabricDeliveryUiMode(next));
    setUnitQuoteMode(allowPackQuote ? inferUnitQuoteMode(next) : "each");
    setUnitDeliveryUiMode(inferUnitDeliveryUiMode(next));
    setUnitQuoteCurrency("uah");
    setFixedDeliveryCurrency("uah");
  }

  useEffect(() => {
    if (!allowPackQuote && unitQuoteMode !== "each") {
      setUnitQuoteMode("each");
    }
  }, [allowPackQuote, unitQuoteMode]);

  function reload() {
    startTransition(async () => {
      const [result, names] = await Promise.all([
        listMaterialSupplierOffersAction(materialId),
        listSupplierNamesAction().catch(() => [] as string[]),
      ]);
      if (!result.ok) return;
      setOffers(result.offers as OfferRow[]);
      setUsdUahRate(result.usdUahRate);
      setUsdUahRateInput(String(result.usdUahRate));
      setKnownSuppliers(names);
    });
  }

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [materialId]);

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
      usdUahRate,
      fabricCargoUsdPerKg: resolved.rateUsdPerKg,
    };
  }, [fabricGlobals, usdUahRate, draft]);

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

  const hasCutPrice =
    draft.priceMeterUahCutVat.trim() !== "" && Number(draft.priceMeterUahCutVat) > 0;

  function openEdit(row: OfferRow) {
    setError(null);
    setEditingId(row.id);
    const next = draftFromOffer(row, pricingKind);
    setDraft(next);
    applyModesFromDraft(next);
  }

  function openNew(asPrimary: boolean) {
    setError(null);
    setEditingId("new");
    const next = emptyDraft(asPrimary || offers.length === 0, fabricGlobals);
    setDraft(next);
    if (pricingKind === "unit") {
      setUnitQuoteMode("each");
      setUnitDeliveryUiMode("kg");
      setUnitQuoteCurrency("uah");
      setFixedDeliveryCurrency("uah");
      setTierMode("single");
      return;
    }
    setQuoteCurrency("uah");
    setQuoteUnit("meter");
    setTierMode("single");
    setDeliveryUiMode("kg");
  }

  function saveDraft() {
    setError(null);
    if (!draft.supplierName.trim()) {
      setError("Вкажіть постачальника.");
      return;
    }
    const cut = draft.priceMeterUahCutVat.trim();
    const threshold = draft.minWholesaleMeters.trim();
    const hasCut = cut !== "" && Number(cut) > 0;
    if (pricingKind === "unit") {
      const hasKg =
        unitQuoteMode === "kg" &&
        hasTrimKgQuote({
          unitsPerKg,
          priceKgUsd: draft.priceKgUsd ? Number(draft.priceKgUsd) : null,
          usdUahRate,
        });
      const packQuote = {
        unitsPerPack,
        purchasePackPrice:
          unitQuoteMode === "pack" && draft.purchasePackPrice
            ? Number(draft.purchasePackPrice)
            : null,
      };
      if (unitQuoteMode === "kg" && !hasKg) {
        setError(
          unitsPerKg != null && unitsPerKg > 0
            ? "Вкажіть ціну $/кг."
            : "Спочатку вкажіть «Шт / кг» на матеріалі.",
        );
        return;
      }
      if (unitQuoteMode === "pack" && !hasTrimPackQuote(packQuote)) {
        setError(
          unitsPerPack != null && unitsPerPack > 0
            ? "Вкажіть ціну упаковки."
            : "Спочатку вкажіть «Шт в упаковці» на матеріалі.",
        );
        return;
      }
      if (
        unitQuoteMode === "each" &&
        (!draft.priceMeterUahNoVat.trim() || !(Number(draft.priceMeterUahNoVat) >= 0))
      ) {
        setError(`Вкажіть ціну закупки (${packLabels.unitSuffixUah}).`);
        return;
      }
      if (tierMode === "tier") {
        if (!threshold || Number(threshold) <= 0) {
          setError("Вкажіть межу роздробу.");
          return;
        }
        if (!hasCut) {
          setError("Вкажіть ціну роздробу.");
          return;
        }
      }
    } else if (tierMode === "tier") {
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
      const hasUsdKg = draft.priceKgUsd.trim() !== "" && Number(draft.priceKgUsd) > 0;
      if (quoteCurrency === "uah" && quoteUnit === "meter" && !ordinary) {
        setError("Вкажіть ціну ₴/м.");
        return;
      }
      if (quoteCurrency === "usd" && quoteUnit === "kg" && !hasUsdKg && !ordinary) {
        setError("Вкажіть $/кг або ₴/м.");
        return;
      }
      if (quoteUnit === "kg" && quoteCurrency === "uah" && !ordinary) {
        setError("Вкажіть ціну ₴/кг (потрібні м.п./кг на матеріалі).");
        return;
      }
      if (quoteCurrency === "usd" && quoteUnit === "meter" && !ordinary) {
        setError("Вкажіть ціну $/м.");
        return;
      }
    }
    const data = new FormData();
    data.set("materialId", materialId);
    data.set("supplierNameUk", draft.supplierName.trim());
    data.set("isPrimary", draft.asPrimary || offers.length === 0 ? "1" : "0");
    data.set("deliveryType", draft.deliveryType);
    const saveDeliveryKg =
      (pricingKind === "unit" && unitDeliveryUiMode === "kg") ||
      (pricingKind === "fabric" && deliveryUiMode === "kg");
    const saveDeliveryFixed = pricingKind === "unit" && unitDeliveryUiMode === "fixed";
    if (saveDeliveryKg && draft.cargoUsdPerKg) data.set("cargoUsdPerKg", draft.cargoUsdPerKg);
    else data.set("cargoUsdPerKg", "");
    if (saveDeliveryKg && draft.npStandardUsdPerKg) {
      data.set("npStandardUsdPerKg", draft.npStandardUsdPerKg);
    } else data.set("npStandardUsdPerKg", "");
    if (saveDeliveryKg && draft.npVolumeUsdPerKg) {
      data.set("npVolumeUsdPerKg", draft.npVolumeUsdPerKg);
    } else data.set("npVolumeUsdPerKg", "");
    if (pricingKind === "unit") {
      const packPriceEntered =
        unitQuoteMode === "pack" && draft.purchasePackPrice
          ? Number(draft.purchasePackPrice)
          : null;
      const packPriceUah =
        packPriceEntered != null && Number.isFinite(packPriceEntered)
          ? amountToUah(packPriceEntered, unitQuoteCurrency, usdUahRate)
          : null;
      const fixedEntered =
        saveDeliveryFixed && draft.packDeliveryCostUah
          ? Number(draft.packDeliveryCostUah)
          : null;
      const fixedUah =
        fixedEntered != null && Number.isFinite(fixedEntered)
          ? amountToUah(fixedEntered, fixedDeliveryCurrency, usdUahRate)
          : null;
      const eachEntered =
        unitQuoteMode === "each" && draft.priceMeterUahNoVat
          ? Number(draft.priceMeterUahNoVat)
          : null;
      const eachUah =
        eachEntered != null && Number.isFinite(eachEntered)
          ? amountToUah(eachEntered, unitQuoteCurrency, usdUahRate)
          : null;

      if (packPriceUah != null) data.set("purchasePackPrice", String(packPriceUah));
      else data.set("purchasePackPrice", "");
      if (fixedUah != null) data.set("packDeliveryCostUah", String(fixedUah));
      else data.set("packDeliveryCostUah", "");
      if (unitQuoteMode === "kg" && draft.priceKgUsd) {
        data.set("priceKgUsd", draft.priceKgUsd);
      } else {
        data.set("priceKgUsd", "");
      }
      const unitPrice = deriveTrimUnitPriceFromSupplier({
        unitsPerPack,
        purchasePackPrice: packPriceUah,
        packDeliveryCostUah: fixedUah,
        unitsPerKg,
        priceKgUsd:
          unitQuoteMode === "kg" && draft.priceKgUsd
            ? Number(draft.priceKgUsd)
            : null,
        usdUahRate,
        fallbackUnitPrice: eachUah ?? 0,
      });
      if (
        hasTrimKgQuote({
          unitsPerKg,
          priceKgUsd:
            unitQuoteMode === "kg" && draft.priceKgUsd
              ? Number(draft.priceKgUsd)
              : null,
          usdUahRate,
        }) ||
        hasTrimPackQuote({
          unitsPerPack,
          purchasePackPrice: packPriceUah,
        }) ||
        eachUah != null ||
        saveDeliveryFixed
      ) {
        data.set("priceMeterUahNoVat", String(unitPrice));
        data.set("priceMeterUahVat", String(unitPrice));
      }
    }
    if (
      pricingKind === "fabric" &&
      quoteCurrency === "usd" &&
      quoteUnit === "kg" &&
      draft.priceKgUsd
    ) {
      data.set("priceKgUsd", draft.priceKgUsd);
    } else if (pricingKind === "fabric") {
      data.set("priceKgUsd", "");
    }
    data.set("priceKgUsdVat", draft.priceKgUsdVat || "");
    if (pricingKind === "fabric") {
      if (draft.priceMeterUahNoVat) data.set("priceMeterUahNoVat", draft.priceMeterUahNoVat);
      else if (derived.priceMeterUahNoVat != null) {
        data.set("priceMeterUahNoVat", String(derived.priceMeterUahNoVat));
      }
      data.set("priceMeterUahVat", draft.priceMeterUahVat || "");
    } else if (!data.has("priceMeterUahVat")) {
      data.set("priceMeterUahVat", draft.priceMeterUahVat || "");
    }
    if (tierMode === "tier" && hasCut) {
      data.set("priceMeterUahCutVat", cut);
    } else {
      data.set("priceMeterUahCutVat", "");
    }
    if (tierMode === "tier" && threshold && Number(threshold) > 0) {
      data.set("minWholesaleMeters", threshold);
    } else {
      data.set("minWholesaleMeters", "");
    }
    if (draft.wholesaleNote) data.set("wholesaleNote", draft.wholesaleNote);
    data.set("availableColors", draft.availableColors);
    if (metersPerKg != null) data.set("metersPerKg", String(metersPerKg));
    if (usdUahRate > 0) {
      data.set("usdUahRate", String(usdUahRate));
    }

    startTransition(async () => {
      const result = await upsertMaterialSupplierOfferAction(data);
      if (!result.ok) {
        setError("Не вдалося зберегти умови постачальника.");
        return;
      }
      const wasPrimary = draft.asPrimary || offers.length === 0;
      setEditingId(null);
      reload();
      if (wasPrimary) onPrimaryChanged?.();
    });
  }

  function makePrimary(id: string) {
    setError(null);
    const data = new FormData();
    data.set("id", id);
    startTransition(async () => {
      const result = await setPrimaryMaterialSupplierOfferAction(data);
      if (!result.ok) {
        setError("Не вдалося призначити основного постачальника.");
        return;
      }
      setEditingId(null);
      reload();
      onPrimaryChanged?.();
    });
  }

  function removeOffer(id: string) {
    setError(null);
    const data = new FormData();
    data.set("id", id);
    startTransition(async () => {
      const result = await deleteMaterialSupplierOfferAction(data);
      if (!result.ok) {
        setError("Основну пропозицію не можна видалити — спочатку зробіть іншу основною.");
        return;
      }
      if (editingId === id) setEditingId(null);
      reload();
    });
  }

  return (
    <div
      className={
        embedded
          ? "space-y-3"
          : "space-y-3 rounded-[var(--radius-control)] border border-[var(--color-border)] p-3"
      }
    >
      {!embedded ? (
        <div>
          <h4 className="type-subsection inline-flex items-center gap-1.5">
            <IconClients size={14} />
            Постачальники та закупівля
          </h4>
        </div>
      ) : null}

      {pricingKind === "unit" &&
      allowPackQuote &&
      !(unitsPerPack != null && unitsPerPack > 0) &&
      !(unitsPerKg != null && unitsPerKg > 0) ? (
        <p className="type-caption text-[var(--color-warning-text)]">
          Для «уп.» або $/кг спочатку збережіть «{packLabels.contentLabel}» чи «Шт /
          кг» у картці матеріалу. Пряма ціна за {packLabels.eachQuote} працює без цього.
        </p>
      ) : null}

      {error ? <Banner tone="danger">{error}</Banner> : null}

      <ul className="space-y-1.5">
        {offers.length === 0 ? (
          <li className="type-caption">
            Ще немає пропозицій — додайте основного постачальника з цінами нижче.
          </li>
        ) : (
          offers.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-[6px] bg-[var(--color-surface-subtle)] px-2.5 py-1.5 text-[13px]"
            >
              <span className="min-w-0">
                <span className="font-medium">{row.supplierName}</span>
                {row.isPrimary ? (
                  <span className="ml-2 rounded-[4px] bg-[var(--color-tint-sage)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-primary-800)]">
                    основний
                  </span>
                ) : (
                  <span className="type-caption ml-2">альтернатива</span>
                )}
                {row.purchaseHint != null ? (
                  <span className="type-caption ml-2 tabular">
                    {row.priceKgUsd != null && pricingKind === "unit"
                      ? `${row.priceKgUsd} $/кг → `
                      : ""}
                    {formatMoneyUah(row.purchaseHint)}
                    /{qtyUnit}
                  </span>
                ) : null}
                {pricingKind === "fabric"
                  ? configuredSupplierDeliveryOptions({
                      deliveryType: row.deliveryType,
                      cargoUsdPerKg: row.cargoUsdPerKg,
                      npStandardUsdPerKg: row.npStandardUsdPerKg,
                      npVolumeUsdPerKg: row.npVolumeUsdPerKg,
                    }).map((opt) => (
                      <span key={opt.type} className="type-caption ml-2 tabular">
                        {opt.label} · {opt.rateUsdPerKg} $/кг
                      </span>
                    ))
                  : trimConfiguredDeliveryOptions({
                      deliveryType: row.deliveryType,
                      cargoUsdPerKg: row.cargoUsdPerKg,
                      npStandardUsdPerKg: row.npStandardUsdPerKg,
                      npVolumeUsdPerKg: row.npVolumeUsdPerKg,
                    }).map((opt) => (
                      <span key={opt.type} className="type-caption ml-2 tabular">
                        {opt.label} · {opt.rateUsdPerKg} $/кг
                      </span>
                    ))}
                {(row.availableColors?.length ?? 0) > 0 ? (
                  <span className="type-caption ml-2 inline-flex flex-wrap items-center gap-1">
                    {row.availableColors.slice(0, 6).map((label) => {
                      const swatch = swatchForColorLabel(label);
                      return (
                        <span
                          key={label}
                          className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface)] px-1.5 py-0.5"
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
                          <span className="text-[11px]">{label}</span>
                        </span>
                      );
                    })}
                    {row.availableColors.length > 6 ? (
                      <span className="text-[11px]">+{row.availableColors.length - 6}</span>
                    ) : null}
                  </span>
                ) : (
                  <span className="type-caption ml-2 text-[var(--color-warning-text)]">
                    без палітри
                  </span>
                )}
              </span>
              <span className="flex flex-wrap gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => openEdit(row)}
                >
                  Умови
                </Button>
                {!row.isPrimary ? (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => makePrimary(row.id)}
                    >
                      Зробити основним
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      disabled={pending}
                      onClick={() => removeOffer(row.id)}
                    >
                      Прибрати
                    </Button>
                  </>
                ) : null}
              </span>
            </li>
          ))
        )}
      </ul>

      {editingId != null ? (
        <div className="space-y-3 border-t border-[var(--color-divider)] pt-3">
          <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
            {editingId === "new"
              ? draft.asPrimary || offers.length === 0
                ? "Новий основний постачальник"
                : "Нова альтернатива"
              : draft.asPrimary
                ? "Умови основного (→ собівартість каталогу)"
                : "Умови альтернативи"}
          </p>

          <FormGroup label="Постачальник" icon={<IconClients size={14} />} columns={2} compact>
            <Select
              className="sm:col-span-2"
              label="Назва"
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
                if (editingId === "new") {
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
                }
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
                value={draft.supplierName}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, supplierName: event.target.value }))
                }
                placeholder="Зейджан"
                autoFocus
              />
            ) : null}
          </FormGroup>

          <FormGroup label="Палітра кольорів" columns={1} compact>
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
                            ? amountToUah(pack, unitQuoteCurrency, usdUahRate)
                            : null;
                        const unitUah =
                          unit != null && Number.isFinite(unit)
                            ? amountToUah(unit, unitQuoteCurrency, usdUahRate)
                            : null;
                        return {
                          ...prev,
                          purchasePackPrice:
                            packUah != null
                              ? String(amountFromUah(packUah, next, usdUahRate))
                              : "",
                          priceMeterUahNoVat:
                            unitUah != null
                              ? String(amountFromUah(unitUah, next, usdUahRate))
                              : "",
                          priceMeterUahVat:
                            unitUah != null
                              ? String(amountFromUah(unitUah, next, usdUahRate))
                              : "",
                        };
                      });
                      setUnitQuoteCurrency(next);
                    }}
                  />
                ) : null}
                {allowPackQuote ? (
                  <ModeSegment
                    label="Ціна"
                    value={unitQuoteMode}
                    options={[
                      { value: "each", label: packLabels.eachQuote },
                      { value: "pack", label: packLabels.packQuote },
                      ...(packLabels.showUnitsPerKg
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
                ) : null}
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
                          usdUahRate,
                        ) ?? "",
                      )
                    : unitQuoteMode === "pack" &&
                        hasTrimPackQuote({
                          unitsPerPack,
                          purchasePackPrice: draft.purchasePackPrice
                            ? amountToUah(
                                Number(draft.purchasePackPrice),
                                unitQuoteCurrency,
                                usdUahRate,
                              )
                            : null,
                          packDeliveryCostUah:
                            unitDeliveryUiMode === "fixed" && draft.packDeliveryCostUah
                              ? amountToUah(
                                  Number(draft.packDeliveryCostUah),
                                  fixedDeliveryCurrency,
                                  usdUahRate,
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
                                    usdUahRate,
                                  )
                                : null,
                              packDeliveryCostUah:
                                unitDeliveryUiMode === "fixed" && draft.packDeliveryCostUah
                                  ? amountToUah(
                                      Number(draft.packDeliveryCostUah),
                                      fixedDeliveryCurrency,
                                      usdUahRate,
                                    )
                                  : null,
                              fallbackUnitPrice: 0,
                            });
                            return unitQuoteCurrency === "usd"
                              ? amountFromUah(uah, "usd", usdUahRate)
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
                  usdUahRate={usdUahRateInput}
                  onUsdUahRateChange={(value) => {
                    setUsdUahRateInput(value);
                    const n = Number(String(value).replace(",", "."));
                    if (Number.isFinite(n) && n > 0) setUsdUahRate(n);
                  }}
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
                          const uah = amountToUah(raw, fixedDeliveryCurrency, usdUahRate);
                          return {
                            ...prev,
                            packDeliveryCostUah: String(amountFromUah(uah, next, usdUahRate)),
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
                        ? `Курс ${usdUahRate} ₴/$ · фікс за пачку/поставку`
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
                  usdUahRate,
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
                  usdUahRate,
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
                Активна собівартість: {formatMoneyUah(derived.purchasePrice)}/{qtyUnit}
                {derived.pricingMode === "cut" ? " (роздріб)" : ""}
                {tierMode === "tier" &&
                draft.minWholesaleMeters.trim() !== "" &&
                Number(draft.minWholesaleMeters) > 0
                  ? draft.priceMeterUahCutVat.trim() && Number(draft.priceMeterUahCutVat) > 0
                    ? ` · < ${draft.minWholesaleMeters} ${qtyUnit} → роздріб`
                    : ` · роздріб до ${draft.minWholesaleMeters} ${qtyUnit}`
                  : " · ціна"}
                {quoteCurrency === "usd" ? ` · курс ${usdUahRate} ₴/$` : ""}
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
                usdUahRate={usdUahRateInput}
                onUsdUahRateChange={(value) => {
                  setUsdUahRateInput(value);
                  const n = Number(String(value).replace(",", "."));
                  if (Number.isFinite(n) && n > 0) setUsdUahRate(n);
                }}
                draft={draft}
                onChange={(next) => {
                  setDraft((prev) => {
                    const merged = { ...prev, ...next };
                    if (!merged.priceKgUsd || merged.deliveryType !== "CARGO") return merged;
                    const cargo = merged.cargoUsdPerKg ? Number(merged.cargoUsdPerKg) : null;
                    const auto = deriveFabricPricing(
                      {
                        metersPerKg: metersPerKg ?? null,
                        priceKgUsd: Number(merged.priceKgUsd),
                        priceKgUsdVat: merged.priceKgUsdVat
                          ? Number(merged.priceKgUsdVat)
                          : null,
                      },
                      {
                        ...liveGlobals,
                        fabricCargoUsdPerKg:
                          cargo != null && cargo >= 0 ? cargo : liveGlobals.fabricCargoUsdPerKg,
                      },
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
                }}
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
            <Button type="button" size="sm" disabled={pending} onClick={saveDraft}>
              {pending ? "Збереження…" : "Зберегти умови"}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setEditingId(null)}
            >
              Скасувати
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() => openNew(offers.length === 0)}
          >
            {offers.length === 0 ? "Додати основного постачальника" : "Додати альтернативу"}
          </Button>
        </div>
      )}
    </div>
  );
}
