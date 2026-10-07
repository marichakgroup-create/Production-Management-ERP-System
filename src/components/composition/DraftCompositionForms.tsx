"use client";

import { useEffect, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select, FormGroup } from "@/components/ui/Field";
import { IconPlus } from "@/components/ui/Icons";
import { MaterialPricingToggles } from "@/components/composition/PricingToggles";
import {
  type DraftDecorationRow,
  type DraftMaterialRow,
  type DraftOperationRow,
} from "@/components/orders/ProductCatalogPanel";
import {
  catalogOptionHasPricingControls,
  draftKey,
  pricingFieldsFromCatalogOption,
  resolveDraftMaterialPrice,
} from "@/lib/draft-composition";
import type { MaterialCostVatMode } from "@/lib/fabric-pricing";
import { materialOptionDescription } from "@/lib/material-catalog-options";
import { defaultSupplierId } from "@/lib/supplier-colors";
import { formatMoneyUah } from "@/lib/utils";

export type MaterialCatalogOption = {
  id: string;
  label: string;
  name?: string;
  unit: string;
  price: number;
  defaultWaste: number;
  materialType?: string | null;
  composition?: string | null;
  densityGsm?: string | null;
  priceMeterUahNoVat?: number | null;
  priceMeterUahVat?: number | null;
  priceMeterUahCutVat?: number | null;
  metersPerRoll?: number | null;
  minWholesaleMeters?: number | null;
  costVatOverride?: "NET" | "GROSS" | null;
  availableColors?: string[];
  supplierOffers?: Array<{
    supplierId: string;
    supplierName: string;
    isPrimary?: boolean;
    availableColors: string[];
  }>;
  metersPerKg?: number | null;
  priceKgUsdCargo?: number | null;
  wholesaleNote?: string | null;
};

export type OperationCatalogOption = {
  id: string;
  label: string;
  method: string;
  unitRate: number | null;
  shiftCost: number | null;
  standardOutput: number | null;
  rateTiers?: Array<{ minQuantity: number; ratePerUnit: number }>;
};

export type DecorationCatalogOption = {
  id: string;
  label: string;
  setupCost: number;
  unitRate: number;
};

export function CompositionAddBar({
  children,
  createAction,
}: {
  children: ReactNode;
  createAction?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2 border-t border-[var(--color-divider)] bg-[var(--color-surface-subtle)] px-3 py-2.5">
      <div className="min-w-0 flex-1">{children}</div>
      {createAction ? <div className="shrink-0 pb-0.5">{createAction}</div> : null}
    </div>
  );
}

export function DraftAddMaterialForm({
  options,
  onAdd,
  compact = false,
  companyCostMode = "NET",
  enablePricingControls = false,
  quantitiesBySize,
}: {
  options: MaterialCatalogOption[];
  onAdd: (row: DraftMaterialRow) => void;
  compact?: boolean;
  companyCostMode?: MaterialCostVatMode;
  /** Order draft: ПДВ / гурт·відріз before adding from catalog rail. */
  enablePricingControls?: boolean;
  quantitiesBySize?: Record<string, number>;
}) {
  const [materialId, setMaterialId] = useState("");
  const [consumption, setConsumption] = useState("1");
  const [waste, setWaste] = useState("");
  const [costVatMode, setCostVatMode] = useState<MaterialCostVatMode>(companyCostMode);
  const [priceMode, setPriceMode] = useState<"auto" | "cut" | "wholesale">("auto");

  const selected = options.find((row) => row.id === materialId);
  const showPricing =
    enablePricingControls && selected != null && catalogOptionHasPricingControls(selected);
  const hasCut =
    selected?.priceMeterUahCutVat != null && selected.priceMeterUahCutVat > 0;

  useEffect(() => {
    if (!selected) return;
    setCostVatMode(selected.costVatOverride ?? companyCostMode);
    setPriceMode("auto");
  }, [materialId, selected, companyCostMode]);

  const pricePreview =
    showPricing && selected
      ? resolveDraftMaterialPrice(
          {
            key: "preview",
            materialId: selected.id,
            name: selected.name ?? selected.label,
            unit: selected.unit,
            consumption: Math.max(0, Number(consumption) || 0),
            waste: waste === "" ? selected.defaultWaste : Math.max(0, Number(waste) || 0),
            ...pricingFieldsFromCatalogOption(selected, companyCostMode),
            costVatMode,
            priceMode,
          },
          quantitiesBySize,
          companyCostMode,
        )
      : null;

  function submit() {
    const option = options.find((row) => row.id === materialId);
    if (!option) return;
    const consumptionPerUnit = Math.max(0, Number(consumption) || 0);
    if (consumptionPerUnit <= 0) return;
    const pricing = pricingFieldsFromCatalogOption(option, companyCostMode);
    const draft: DraftMaterialRow = {
      key: draftKey(),
      materialId: option.id,
      name: option.name ?? option.label,
      unit: option.unit,
      consumption: consumptionPerUnit,
      waste: waste === "" ? option.defaultWaste : Math.max(0, Number(waste) || 0),
      ...pricing,
      costVatMode: showPricing ? costVatMode : pricing.costVatMode,
      priceMode: showPricing ? priceMode : pricing.priceMode,
      availableColors: option.availableColors ?? [],
      supplierOffers: option.supplierOffers ?? [],
      supplierId: defaultSupplierId(option.supplierOffers ?? []) ?? null,
      metersPerKg: option.metersPerKg ?? null,
      wholesaleNote: option.wholesaleNote ?? null,
      fabricDeliveryManual: false,
      fabricDeliveryAmount: null,
      cargoUsdPerKg: null,
      usdUahRate: null,
    };
    const { purchasePrice } = resolveDraftMaterialPrice(draft, quantitiesBySize, companyCostMode);
    onAdd({ ...draft, price: purchasePrice });
    setMaterialId("");
    setConsumption("1");
    setWaste("");
    setCostVatMode(companyCostMode);
    setPriceMode("auto");
  }

  const pricingBlock =
    showPricing && pricePreview ? (
      <div className="space-y-1.5 rounded-[6px] border border-[var(--color-border)] bg-white px-2 py-2">
        <MaterialPricingToggles
          costVatMode={costVatMode}
          priceMode={priceMode}
          hasCut={hasCut}
          onCostVatMode={setCostVatMode}
          onPriceMode={setPriceMode}
        />
        <p className="text-[11px] tabular text-[var(--color-text-secondary)]">
          Закупівля: {formatMoneyUah(pricePreview.purchasePrice)} · {pricePreview.hint}
        </p>
      </div>
    ) : null;

  if (compact) {
    return (
      <div className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <Select
            size="sm"
            label="З каталогу"
            className="min-w-[160px] flex-1"
            searchable
            value={materialId}
            onChange={(event) => setMaterialId(event.target.value)}
          >
            <option value="">Оберіть матеріал…</option>
            {options.map((row) => (
              <option
                key={row.id}
                value={row.id}
                data-description={materialOptionDescription(
                  row.densityGsm,
                  row.composition,
                  row.supplierOffers?.map((offer) => offer.supplierName) ?? [],
                )}
              >
                {row.label}
              </option>
            ))}
          </Select>
          <label className="w-[88px]">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-tertiary)]">
              {selected ? `Норма, ${selected.unit}` : "Норма"}
            </span>
            <input
              type="number"
              min={0}
              step="0.0001"
              value={consumption}
              onChange={(event) => setConsumption(event.target.value)}
              title={
                selected
                  ? `Скільки ${selected.unit} іде на 1 виріб`
                  : "Оберіть матеріал — з’явиться одиниця виміру"
              }
              className="h-8 w-full rounded-[6px] border border-[var(--color-border)] bg-white px-1.5 text-right text-[12.5px] tabular outline-none focus:border-[var(--color-primary-500)]"
            />
          </label>
          <label className="w-[64px]">
            <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-tertiary)]">
              Відх. %
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={waste}
              placeholder="авто"
              onChange={(event) => setWaste(event.target.value)}
              className="h-8 w-full rounded-[6px] border border-[var(--color-border)] bg-white px-1.5 text-right text-[12.5px] tabular outline-none placeholder:text-[11px] focus:border-[var(--color-primary-500)]"
            />
          </label>
          <Button
            type="button"
            size="sm"
            disabled={!materialId}
            onClick={submit}
            className="inline-flex items-center gap-1"
          >
            <IconPlus size={14} />
            Додати
          </Button>
        </div>
        {pricingBlock}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <FormGroup label="Матеріал" columns={1}>
        <Select
          label="З каталогу"
          value={materialId}
          onChange={(event) => setMaterialId(event.target.value)}
        >
          <option value="">Оберіть…</option>
          {options.map((row) => (
            <option
              key={row.id}
              value={row.id}
              data-description={materialOptionDescription(
                row.densityGsm,
                row.composition,
                row.supplierOffers?.map((offer) => offer.supplierName) ?? [],
              )}
            >
              {row.label}
            </option>
          ))}
        </Select>
      </FormGroup>
      {pricingBlock}
      <FormGroup label="Норма витрати" columns={2}>
        <Input
          label={selected ? `Норма, ${selected.unit} / виріб` : "Норма на 1 виріб"}
          type="number"
          min={0}
          step="0.0001"
          value={consumption}
          onChange={(event) => setConsumption(event.target.value)}
          hint={selected ? undefined : "Спочатку оберіть матеріал"}
        />
        <Input
          label="Відходи %"
          type="number"
          min={0}
          step="0.01"
          value={waste}
          placeholder="З каталогу"
          onChange={(event) => setWaste(event.target.value)}
        />
      </FormGroup>
      <Button type="button" size="sm" className="w-full justify-center" onClick={submit} disabled={!materialId}>
        Додати матеріал
      </Button>
    </div>
  );
}

export function DraftAddOperationForm({
  options,
  onAdd,
  compact = false,
}: {
  options: OperationCatalogOption[];
  onAdd: (row: DraftOperationRow) => void;
  compact?: boolean;
}) {
  const [operationId, setOperationId] = useState("");

  function submit() {
    const option = options.find((row) => row.id === operationId);
    if (!option) return;
    onAdd({
      key: draftKey(),
      operationId: option.id,
      name: option.label,
      method: option.method,
      unitRate: option.unitRate,
      shiftCost: option.shiftCost,
      standardOutput: option.standardOutput,
      rateTiers: option.rateTiers,
    });
    setOperationId("");
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <Select
          size="sm"
          label="З каталогу"
          className="min-w-[180px] flex-1"
          value={operationId}
          onChange={(event) => setOperationId(event.target.value)}
        >
          <option value="">Оберіть операцію…</option>
          {options.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!operationId}
          onClick={submit}
          className="inline-flex items-center gap-1"
        >
          <IconPlus size={14} />
          Додати
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select
        label="Операція"
        value={operationId}
        onChange={(event) => setOperationId(event.target.value)}
      >
        <option value="">Оберіть…</option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
          </option>
        ))}
      </Select>
      <Button type="button" size="sm" className="w-full justify-center" onClick={submit} disabled={!operationId}>
        Додати операцію
      </Button>
    </div>
  );
}

export function DraftAddDecorationForm({
  options,
  onAdd,
  compact = false,
}: {
  options: DecorationCatalogOption[];
  onAdd: (row: DraftDecorationRow) => void;
  compact?: boolean;
}) {
  const [decorationId, setDecorationId] = useState("");

  function submit() {
    const option = options.find((row) => row.id === decorationId);
    if (!option) return;
    onAdd({
      key: draftKey(),
      decorationMethodId: option.id,
      name: option.label,
      setupCost: option.setupCost,
      unitRate: option.unitRate,
    });
    setDecorationId("");
  }

  if (compact) {
    return (
      <div className="flex flex-wrap items-end gap-2">
        <Select
          size="sm"
          label="З каталогу"
          className="min-w-[180px] flex-1"
          value={decorationId}
          onChange={(event) => setDecorationId(event.target.value)}
        >
          <option value="">Оберіть нанесення…</option>
          {options.map((row) => (
            <option key={row.id} value={row.id}>
              {row.label}
            </option>
          ))}
        </Select>
        <Button
          type="button"
          size="sm"
          disabled={!decorationId}
          onClick={submit}
          className="inline-flex items-center gap-1"
        >
          <IconPlus size={14} />
          Додати
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Select
        label="Нанесення"
        value={decorationId}
        onChange={(event) => setDecorationId(event.target.value)}
      >
        <option value="">Оберіть…</option>
        {options.map((row) => (
          <option key={row.id} value={row.id}>
            {row.label}
          </option>
        ))}
      </Select>
      <Button type="button" size="sm" className="w-full justify-center" onClick={submit} disabled={!decorationId}>
        Додати нанесення
      </Button>
    </div>
  );
}
