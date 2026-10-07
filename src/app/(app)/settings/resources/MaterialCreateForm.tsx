"use client";

import {
  useId,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { Select, FormGroup } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { SidePanel } from "@/components/ui/Overlay";
import { SidePanelSkeleton } from "@/components/ui/Skeleton";
import {
  IconCalc,
  IconClients,
  IconFabricKind,
  IconFormTitle,
  IconMeterPrice,
  IconNote,
  IconParams,
  IconPurchaseKg,
  IconSpec,
} from "@/components/ui/Icons";
import { MaterialTagPicker } from "@/components/catalog/MaterialTagPicker";
import { MaterialReferenceLinks } from "@/components/catalog/MaterialReferenceLinks";
import {
  normalizeMaterialTagColor,
  type MaterialTagColor,
} from "@/lib/material-tags";
import { materialPackLabels, materialQtyUnitShort, isSelectableMaterialUnit } from "@/lib/material-pack-labels";
import {
  ModeSegment,
  PurchaseModeRow,
  inferFabricTierMode,
  type FabricTierMode,
} from "@/components/catalog/FabricPurchaseModes";
import { UnsavedChangesDialog } from "@/components/ui/UnsavedChangesDialog";
import { MaterialDuplicateIconButton } from "@/components/catalog/MaterialRowActions";
import { PanelTabs } from "@/components/ui/Tabs";
import {
  createMaterialAction,
  getMaterialForEditAction,
  listCompositionNamesAction,
  listSupplierNamesAction,
  updateMaterialAction,
} from "@/server/domains/catalog/actions";
import { MaterialSuppliersEditor } from "@/components/catalog/MaterialSuppliersEditor";
import {
  MaterialSupplierDraftsEditor,
  type MaterialSupplierOfferDraft,
} from "@/components/catalog/MaterialSupplierDraftsEditor";
import { FABRIC_COMPOSITIONS, COMPOSITION_OTHER } from "@/lib/fabric-compositions";
import { FABRIC_KINDS, FABRIC_KIND_OTHER, normalizeFabricKind } from "@/lib/fabric-kinds";
import {
  deriveFabricPricing,
  linearMeterPriceFromSquareMeter,
  metersPerKgFromDensityWidth,
  resolveFabricUnitMode,
  squareMeterPriceFromLinearMeter,
  DEFAULT_FABRIC_PRICING_GLOBALS,
  type FabricPricingGlobals,
  type FabricUnitMode,
} from "@/lib/fabric-pricing";
import {
  FABRIC_DELIVERY_TYPES,
  deliveryRateUsdPerKg,
  deliveryRateUnitLabel,
  fabricDeliveryTypeLabel,
  normalizeFabricDeliveryType,
  type FabricDeliveryTypeCode,
} from "@/lib/fabric-delivery-types";
import {
  deriveUnitPriceFromPack,
  hasTrimPackQuote,
} from "@/lib/trim-pack-pricing";
import { formatMoneyUah } from "@/lib/utils";

type UnitOption = { id: string; label: string; code?: string };

function resolveUnitCode(unit: UnitOption | undefined): string {
  if (!unit) return "m";
  if (unit.code?.trim()) return unit.code.trim().toLowerCase();
  const fromLabel = unit.label.match(/\(([a-z0-9]+)\)\s*$/i);
  if (fromLabel) return fromLabel[1].toLowerCase();
  const label = unit.label.toLowerCase();
  if (label.includes("кг") || label.includes("kg")) return "kg";
  if (label.includes("м²") || label.includes("m2") || label.includes("м2")) return "m2";
  if (label.includes("боб") || label.includes("cone")) return "cone";
  if (label.includes("шт") || label.includes("pcs")) return "pcs";
  return "m";
}

export type MaterialWizardMeta = {
  step: number;
  stepCount: number;
  stepTitle: string;
  isFirst: boolean;
  isLast: boolean;
  canNext: boolean;
  goNext: () => void;
  goBack: () => void;
};

export type MaterialFormDefaults = {
  id: string;
  nameUk: string;
  type: string;
  unitOfMeasureId: string;
  purchasePrice: number;
  defaultWastePercent: number;
  supplierCode: string;
  colorOrAttribute: string;
  note: string;
  referenceUrls?: string[];
  updatedAt?: string | null;
  tagColor?: string | null;
  densityGsm?: string;
  composition?: string;
  metersPerKg?: number | null;
  priceKgUsd?: number | null;
  priceKgUsdCargo?: number | null;
  priceKgUsdVat?: number | null;
  priceMeterUahNoVat?: number | null;
  priceMeterUahVat?: number | null;
  priceMeterUahCutVat?: number | null;
  fabricKindUk?: string;
  widthCm?: string;
  wholesaleNote?: string;
  rollWeightKg?: number | null;
  metersPerRoll?: number | null;
  minWholesaleMeters?: number | null;
  costVatOverride?: "NET" | "GROSS" | null;
  deliveryType?: FabricDeliveryTypeCode | null;
  unitsPerPack?: number | null;
  unitsPerKg?: number | null;
  purchasePackPrice?: number | null;
  packDeliveryCostUah?: number | null;
};

function numStr(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "";
  return String(value);
}

function resolveCompositionSelect(composition: string | undefined, known: string[]) {
  const trimmed = composition?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return { select: "", other: "" };
  const match = known.find((item) => item.toLowerCase() === trimmed.toLowerCase());
  if (match) return { select: match, other: "" };
  return { select: COMPOSITION_OTHER, other: trimmed };
}

function resolveFabricKindSelect(kind: string | undefined) {
  const normalized = normalizeFabricKind(kind) ?? "";
  if (!normalized) return { select: "", other: "" };
  if ((FABRIC_KINDS as readonly string[]).includes(normalized)) {
    return { select: normalized, other: "" };
  }
  return { select: FABRIC_KIND_OTHER, other: normalized };
}

const SUPPLIER_OTHER = "__other__";

function resolveSupplierSelect(supplier: string | undefined, known: string[]) {
  const trimmed = supplier?.replace(/\s+/g, " ").trim() ?? "";
  if (!trimmed) return { select: "", other: "" };
  if (known.some((item) => item.toLowerCase() === trimmed.toLowerCase())) {
    const match = known.find((item) => item.toLowerCase() === trimmed.toLowerCase()) ?? trimmed;
    return { select: match, other: "" };
  }
  return { select: SUPPLIER_OTHER, other: trimmed };
}

function MaterialFields({
  units,
  defaults,
  fabricGlobals,
  suppliers = [],
  managePricingSeparately = false,
  wizard = false,
  onWizardMeta,
  onDirtyChange,
}: {
  units: UnitOption[];
  defaults?: MaterialFormDefaults;
  fabricGlobals: FabricPricingGlobals;
  suppliers?: string[];
  /** Edit fabric: prices live in MaterialSuppliersEditor, not in this form. */
  managePricingSeparately?: boolean;
  wizard?: boolean;
  onWizardMeta?: (meta: MaterialWizardMeta) => void;
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const initialKind = resolveFabricKindSelect(defaults?.fabricKindUk);
  const [catalogCompositions, setCatalogCompositions] = useState<string[]>([
    ...FABRIC_COMPOSITIONS,
  ]);
  const [catalogSuppliers, setCatalogSuppliers] = useState(suppliers);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([listSupplierNamesAction(), listCompositionNamesAction()])
      .then(([supplierNames, compositionNames]) => {
        if (cancelled) return;
        setCatalogSuppliers((prev) => {
          const set = new Set([...prev, ...suppliers, ...supplierNames]);
          return [...set].sort((a, b) => a.localeCompare(b, "uk"));
        });
        setCatalogCompositions(() => {
          const set = new Set<string>([...FABRIC_COMPOSITIONS, ...compositionNames]);
          const current = defaults?.composition?.replace(/\s+/g, " ").trim();
          if (current) set.add(current);
          return [...set].sort((a, b) => a.localeCompare(b, "uk"));
        });
      })
      .catch(() => {
        if (!cancelled) {
          setCatalogSuppliers(suppliers);
          setCatalogCompositions([...FABRIC_COMPOSITIONS]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [suppliers, defaults?.composition]);

  const knownSuppliers = useMemo(() => {
    const set = new Set(
      catalogSuppliers.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean),
    );
    const current = defaults?.supplierCode?.replace(/\s+/g, " ").trim();
    if (current) set.add(current);
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [catalogSuppliers, defaults?.supplierCode]);

  const knownCompositions = useMemo(() => {
    const set = new Set(
      catalogCompositions.map((item) => item.replace(/\s+/g, " ").trim()).filter(Boolean),
    );
    const current = defaults?.composition?.replace(/\s+/g, " ").trim();
    if (current) set.add(current);
    return [...set].sort((a, b) => a.localeCompare(b, "uk"));
  }, [catalogCompositions, defaults?.composition]);

  const initialSupplier = resolveSupplierSelect(defaults?.supplierCode, knownSuppliers);
  const [type, setType] = useState(defaults?.type ?? "FABRIC");
  const [nameUk, setNameUk] = useState(defaults?.nameUk ?? "");
  const [tagColor, setTagColor] = useState<MaterialTagColor | null>(() =>
    normalizeMaterialTagColor(defaults?.tagColor),
  );

  useEffect(() => {
    setTagColor(normalizeMaterialTagColor(defaults?.tagColor));
  }, [defaults?.id, defaults?.tagColor]);
  const [wizardStep, setWizardStep] = useState(0);
  const [unitOfMeasureId, setUnitOfMeasureId] = useState(
    defaults?.unitOfMeasureId ?? units[0]?.id ?? "",
  );
  const [compositionSelect, setCompositionSelect] = useState(() =>
    resolveCompositionSelect(defaults?.composition, [
      ...FABRIC_COMPOSITIONS,
      ...(defaults?.composition ? [defaults.composition] : []),
    ]).select,
  );
  const [compositionOther, setCompositionOther] = useState(() =>
    resolveCompositionSelect(defaults?.composition, [
      ...FABRIC_COMPOSITIONS,
      ...(defaults?.composition ? [defaults.composition] : []),
    ]).other,
  );
  const [fabricKindSelect, setFabricKindSelect] = useState(initialKind.select);
  const [fabricKindOther, setFabricKindOther] = useState(initialKind.other);
  const [supplierSelect, setSupplierSelect] = useState(initialSupplier.select);
  const [supplierOther, setSupplierOther] = useState(initialSupplier.other);
  const [supplierDrafts, setSupplierDrafts] = useState<MaterialSupplierOfferDraft[]>([]);
  const [supplierDraftEditing, setSupplierDraftEditing] = useState(false);

  const [densityGsm, setDensityGsm] = useState(defaults?.densityGsm ?? "");
  const [widthCm, setWidthCm] = useState(defaults?.widthCm ?? "");
  const [metersPerKg, setMetersPerKg] = useState(numStr(defaults?.metersPerKg));
  /** Manual only when saved м.п./кг differs from density×width — else edit keeps auto-calc. */
  const [metersPerKgManual, setMetersPerKgManual] = useState(() => {
    const saved = defaults?.metersPerKg;
    if (saved == null || !(Number(saved) > 0)) return false;
    const auto = metersPerKgFromDensityWidth(defaults?.densityGsm, defaults?.widthCm);
    if (auto == null) return true;
    return Math.abs(Number(saved) - auto) > 0.05;
  });
  const [priceKgUsd, setPriceKgUsd] = useState(numStr(defaults?.priceKgUsd));
  const [priceKgUsdVat, setPriceKgUsdVat] = useState(numStr(defaults?.priceKgUsdVat));
  const [priceMeterNoVat, setPriceMeterNoVat] = useState(numStr(defaults?.priceMeterUahNoVat));
  const [priceMeterVat, setPriceMeterVat] = useState(numStr(defaults?.priceMeterUahVat));
  const [priceMeterCutVat, setPriceMeterCutVat] = useState(numStr(defaults?.priceMeterUahCutVat));
  const [priceM2NoVat, setPriceM2NoVat] = useState(() =>
    numStr(
      squareMeterPriceFromLinearMeter(defaults?.priceMeterUahNoVat, defaults?.widthCm),
    ),
  );
  const [priceM2Vat, setPriceM2Vat] = useState(() =>
    numStr(squareMeterPriceFromLinearMeter(defaults?.priceMeterUahVat, defaults?.widthCm)),
  );
  const [minWholesaleMeters, setMinWholesaleMeters] = useState(
    numStr(defaults?.minWholesaleMeters),
  );
  const [tierMode, setTierMode] = useState<FabricTierMode>(() =>
    inferFabricTierMode({
      minWholesaleMeters: defaults?.minWholesaleMeters,
      priceMeterUahCutVat: defaults?.priceMeterUahCutVat,
    }),
  );
  const [wholesaleNote, setWholesaleNote] = useState(defaults?.wholesaleNote ?? "");
  const [note, setNote] = useState(defaults?.note ?? "");
  const [referenceUrls, setReferenceUrls] = useState<string[]>(
    () => defaults?.referenceUrls ?? [],
  );
  const [costOverride, setCostOverride] = useState(defaults?.costVatOverride ?? "");
  const dirtyNotified = useRef(false);
  function markDirty() {
    if (dirtyNotified.current) return;
    dirtyNotified.current = true;
    onDirtyChange?.(true);
  }
  const [deliveryType, setDeliveryType] = useState<FabricDeliveryTypeCode>(
    normalizeFabricDeliveryType(defaults?.deliveryType),
  );
  const [fabricCargoUsdPerKg, setFabricCargoUsdPerKg] = useState(() =>
    String(
      deliveryRateUsdPerKg(normalizeFabricDeliveryType(defaults?.deliveryType), fabricGlobals),
    ),
  );
  const [usdUahRate, setUsdUahRate] = useState(fabricGlobals.usdUahRate);

  useEffect(() => {
    setUsdUahRate(fabricGlobals.usdUahRate);
  }, [fabricGlobals.usdUahRate]);

  const [purchasePrice, setPurchasePrice] = useState(String(defaults?.purchasePrice ?? 0));
  const [unitsPerPack, setUnitsPerPack] = useState(numStr(defaults?.unitsPerPack));
  const [unitsPerKg, setUnitsPerKg] = useState(numStr(defaults?.unitsPerKg));
  const [purchasePackPrice, setPurchasePackPrice] = useState(numStr(defaults?.purchasePackPrice));
  const [packDeliveryCostUah, setPackDeliveryCostUah] = useState(
    numStr(defaults?.packDeliveryCostUah),
  );

  const selectedUnit = units.find((unit) => unit.id === unitOfMeasureId) ?? units[0];
  const fabricUnitMode = resolveFabricUnitMode(resolveUnitCode(selectedUnit));
  const packLabels = materialPackLabels(fabricUnitMode);
  const qtyUnit = materialQtyUnitShort(fabricUnitMode);
  const unitOptions = useMemo(() => {
    const selectable = units.filter(isSelectableMaterialUnit);
    if (selectedUnit && !selectable.some((unit) => unit.id === selectedUnit.id)) {
      return [selectedUnit, ...selectable];
    }
    return selectable;
  }, [units, selectedUnit]);
  const fabricMeterPricing =
    type === "FABRIC" && (fabricUnitMode === "m" || fabricUnitMode === "kg" || fabricUnitMode === "m2");
  const fabricEachPricing =
    type === "FABRIC" && (fabricUnitMode === "pcs" || fabricUnitMode === "cone");
  const pricingInline = fabricMeterPricing && !managePricingSeparately;
  /** Density + width drive м.п./кг when buying in kg. */
  const densityWidthRequired = type === "FABRIC" && fabricUnitMode === "kg";
  /** Density/width visible for all meter-priced fabrics (edit + catalog); required only in kg. */
  const showDensityField = type === "FABRIC" && fabricMeterPricing;
  const showWidthField = type === "FABRIC" && fabricMeterPricing;
  const widthRequiredForM2 = type === "FABRIC" && fabricUnitMode === "m2";
  /** м.п./кг: required+auto for kg; optional logistics for m/m2. */
  const showMetersPerKg = type === "FABRIC" && fabricMeterPricing;
  const metersPerKgRequired = type === "FABRIC" && fabricUnitMode === "kg";
  const metersPerKgAutoOnly = type === "FABRIC" && fabricUnitMode === "kg";
  const autoMetersPerKg = metersPerKgFromDensityWidth(densityGsm, widthCm);

  const liveGlobals = useMemo<FabricPricingGlobals>(
    () => ({
      ...fabricGlobals,
      usdUahRate,
      fabricCargoUsdPerKg:
        Number(fabricCargoUsdPerKg) >= 0
          ? Number(fabricCargoUsdPerKg)
          : deliveryRateUsdPerKg(deliveryType, fabricGlobals),
    }),
    [fabricGlobals, fabricCargoUsdPerKg, deliveryType, usdUahRate],
  );

  function applyDeliveryType(nextType: FabricDeliveryTypeCode) {
    setDeliveryType(nextType);
    const rate = deliveryRateUsdPerKg(nextType, fabricGlobals);
    setFabricCargoUsdPerKg(String(rate));
    recalcMeterPrices({ fabricCargoUsdPerKg: String(rate) });
  }

  const derived = useMemo(
    () =>
      deriveFabricPricing(
        {
          metersPerKg: metersPerKg ? Number(metersPerKg) : null,
          priceKgUsd: priceKgUsd ? Number(priceKgUsd) : null,
          priceKgUsdVat: priceKgUsdVat ? Number(priceKgUsdVat) : null,
          priceMeterUahNoVat: priceMeterNoVat ? Number(priceMeterNoVat) : null,
          priceMeterUahVat: priceMeterVat ? Number(priceMeterVat) : null,
          priceMeterUahCutVat: priceMeterCutVat ? Number(priceMeterCutVat) : null,
          rollWeightKg: null,
          metersPerRoll: null,
          minWholesaleMeters: minWholesaleMeters ? Number(minWholesaleMeters) : null,
          costVatOverride: costOverride === "NET" || costOverride === "GROSS" ? costOverride : null,
        },
        liveGlobals,
      ),
    [
      metersPerKg,
      priceKgUsd,
      priceKgUsdVat,
      priceMeterNoVat,
      priceMeterVat,
      priceMeterCutVat,
      minWholesaleMeters,
      costOverride,
      liveGlobals,
    ],
  );

  function applyMetersPerKg(value: string, opts?: { fromAuto?: boolean }) {
    setMetersPerKg(value);
    if (opts?.fromAuto) {
      setMetersPerKgManual(false);
    } else {
      setMetersPerKgManual(Boolean(value.trim()));
    }
    if (pricingInline) recalcMeterPrices({ metersPerKg: value });
  }

  function syncMetersPerKgFromDensity(nextDensity: string, nextWidth: string) {
    const auto = metersPerKgFromDensityWidth(nextDensity, nextWidth);
    if (auto == null) return;
    // Density × width always drives м.п./кг (kg required; m/m² optional logistics).
    applyMetersPerKg(String(auto), { fromAuto: true });
  }

  // Edit/create: keep м.п./кг in sync whenever density/width (or kg mode) can compute it.
  useEffect(() => {
    if (autoMetersPerKg == null) return;
    applyMetersPerKg(String(autoMetersPerKg), { fromAuto: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- drive from formula inputs / kg mode only
  }, [autoMetersPerKg, metersPerKgAutoOnly]);

  function applyM2Prices(next: {
    priceM2NoVat?: string;
    priceM2Vat?: string;
    widthCm?: string;
  }) {
    const width = next.widthCm ?? widthCm;
    const noVatRaw = next.priceM2NoVat ?? priceM2NoVat;
    const vatRaw = next.priceM2Vat ?? priceM2Vat;
    if (next.priceM2NoVat != null) setPriceM2NoVat(next.priceM2NoVat);
    if (next.priceM2Vat != null) setPriceM2Vat(next.priceM2Vat);
    const linearNoVat = linearMeterPriceFromSquareMeter(
      noVatRaw ? Number(noVatRaw) : null,
      width,
    );
    const linearVat = linearMeterPriceFromSquareMeter(vatRaw ? Number(vatRaw) : null, width);
    if (linearNoVat != null) setPriceMeterNoVat(String(linearNoVat));
    if (linearVat != null) setPriceMeterVat(String(linearVat));
  }

  function recalcMeterPrices(next: {
    fabricCargoUsdPerKg?: string;
    metersPerKg?: string;
    priceKgUsd?: string;
    priceKgUsdVat?: string;
  }) {
    const globals: FabricPricingGlobals = {
      ...fabricGlobals,
      fabricCargoUsdPerKg:
        Number(next.fabricCargoUsdPerKg ?? fabricCargoUsdPerKg) >= 0
          ? Number(next.fabricCargoUsdPerKg ?? fabricCargoUsdPerKg)
          : fabricGlobals.fabricCargoUsdPerKg,
    };
    const auto = deriveFabricPricing(
      {
        metersPerKg: (next.metersPerKg ?? metersPerKg)
          ? Number(next.metersPerKg ?? metersPerKg)
          : null,
        priceKgUsd: (next.priceKgUsd ?? priceKgUsd)
          ? Number(next.priceKgUsd ?? priceKgUsd)
          : null,
        priceKgUsdVat: (next.priceKgUsdVat ?? priceKgUsdVat)
          ? Number(next.priceKgUsdVat ?? priceKgUsdVat)
          : null,
        priceMeterUahNoVat: null,
        priceMeterUahVat: null,
        rollWeightKg: null,
        costVatOverride: costOverride === "NET" || costOverride === "GROSS" ? costOverride : null,
      },
      globals,
    );
    if (auto.priceMeterUahNoVat != null) setPriceMeterNoVat(String(auto.priceMeterUahNoVat));
    if (auto.priceMeterUahVat != null) setPriceMeterVat(String(auto.priceMeterUahVat));
  }

  const compositionValue =
    compositionSelect === COMPOSITION_OTHER ? compositionOther : compositionSelect;
  const fabricKindValue =
    fabricKindSelect === FABRIC_KIND_OTHER ? fabricKindOther : fabricKindSelect;
  const supplierValue =
    supplierSelect === SUPPLIER_OTHER ? supplierOther.trim() : supplierSelect;

  /** Тканина в шт/од. — ті самі поля упаковки, що й «Інший матеріал». */
  const unitLikeMaterial = type !== "FABRIC" || fabricEachPricing;
  const trimPackQuote = {
    unitsPerPack: unitsPerPack ? Number(unitsPerPack) : null,
    purchasePackPrice: purchasePackPrice !== "" ? Number(purchasePackPrice) : null,
    packDeliveryCostUah: packDeliveryCostUah !== "" ? Number(packDeliveryCostUah) : null,
  };
  const trimPackActive = unitLikeMaterial && hasTrimPackQuote(trimPackQuote);
  const trimUnitFromPack = deriveUnitPriceFromPack(
    trimPackQuote,
    Number(purchasePrice) || 0,
  );

  const purchaseDisplay =
    type === "FABRIC" && !fabricEachPricing
      ? managePricingSeparately
        ? String(defaults?.purchasePrice ?? purchasePrice)
        : derived.purchasePrice > 0
          ? String(derived.purchasePrice)
          : purchasePrice
      : trimPackActive
        ? String(trimUnitFromPack)
        : purchasePrice;

  const policyLabel =
    liveGlobals.materialCostVatMode === "GROSS" ? "GROSS" : "NET";
  const purchaseReadOnly = trimPackActive;
  /** Тканина м/кг/м² — ₴/м у постачальника / «Ціни», не дубль на «Основне». */
  const showPurchasePriceOnMain = unitLikeMaterial;

  const wizardSteps = useMemo(() => {
    if (type !== "FABRIC") {
      // Same mental model as edit: Основне (шт/собівартість) → Постачальник (ціна/доставка).
      return ["Основне", "Постачальник", "Готово"];
    }
    if (managePricingSeparately) {
      return ["Основне", "Параметри", "Доставка", "Готово"];
    }
    // Create wizard: «Основне» = identity + fabric kind/composition
    if (wizard) {
      if (fabricEachPricing) {
        return ["Основне", "Постачальник", "Готово"];
      }
      return ["Основне", "Параметри", "Постачальник", "Готово"];
    }
    if (fabricEachPricing) {
      return ["Основне", "Постачальник", "Ціна", "Готово"];
    }
    return ["Основне", "Параметри", "Постачальник", "Ціни", "Готово"];
  }, [type, managePricingSeparately, fabricEachPricing, wizard]);

  useEffect(() => {
    if (wizardStep >= wizardSteps.length) setWizardStep(Math.max(0, wizardSteps.length - 1));
  }, [wizardStep, wizardSteps.length]);

  const stepKey = wizardSteps[wizardStep] ?? "Основне";

  const wizardMultiSuppliers = wizard && !managePricingSeparately;
  /** Unit/pack quote lives on supplier offers (create drafts or edit editor). */
  const trimPricingOnSuppliers =
    unitLikeMaterial && (managePricingSeparately || wizardMultiSuppliers);
  const supplierPricingKind = type === "FABRIC" && !fabricEachPricing ? "fabric" : "unit";

  /** Mirror primary draft into classic form fields so createMaterial still syncs primary. */
  useEffect(() => {
    if (!wizardMultiSuppliers) return;
    const primary = supplierDrafts.find((row) => row.isPrimary) ?? supplierDrafts[0];
    if (!primary) return;
    const name = primary.supplierName.trim();
    if (!name) return;
    const known = knownSuppliers.some((item) => item.toLowerCase() === name.toLowerCase());
    if (known) {
      setSupplierSelect(name);
      setSupplierOther("");
    } else {
      setSupplierSelect(SUPPLIER_OTHER);
      setSupplierOther(name);
    }
    if (supplierPricingKind === "unit") {
      if (primary.purchasePackPrice) setPurchasePackPrice(primary.purchasePackPrice);
      if (primary.packDeliveryCostUah) setPackDeliveryCostUah(primary.packDeliveryCostUah);
      if (primary.priceMeterUahNoVat) setPurchasePrice(primary.priceMeterUahNoVat);
      if (primary.priceMeterUahCutVat) setPriceMeterCutVat(primary.priceMeterUahCutVat);
      if (primary.minWholesaleMeters) setMinWholesaleMeters(primary.minWholesaleMeters);
      setTierMode(
        inferFabricTierMode({
          minWholesaleMeters: primary.minWholesaleMeters,
          priceMeterUahCutVat: primary.priceMeterUahCutVat,
        }),
      );
      return;
    }
    if (primary.priceKgUsd) setPriceKgUsd(primary.priceKgUsd);
    if (primary.priceKgUsdVat) setPriceKgUsdVat(primary.priceKgUsdVat);
    if (primary.priceMeterUahNoVat) setPriceMeterNoVat(primary.priceMeterUahNoVat);
    if (primary.priceMeterUahVat) setPriceMeterVat(primary.priceMeterUahVat);
    if (primary.priceMeterUahCutVat) setPriceMeterCutVat(primary.priceMeterUahCutVat);
    if (primary.minWholesaleMeters) setMinWholesaleMeters(primary.minWholesaleMeters);
    setTierMode(
      inferFabricTierMode({
        minWholesaleMeters: primary.minWholesaleMeters,
        priceMeterUahCutVat: primary.priceMeterUahCutVat,
      }),
    );
    if (primary.wholesaleNote) setWholesaleNote(primary.wholesaleNote);
    if (primary.cargoUsdPerKg) setFabricCargoUsdPerKg(primary.cargoUsdPerKg);
    if (primary.deliveryType) {
      setDeliveryType(normalizeFabricDeliveryType(primary.deliveryType));
    }
  }, [wizardMultiSuppliers, supplierDrafts, knownSuppliers, supplierPricingKind]);

  function stepCanNext(): boolean {
    if (stepKey === "Основне") return Boolean(nameUk.trim() && unitOfMeasureId);
    if (stepKey === "Параметри" && densityWidthRequired) {
      return Boolean(densityGsm.trim() && widthCm.trim() && metersPerKg);
    }
    if (stepKey === "Параметри" && widthRequiredForM2) {
      return Boolean(widthCm.trim());
    }
    if (stepKey === "Постачальник" || stepKey === "Доставка") {
      if (wizardMultiSuppliers) {
        return supplierDrafts.length > 0 && !supplierDraftEditing;
      }
      return Boolean(supplierValue || managePricingSeparately);
    }
    if (stepKey === "Ціни" || stepKey === "Ціна") {
      if (fabricUnitMode === "kg") return Boolean(priceKgUsd);
      if (fabricUnitMode === "m" || fabricUnitMode === "m2") {
        return Boolean(priceMeterNoVat || (fabricUnitMode === "m2" && priceM2NoVat));
      }
      if (fabricEachPricing) return Boolean(Number(purchasePrice) >= 0);
    }
    return true;
  }

  useEffect(() => {
    if (!wizard || !onWizardMeta) return;
    onWizardMeta({
      step: wizardStep,
      stepCount: wizardSteps.length,
      stepTitle: stepKey,
      isFirst: wizardStep <= 0,
      isLast: wizardStep >= wizardSteps.length - 1,
      canNext: stepCanNext(),
      goNext: () => {
        if (!stepCanNext()) return;
        setWizardStep((s) => Math.min(s + 1, wizardSteps.length - 1));
      },
      goBack: () => setWizardStep((s) => Math.max(s - 1, 0)),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- stepCanNext reads latest state via closure on each render
  }, [
    wizard,
    onWizardMeta,
    wizardStep,
    wizardSteps,
    stepKey,
    nameUk,
    unitOfMeasureId,
    densityGsm,
    widthCm,
    metersPerKg,
    supplierValue,
    priceKgUsd,
    priceMeterNoVat,
    priceM2NoVat,
    purchasePrice,
    densityWidthRequired,
    widthRequiredForM2,
    fabricUnitMode,
    fabricEachPricing,
    managePricingSeparately,
    wizardMultiSuppliers,
    supplierDrafts,
    supplierDraftEditing,
  ]);

  function showStep(title: string) {
    return !wizard || stepKey === title;
  }

  return (
    <div className="space-y-4" onInput={markDirty} onChange={markDirty}>
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      {managePricingSeparately ? (
        <input type="hidden" name="pricingManagedSeparately" value="1" />
      ) : null}

      {wizard ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
              {stepKey}
            </p>
            <p className="type-caption tabular">
              {wizardStep + 1} / {wizardSteps.length}
            </p>
          </div>
          <div className="flex gap-1">
            {wizardSteps.map((title, index) => (
              <button
                key={title}
                type="button"
                title={title}
                onClick={() => {
                  if (index <= wizardStep) setWizardStep(index);
                }}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  index <= wizardStep
                    ? "bg-[var(--color-primary-600)]"
                    : "bg-[var(--color-border)]"
                }`}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className={showStep("Основне") ? "space-y-4" : "hidden"}>
      <MaterialTagPicker value={tagColor} onChange={setTagColor} />
      <FormGroup label={wizard ? undefined : "Основне"} icon={wizard ? undefined : <IconFormTitle size={14} />} columns={2} compact>
        <Input
          className="sm:col-span-2"
          name="nameUk"
          label="Назва"
          required
          autoFocus={!defaults && (!wizard || wizardStep === 0)}
          placeholder="Кулір 30/1"
          value={nameUk}
          onChange={(event) => setNameUk(event.target.value)}
        />
        <Select
          name="type"
          label="Тип"
          required
          value={type}
          onChange={(event) => {
            setType(event.target.value);
            setWizardStep(0);
          }}
        >
          <option value="FABRIC">Тканина</option>
          <option value="OTHER_MATERIAL">Інший матеріал</option>
          <option value="TRIM">Фурнітура</option>
        </Select>
        <Select
          name="unitOfMeasureId"
          label="Од. виміру"
          required
          value={unitOfMeasureId}
          onChange={(event) => {
            setUnitOfMeasureId(event.target.value);
            const nextUnit = units.find((unit) => unit.id === event.target.value) ?? units[0];
            if (type === "FABRIC" && resolveFabricUnitMode(resolveUnitCode(nextUnit)) === "kg") {
              syncMetersPerKgFromDensity(densityGsm, widthCm);
            }
          }}
        >
          {unitOptions.map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.label}
            </option>
          ))}
        </Select>
      </FormGroup>
      </div>

      {/* Calc fields: always in edit; create wizard — on «Основне» for all types. */}
      <div
        className={
          !wizard || showStep("Ціна") || showStep("Основне") ? "space-y-4" : "hidden"
        }
      >
      <FormGroup
        label={wizard ? undefined : "У розрахунку"}
        icon={wizard ? undefined : <IconCalc size={14} />}
        columns={2}
        compact
      >
        {unitLikeMaterial ? (
          <>
            <Input
              name="unitsPerPack"
              label={packLabels.contentLabel}
              type="number"
              step="1"
              min="1"
              optional
              value={unitsPerPack}
              onChange={(event) => setUnitsPerPack(event.target.value)}
            />
            {packLabels.showUnitsPerKg ? (
              <Input
                name="unitsPerKg"
                label="Шт / кг"
                type="number"
                step="0.01"
                min="0"
                optional
                value={unitsPerKg}
                onChange={(event) => setUnitsPerKg(event.target.value)}
              />
            ) : (
              <input type="hidden" name="unitsPerKg" value={unitsPerKg} />
            )}
            {!trimPricingOnSuppliers ? (
              <>
                <Input
                  name="purchasePackPrice"
                  label={packLabels.packPriceLabel}
                  type="number"
                  step="0.01"
                  min="0"
                  optional
                  suffix="₴"
                  value={purchasePackPrice}
                  onChange={(event) => setPurchasePackPrice(event.target.value)}
                />
                <Input
                  name="packDeliveryCostUah"
                  label="Доставка (фікс)"
                  type="number"
                  step="0.01"
                  min="0"
                  optional
                  suffix="₴"
                  value={packDeliveryCostUah}
                  onChange={(event) => setPackDeliveryCostUah(event.target.value)}
                />
              </>
            ) : (
              <>
                <input type="hidden" name="purchasePackPrice" value={purchasePackPrice} />
                <input type="hidden" name="packDeliveryCostUah" value={packDeliveryCostUah} />
              </>
            )}
          </>
        ) : (
          <>
            <input type="hidden" name="unitsPerPack" value={unitsPerPack} />
            <input type="hidden" name="unitsPerKg" value={unitsPerKg} />
            <input type="hidden" name="purchasePackPrice" value={purchasePackPrice} />
            <input type="hidden" name="packDeliveryCostUah" value={packDeliveryCostUah} />
          </>
        )}
        {showPurchasePriceOnMain &&
        !trimPricingOnSuppliers &&
        !(wizardMultiSuppliers && unitLikeMaterial) ? (
          <Input
            name={wizardMultiSuppliers && !trimPackActive ? undefined : "purchasePrice"}
            label="Ціна"
            type="number"
            step="0.01"
            min="0"
            required
            suffix={packLabels.unitSuffixUah}
            value={purchaseDisplay}
            readOnly={purchaseReadOnly}
            tabIndex={purchaseReadOnly ? -1 : undefined}
            hint={
              trimPackActive
                ? `(ціна + доставка) ÷ ${Math.floor(Number(unitsPerPack))} ${packLabels.eachQuote}`
                : undefined
            }
            onChange={
              purchaseReadOnly
                ? undefined
                : (event) => setPurchasePrice(event.target.value)
            }
          />
        ) : (
          <input type="hidden" name="purchasePrice" value={purchaseDisplay} />
        )}
        <Input
          name="defaultWastePercent"
          label="Відходи"
          type="number"
          step="0.01"
          min="0"
          suffix="%"
          optional
          defaultValue={defaults?.defaultWastePercent ?? 0}
        />
      </FormGroup>
      {wizard && showStep("Основне") ? (
        <FormGroup columns={2} compact>
          <Input
            name="colorOrAttribute"
            label="Колір / характеристика"
            optional
            defaultValue={defaults?.colorOrAttribute}
          />
        </FormGroup>
      ) : null}
      </div>

      {type === "FABRIC" ? (
        <>
          <div
            className={
              showStep("Тканина") || showStep("Основне") ? "space-y-4" : "hidden"
            }
          >
          <FormGroup label={wizard ? undefined : "Тканина"} icon={wizard ? undefined : <IconFabricKind size={14} />} columns={2} compact>
            <div className="space-y-2">
              <Select
                label="Тип тканини"
                optional
                value={fabricKindSelect}
                onChange={(event) => setFabricKindSelect(event.target.value)}
              >
                <option value="">Оберіть…</option>
                {FABRIC_KINDS.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
                <option value={FABRIC_KIND_OTHER}>Інше…</option>
              </Select>
              <input type="hidden" name="fabricKindUk" value={fabricKindValue} />
              {fabricKindSelect === FABRIC_KIND_OTHER ? (
                <Input
                  label="Свій тип"
                  value={fabricKindOther}
                  onChange={(event) => setFabricKindOther(event.target.value)}
                  placeholder="Наприклад фліс"
                />
              ) : null}
            </div>
            <div className="space-y-2">
              <Select
                label="Склад"
                optional
                value={compositionSelect}
                onChange={(event) => setCompositionSelect(event.target.value)}
              >
                <option value="">Оберіть…</option>
                {knownCompositions.map((label) => (
                  <option key={label} value={label}>
                    {label}
                  </option>
                ))}
                <option value={COMPOSITION_OTHER}>Додати новий…</option>
              </Select>
              <input type="hidden" name="composition" value={compositionValue} />
              {compositionSelect === COMPOSITION_OTHER ? (
                <Input
                  label="Новий склад"
                  value={compositionOther}
                  onChange={(event) => setCompositionOther(event.target.value)}
                  placeholder="80% бавовна 20% еластан"
                />
              ) : null}
            </div>
          </FormGroup>
          </div>

          <div className={showStep("Параметри") || !wizard ? "space-y-4" : "hidden"}>
          <FormGroup label={wizard ? undefined : "Параметри"} icon={wizard ? undefined : <IconParams size={14} />} columns={3} compact>
            {showDensityField ? (
              <Input
                name="densityGsm"
                label="Щільність"
                placeholder="170"
                suffix="г/м²"
                value={densityGsm}
                required={densityWidthRequired}
                onChange={(event) => {
                  const value = event.target.value;
                  setDensityGsm(value);
                  syncMetersPerKgFromDensity(value, widthCm);
                }}
              />
            ) : (
              <input type="hidden" name="densityGsm" value={densityGsm} />
            )}
            {showWidthField ? (
              <Input
                name="widthCm"
                label="Ширина"
                suffix="см"
                value={widthCm}
                required={densityWidthRequired || widthRequiredForM2}
                onChange={(event) => {
                  const value = event.target.value;
                  setWidthCm(value);
                  syncMetersPerKgFromDensity(densityGsm, value);
                  if (fabricUnitMode === "m2") applyM2Prices({ widthCm: value });
                }}
              />
            ) : (
              <input type="hidden" name="widthCm" value={widthCm} />
            )}
            {showMetersPerKg ? (
              <Input
                name="metersPerKg"
                label="м.п. / кг"
                type="number"
                step="0.01"
                min="0"
                value={metersPerKg}
                required={metersPerKgRequired}
                optional={!metersPerKgRequired}
                readOnly={metersPerKgAutoOnly}
                tabIndex={metersPerKgAutoOnly ? -1 : undefined}
                onChange={
                  metersPerKgAutoOnly
                    ? undefined
                    : (event) => applyMetersPerKg(event.target.value)
                }
              />
            ) : (
              <input type="hidden" name="metersPerKg" value={metersPerKg} />
            )}
            {type === "FABRIC" ? (
              <Input
                name="usdUahRate"
                label="Курс"
                type="number"
                step="0.01"
                min="0.01"
                suffix="₴/$"
                value={String(usdUahRate)}
                onChange={(event) => {
                  const raw = event.target.value.trim();
                  if (raw === "") {
                    setUsdUahRate(fabricGlobals.usdUahRate);
                    return;
                  }
                  const n = Number(raw.replace(",", "."));
                  if (Number.isFinite(n) && n > 0) setUsdUahRate(n);
                }}
                hint="З Ціноутворення · зміна оновить курс у компанії"
              />
            ) : (
              <input type="hidden" name="usdUahRate" value={usdUahRate} />
            )}
            <input type="hidden" name="rollWeightKg" value="" />
            <input type="hidden" name="metersPerRoll" value="" />
          </FormGroup>
          </div>

          <div
            className={
              showStep("Постачальник") || showStep("Доставка") || !wizard
                ? "space-y-4"
                : "hidden"
            }
          >
            {wizardMultiSuppliers ? (
              <>
                <input
                  type="hidden"
                  name="supplierCode"
                  value={supplierValue || defaults?.supplierCode || ""}
                />
                <input type="hidden" name="deliveryType" value={deliveryType} />
                <input type="hidden" name="fabricCargoUsdPerKg" value={fabricCargoUsdPerKg} />
                {fabricEachPricing ? (
                  <input type="hidden" name="purchasePrice" value={purchaseDisplay} />
                ) : (
                  <>
                    <input type="hidden" name="priceKgUsd" value={priceKgUsd} />
                    <input type="hidden" name="priceKgUsdVat" value="" />
                    <input
                      type="hidden"
                      name="priceKgUsdCargo"
                      value={derived.priceKgUsdCargo ?? ""}
                    />
                    <input type="hidden" name="priceMeterUahNoVat" value={priceMeterNoVat} />
                    <input type="hidden" name="priceMeterUahVat" value="" />
                    <input type="hidden" name="priceMeterUahCutVat" value={priceMeterCutVat} />
                    <input type="hidden" name="minWholesaleMeters" value={minWholesaleMeters} />
                    <input type="hidden" name="wholesaleNote" value={wholesaleNote} />
                    <input type="hidden" name="purchasePrice" value={purchaseDisplay} />
                  </>
                )}
                <input
                  type="hidden"
                  name="supplierOffersJson"
                  value={JSON.stringify(supplierDrafts)}
                />
                <MaterialSupplierDraftsEditor
                  offers={supplierDrafts}
                  onChange={setSupplierDrafts}
                  metersPerKg={metersPerKg ? Number(metersPerKg) : null}
                  unitsPerPack={unitsPerPack ? Number(unitsPerPack) : null}
                  unitsPerKg={unitsPerKg ? Number(unitsPerKg) : null}
                  unitMode={fabricUnitMode}
                  fabricGlobals={liveGlobals}
                  knownSuppliers={knownSuppliers}
                  defaultDeliveryType={deliveryType}
                  onEditingChange={setSupplierDraftEditing}
                  pricingKind={supplierPricingKind}
                  usdUahRate={usdUahRate}
                  allowPackQuote={unitLikeMaterial}
                  /* Курс у «Параметри» — без дубля в тарифах доставки */
                />
              </>
            ) : managePricingSeparately ? (
              <>
                {/* Delivery type/rates live only in MaterialSuppliersEditor below — no duplicate UI. */}
                <input type="hidden" name="supplierCode" value={defaults?.supplierCode ?? ""} />
                <input type="hidden" name="deliveryType" value={deliveryType} />
                <input type="hidden" name="fabricCargoUsdPerKg" value={fabricCargoUsdPerKg} />
              </>
            ) : (
              <FormGroup
                label={wizard ? undefined : "Постачальник і доставка"}
                icon={wizard ? undefined : <IconPurchaseKg size={14} />}
                columns={2}
                compact
              >
                <div className="space-y-2 sm:col-span-2">
                  <Select
                    label="Постачальник"
                    required={pricingInline}
                    value={supplierSelect}
                    onChange={(event) => setSupplierSelect(event.target.value)}
                  >
                    <option value="">Оберіть…</option>
                    {knownSuppliers.map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                    <option value={SUPPLIER_OTHER}>Додати нового…</option>
                  </Select>
                  <input type="hidden" name="supplierCode" value={supplierValue} />
                  {supplierSelect === SUPPLIER_OTHER ? (
                    <Input
                      label="Назва постачальника"
                      required
                      value={supplierOther}
                      onChange={(event) => setSupplierOther(event.target.value)}
                      placeholder="Наприклад Зейджан"
                    />
                  ) : null}
                </div>
                <Select
                  name="deliveryType"
                  label="Тип доставки"
                  required
                  value={deliveryType}
                  onChange={(event) =>
                    applyDeliveryType(normalizeFabricDeliveryType(event.target.value))
                  }
                >
                  {FABRIC_DELIVERY_TYPES.map((code) => (
                    <option key={code} value={code}>
                      {fabricDeliveryTypeLabel(code)}
                    </option>
                  ))}
                </Select>
                <Input
                  name="fabricCargoUsdPerKg"
                  label="Тариф"
                  type="number"
                  step="0.01"
                  min="0"
                  suffix={deliveryRateUnitLabel(deliveryType, "fabric")}
                  value={fabricCargoUsdPerKg}
                  onChange={(event) => {
                    const value = event.target.value;
                    setFabricCargoUsdPerKg(value);
                    if (pricingInline) {
                      recalcMeterPrices({ fabricCargoUsdPerKg: value });
                    }
                  }}
                />
              </FormGroup>
            )}
          </div>

          <div
            className={
              showStep("Ціни") || showStep("Ціна") || (!wizard && pricingInline)
                ? "space-y-4"
                : "hidden"
            }
          >
          {pricingInline && !wizardMultiSuppliers ? (
            <>
              {fabricUnitMode === "kg" || fabricUnitMode === "m" ? (
                <FormGroup
                  label="Ціна"
                  icon={<IconPurchaseKg size={14} />}
                  columns={2}
                  compact
                >
                  <Input
                    name="priceKgUsd"
                    label="Прайс постачальника"
                    type="number"
                    step="0.01"
                    min="0"
                    suffix="$/кг"
                    required={fabricUnitMode === "kg"}
                    optional={fabricUnitMode === "m"}
                    value={priceKgUsd}
                    onChange={(event) => {
                      const value = event.target.value;
                      setPriceKgUsd(value);
                      setPriceKgUsdVat("");
                      setPriceMeterVat("");
                      recalcMeterPrices({ priceKgUsd: value, priceKgUsdVat: "" });
                    }}
                  />
                  <Input
                    label="З доставкою"
                    value={derived.priceKgUsdCargo ?? ""}
                    suffix="$/кг"
                    readOnly
                    tabIndex={-1}
                  />
                  <input type="hidden" name="priceKgUsdCargo" value={derived.priceKgUsdCargo ?? ""} />
                  <input type="hidden" name="priceKgUsdVat" value="" />
                </FormGroup>
              ) : null}

              {fabricUnitMode === "m2" ? (
                <FormGroup
                  label="Ціна"
                  icon={<IconPurchaseKg size={14} />}
                  columns={2}
                  compact
                >
                  <Input
                    label="Прайс"
                    type="number"
                    step="0.1"
                    min="0"
                    suffix="₴/м²"
                    required
                    value={priceM2NoVat}
                    onChange={(event) => {
                      setPriceM2Vat("");
                      setPriceMeterVat("");
                      applyM2Prices({ priceM2NoVat: event.target.value, priceM2Vat: "" });
                    }}
                  />
                  <input type="hidden" name="priceKgUsd" value={priceKgUsd} />
                  <input type="hidden" name="priceKgUsdVat" value="" />
                  <input type="hidden" name="priceKgUsdCargo" value={derived.priceKgUsdCargo ?? ""} />
                </FormGroup>
              ) : null}

              <FormGroup
                label={wizard ? undefined : "Собівартість"}
                icon={wizard ? undefined : <IconMeterPrice size={14} />}
                columns={2}
                compact
              >
                <PurchaseModeRow>
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
                        setMinWholesaleMeters("");
                        setPriceMeterCutVat("");
                      }
                    }}
                  />
                </PurchaseModeRow>
                <Input
                  name="priceMeterUahNoVat"
                  label="Ціна"
                  type="number"
                  step="0.1"
                  min="0"
                  suffix={`₴/${qtyUnit}`}
                  required={fabricUnitMode === "m" || fabricUnitMode === "m2"}
                  value={priceMeterNoVat}
                  readOnly={fabricUnitMode === "kg" || fabricUnitMode === "m2"}
                  tabIndex={fabricUnitMode === "kg" || fabricUnitMode === "m2" ? -1 : undefined}
                  onChange={
                    fabricUnitMode === "kg" || fabricUnitMode === "m2"
                      ? undefined
                      : (event) => {
                          setPriceMeterNoVat(event.target.value);
                          setPriceMeterVat("");
                        }
                  }
                />
                <input type="hidden" name="priceMeterUahVat" value="" />
                {tierMode === "tier" ? (
                  <>
                    <Input
                      name="minWholesaleMeters"
                      label="Межа роздробу"
                      type="number"
                      step="0.1"
                      min="0"
                      suffix={qtyUnit}
                      optional
                      value={minWholesaleMeters}
                      onChange={(event) => {
                        const value = event.target.value;
                        setMinWholesaleMeters(value);
                        if (value.trim() === "" || Number(value) <= 0) {
                          setPriceMeterCutVat("");
                        }
                      }}
                      hint={`Якщо витрата < межі — ціна роздробу (${qtyUnit})`}
                    />
                    <Input
                      name="priceMeterUahCutVat"
                      label="Ціна роздробу"
                      type="number"
                      step="0.1"
                      min="0"
                      suffix={`₴/${qtyUnit}`}
                      optional
                      disabled={
                        minWholesaleMeters.trim() === "" || Number(minWholesaleMeters) <= 0
                      }
                      value={priceMeterCutVat}
                      onChange={(event) => setPriceMeterCutVat(event.target.value)}
                      hint={
                        minWholesaleMeters.trim() === "" || Number(minWholesaleMeters) <= 0
                          ? "Спочатку вкажіть межу роздробу"
                          : undefined
                      }
                    />
                  </>
                ) : (
                  <>
                    <input type="hidden" name="minWholesaleMeters" value="" />
                    <input type="hidden" name="priceMeterUahCutVat" value="" />
                  </>
                )}
                <Input
                  name="wholesaleNote"
                  label="Примітка"
                  optional
                  value={wholesaleNote}
                  onChange={(event) => setWholesaleNote(event.target.value)}
                  className="sm:col-span-2"
                />
                {derived.purchasePrice > 0 ? (
                  <p className="type-caption sm:col-span-2 tabular">
                    Активна собівартість з цих умов: {formatMoneyUah(derived.purchasePrice)}/{qtyUnit}
                    {derived.pricingMode === "cut" ? " (роздріб)" : ""}
                    {tierMode === "tier" &&
                    minWholesaleMeters.trim() !== "" &&
                    Number(minWholesaleMeters) > 0
                      ? priceMeterCutVat.trim() !== "" && Number(priceMeterCutVat) > 0
                        ? ` · < ${minWholesaleMeters} ${qtyUnit} → роздріб`
                        : ` · роздріб до ${minWholesaleMeters} ${qtyUnit}`
                      : " · ціна"}
                  </p>
                ) : null}
              </FormGroup>
            </>
          ) : null}
          </div>

          <div className={showStep("Готово") || !wizard ? "space-y-4" : "hidden"}>
          {wizard ? (
            <div className="rounded-[var(--radius-control)] border border-[var(--color-border)] bg-[var(--color-surface-subtle)] px-3 py-2.5 text-[13px]">
              <p className="font-medium text-[var(--color-text-primary)]">{nameUk || "Без назви"}</p>
              <p className="type-caption mt-0.5">
                {selectedUnit?.label ?? "—"}
                {supplierDrafts.length > 0
                  ? ` · ${supplierDrafts.length} пост.`
                  : supplierValue
                    ? ` · ${supplierValue}`
                    : ""}
                {` · ${fabricDeliveryTypeLabel(deliveryType)}`}
                {derived.purchasePrice > 0
                  ? ` · ${formatMoneyUah(derived.purchasePrice)}/${qtyUnit}`
                  : ""}
              </p>
            </div>
          ) : null}

          {wizard ? (
            <input type="hidden" name="costVatOverride" value={costOverride} />
          ) : (
            <FormGroup
              label="ПДВ у калькуляції"
              icon={<IconCalc size={14} />}
              columns={1}
              compact
            >
              <Select
                name="costVatOverride"
                label="Яку ціну брати в собівартість"
                optional
                value={costOverride}
                onChange={(event) => setCostOverride(event.target.value)}
              >
                <option value="">{`Як у налаштуваннях (${policyLabel})`}</option>
                <option value="NET">Завжди без ПДВ</option>
                <option value="GROSS">Завжди з ПДВ</option>
              </Select>
            </FormGroup>
          )}
          {!wizard ? (
            <input
              type="hidden"
              name="colorOrAttribute"
              value={defaults?.colorOrAttribute ?? ""}
            />
          ) : null}
          </div>
        </>
      ) : (
        <div
          className={
            showStep("Постачальник") || showStep("Ціна") || showStep("Готово") || !wizard
              ? "space-y-4"
              : "hidden"
          }
        >
          {wizardMultiSuppliers ? (
            <>
              <input
                type="hidden"
                name="supplierCode"
                value={supplierValue || defaults?.supplierCode || ""}
              />
              <input type="hidden" name="purchasePrice" value={purchaseDisplay} />
              <input
                type="hidden"
                name="supplierOffersJson"
                value={JSON.stringify(supplierDrafts)}
              />
              <MaterialSupplierDraftsEditor
                offers={supplierDrafts}
                onChange={setSupplierDrafts}
                metersPerKg={null}
                unitsPerPack={unitsPerPack ? Number(unitsPerPack) : null}
                unitsPerKg={unitsPerKg ? Number(unitsPerKg) : null}
                unitMode={fabricUnitMode}
                fabricGlobals={liveGlobals}
                knownSuppliers={knownSuppliers}
                defaultDeliveryType={deliveryType}
                onEditingChange={setSupplierDraftEditing}
                pricingKind="unit"
                usdUahRate={usdUahRate}
                onUsdUahRateChange={setUsdUahRate}
                allowPackQuote
              />
              {!wizard ? (
                <Input
                  name="colorOrAttribute"
                  label="Колір / характеристика"
                  optional
                  defaultValue={defaults?.colorOrAttribute}
                />
              ) : null}
            </>
          ) : managePricingSeparately ? (
            <FormGroup
              label={wizard ? undefined : "Характеристика"}
              icon={wizard ? undefined : <IconSpec size={14} />}
              columns={2}
              compact
            >
              <input type="hidden" name="supplierCode" value={defaults?.supplierCode ?? ""} />
              <Input
                name="colorOrAttribute"
                label="Колір / характеристика"
                optional
                defaultValue={defaults?.colorOrAttribute}
              />
            </FormGroup>
          ) : (
            <FormGroup
              label={wizard ? undefined : "Постачальник"}
              icon={wizard ? undefined : <IconClients size={14} />}
              columns={2}
              compact
            >
              <div className="space-y-2 sm:col-span-2">
                <Select
                  label="Постачальник"
                  optional
                  value={supplierSelect}
                  onChange={(event) => setSupplierSelect(event.target.value)}
                >
                  <option value="">Оберіть…</option>
                  {knownSuppliers.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                  <option value={SUPPLIER_OTHER}>Додати нового…</option>
                </Select>
                <input type="hidden" name="supplierCode" value={supplierValue} />
                {supplierSelect === SUPPLIER_OTHER ? (
                  <Input
                    label="Назва постачальника"
                    required
                    value={supplierOther}
                    onChange={(event) => setSupplierOther(event.target.value)}
                    placeholder="Наприклад Зейджан"
                  />
                ) : null}
              </div>
              <Input
                name="colorOrAttribute"
                label="Колір / характеристика"
                optional
                defaultValue={defaults?.colorOrAttribute}
              />
            </FormGroup>
          )}
        </div>
      )}

      <div
        className={
          showStep("Готово") ||
          !wizard ||
          (type !== "FABRIC" && showStep("Основне"))
            ? "space-y-4"
            : "hidden"
        }
      >
        <FormGroup
          label={wizard ? undefined : "Примітка"}
          icon={wizard ? undefined : <IconNote size={14} />}
          columns={1}
          compact
        >
        <Input
          name="note"
          label="Коментар"
          optional
          placeholder="Умови постачання"
          value={note}
          onChange={(event) => setNote(event.target.value)}
        />
        <MaterialReferenceLinks
          value={referenceUrls}
          onChange={(next) => {
            setReferenceUrls(next);
            markDirty();
          }}
        />
      </FormGroup>
      </div>
    </div>
  );
}

export function MaterialCreatePanel({
  units,
  suppliers = [],
  variant = "primary",
  size = "md",
  triggerLabel = "Новий матеріал",
  fabricGlobals = DEFAULT_FABRIC_PRICING_GLOBALS,
  onCreated,
}: {
  units: UnitOption[];
  suppliers?: string[];
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  triggerLabel?: string;
  fabricGlobals?: FabricPricingGlobals;
  onCreated?: (result: Record<string, unknown>) => void;
}) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [wizardMeta, setWizardMeta] = useState<MaterialWizardMeta | null>(null);
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  function requestClose() {
    if (pending) return;
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    setOpen(false);
    setWizardMeta(null);
    setDirty(false);
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await createMaterialAction(formData);
      if (!result.ok) {
        setError("Заповніть обовʼязкові поля (*) і спробуйте ще.");
        return;
      }
      setOpen(false);
      setWizardMeta(null);
      setDirty(false);
      onCreated?.(result);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant={variant}
        size={size}
        onClick={() => {
          setWizardMeta(null);
          setError(null);
          setDirty(false);
          setOpen(true);
        }}
      >
        {triggerLabel}
      </Button>
      <SidePanel
        open={open}
        onClose={requestClose}
        title="Новий матеріал"
        description="Крок за кроком · * обовʼязкові поля"
        width="lg"
        footer={
          <>
            {wizardMeta && !wizardMeta.isFirst ? (
              <Button
                type="button"
                variant="ghost"
                disabled={pending}
                onClick={() => wizardMeta.goBack()}
              >
                ← Назад
              </Button>
            ) : (
              <Button type="button" variant="ghost" disabled={pending} onClick={requestClose}>
                Скасувати
              </Button>
            )}
            {wizardMeta && !wizardMeta.isLast ? (
              <Button
                type="button"
                disabled={pending || !wizardMeta.canNext}
                onClick={() => wizardMeta.goNext()}
              >
                Далі →
              </Button>
            ) : (
              <Button type="submit" form={formId} loading={pending} disabled={pending}>
                {pending ? "Збереження…" : "Додати матеріал"}
              </Button>
            )}
          </>
        }
      >
        <form
          key={open ? "open" : "closed"}
          id={formId}
          action={submit}
          className="space-y-4"
          onSubmit={(event) => {
            if (wizardMeta && !wizardMeta.isLast) {
              event.preventDefault();
              wizardMeta.goNext();
            }
          }}
        >
          {error ? <Banner tone="danger">{error}</Banner> : null}
          <MaterialFields
            units={units}
            fabricGlobals={fabricGlobals}
            suppliers={suppliers}
            wizard
            onWizardMeta={setWizardMeta}
            onDirtyChange={setDirty}
          />
        </form>
      </SidePanel>
      <UnsavedChangesDialog
        open={leaveOpen}
        pending={pending}
        onStay={() => setLeaveOpen(false)}
        onDiscard={() => {
          setLeaveOpen(false);
          setOpen(false);
          setWizardMeta(null);
          setDirty(false);
        }}
      />
    </>
  );
}

export function MaterialEditPanel({
  material,
  units,
  suppliers = [],
  fabricGlobals = DEFAULT_FABRIC_PRICING_GLOBALS,
  trigger,
}: {
  material: MaterialFormDefaults;
  units: UnitOption[];
  suppliers?: string[];
  fabricGlobals?: FabricPricingGlobals;
  /** Custom open control (e.g. clickable name). Default: «Змінити» button. */
  trigger?: (api: { open: () => void }) => ReactNode;
}) {
  const router = useRouter();
  const formId = useId();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<MaterialFormDefaults | null>(null);
  const [globals, setGlobals] = useState(fabricGlobals);
  const [tab, setTab] = useState<"main" | "suppliers">("main");
  const [dirty, setDirty] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  async function openEditor() {
    setOpen(true);
    setError(null);
    setDirty(false);
    setLoading(true);
    setLoaded(null);
    setTab("main");
    try {
      const result = await getMaterialForEditAction(material.id);
      if (!result.ok || !("material" in result)) {
        setError("Не вдалося завантажити матеріал з бази.");
        return;
      }
      setLoaded(result.material);
      setGlobals(result.fabricGlobals);
    } catch {
      setError("Не вдалося завантажити матеріал з бази.");
    } finally {
      setLoading(false);
    }
  }

  function requestClose() {
    if (pending || loading) return;
    if (dirty) {
      setLeaveOpen(true);
      return;
    }
    setOpen(false);
    setDirty(false);
  }

  function submit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await updateMaterialAction(formData);
      if (!result.ok) {
        setError("Перевірте обовʼязкові поля — запис не збережено.");
        return;
      }
      setOpen(false);
      setDirty(false);
      router.refresh();
    });
  }

  const tabItems = [
    { key: "main" as const, label: "Основне", icon: <IconFormTitle size={14} /> },
    {
      key: "suppliers" as const,
      label: "Постачальники",
      icon: <IconClients size={14} />,
    },
  ];

  const loadedUnit = units.find((u) => u.id === loaded?.unitOfMeasureId);
  const loadedUnitMode = resolveFabricUnitMode(resolveUnitCode(loadedUnit));

  return (
    <>
      {trigger ? (
        trigger({ open: () => void openEditor() })
      ) : (
        <Button variant="secondary" size="sm" onClick={() => void openEditor()}>
          Змінити
        </Button>
      )}

      <SidePanel
        open={open}
        onClose={requestClose}
        title="Змінити матеріал"
        width="lg"
        footer={
          <>
            {loaded ? (
              <span className="mr-auto">
                <MaterialDuplicateIconButton
                  materialId={loaded.id}
                  materialName={loaded.nameUk}
                  appearance="button"
                  disabled={pending || loading}
                  onDuplicated={() => {
                    setDirty(false);
                    setOpen(false);
                  }}
                />
              </span>
            ) : null}
            <Button variant="ghost" onClick={requestClose} disabled={pending || loading}>
              Скасувати
            </Button>
            <Button type="submit" form={formId} loading={pending} disabled={pending || loading || !loaded}>
              {pending ? "Збереження…" : "Зберегти"}
            </Button>
          </>
        }
      >
        <form id={formId} action={submit} className="space-y-4">
          {error ? <Banner tone="danger">{error}</Banner> : null}
          {loading || !loaded ? (
            <SidePanelSkeleton sections={4} />
          ) : (
            <>
              {loaded.updatedAt ? (
                <p className="type-caption">
                  Останнє редагування:{" "}
                  <span className="tabular text-[var(--color-text-secondary)]">
                    {new Date(loaded.updatedAt).toLocaleString("uk-UA", {
                      day: "2-digit",
                      month: "2-digit",
                      year: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </p>
              ) : null}
              <PanelTabs
                items={tabItems}
                active={tab}
                onChange={(key) => setTab(key as "main" | "suppliers")}
              />

              <div className={tab === "main" ? "space-y-4" : "hidden"} role="tabpanel">
                <MaterialFields
                  key={`${loaded.id}-${loaded.densityGsm}-${loaded.metersPerKg}-${loaded.purchasePrice}`}
                  units={units}
                  defaults={loaded}
                  fabricGlobals={globals}
                  suppliers={suppliers}
                  managePricingSeparately
                  onDirtyChange={setDirty}
                />
              </div>

              <div className={tab === "suppliers" ? "space-y-4" : "hidden"} role="tabpanel">
                <MaterialSuppliersEditor
                  materialId={loaded.id}
                  metersPerKg={loaded.metersPerKg}
                  unitsPerPack={loaded.unitsPerPack ?? null}
                  unitsPerKg={loaded.unitsPerKg ?? null}
                  unitMode={loadedUnitMode}
                  fabricGlobals={globals}
                  pricingKind={
                    loaded.type === "FABRIC" &&
                    loadedUnitMode !== "pcs" &&
                    loadedUnitMode !== "cone"
                      ? "fabric"
                      : "unit"
                  }
                  allowPackQuote={
                    loaded.type !== "FABRIC" ||
                    loadedUnitMode === "pcs" ||
                    loadedUnitMode === "cone"
                  }
                  embedded
                  onPrimaryChanged={() => {
                    void (async () => {
                      const result = await getMaterialForEditAction(loaded.id);
                      if (result.ok && "material" in result) {
                        setLoaded(result.material);
                        setGlobals(result.fabricGlobals);
                      }
                      router.refresh();
                    })();
                  }}
                />
              </div>
            </>
          )}
        </form>
      </SidePanel>
      <UnsavedChangesDialog
        open={leaveOpen}
        pending={pending}
        onStay={() => setLeaveOpen(false)}
        onDiscard={() => {
          setLeaveOpen(false);
          setOpen(false);
          setDirty(false);
        }}
      />
    </>
  );
}

