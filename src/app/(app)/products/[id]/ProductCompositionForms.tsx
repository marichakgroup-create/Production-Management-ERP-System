"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { FormGroup, Select } from "@/components/ui/Field";
import { CreatePanel } from "@/components/ui/CreatePanel";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { IconPlus } from "@/components/ui/Icons";
import { MaterialCreatePanel } from "@/app/(app)/settings/resources/MaterialCreateForm";
import { OperationCreatePanel } from "@/app/(app)/settings/operations/OperationCreateForm";
import { DecorationCreatePanel } from "@/app/(app)/settings/applications/DecorationCreateForm";
import {
  addProductDecorationAction,
  addProductMaterialAction,
  addProductOperationAction,
} from "@/server/domains/products/actions";
import { materialOptionDescription } from "@/lib/material-catalog-options";

type Option = {
  id: string;
  label: string;
  unit?: string;
  composition?: string | null;
  densityGsm?: string | null;
  supplierNames?: string[];
};
type UnitOption = { id: string; label: string };

function unitFromMaterialLabel(label: string): string | null {
  const match = label.match(/\(([^)]+)\)\s*$/);
  return match?.[1]?.trim() || null;
}

function resolveMaterialUnit(option: Option | undefined): string | null {
  if (!option) return null;
  return option.unit?.trim() || unitFromMaterialLabel(option.label);
}

function MissingRecordHint({ children }: { children: React.ReactNode }) {
  return (
    <Banner tone="info" title="Немає потрібного запису?">
      <p className="mb-2">Створіть його тут — повертатися до довідника не потрібно.</p>
      {children}
    </Banner>
  );
}

/** Shows whether the add targets the whole size grid or one size (from outer tabs). */
export function CompositionScopeHint({
  sizeIds = [],
  sizeLabel,
}: {
  sizeIds?: string[];
  sizeLabel?: string;
}) {
  const scoped = sizeIds.length > 0;
  return (
    <p
      className={
        scoped
          ? "rounded-[6px] bg-[var(--color-tint-sage)] px-2 py-1 text-[12px] font-medium text-[var(--color-primary-800)]"
          : "type-caption"
      }
    >
      {scoped
        ? `Лише розмір ${sizeLabel ?? "обраний"} · норма на 1 од. виробу`
        : "Для всієї розмірної сітки · норма на 1 од. виробу"}
    </p>
  );
}

export function ProductAddMaterialBar({
  productId,
  materials: initialMaterials,
  units,
  sizeIds = [],
  sizeLabel,
}: {
  productId: string;
  materials: Option[];
  units: UnitOption[];
  sizeIds?: string[];
  sizeLabel?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [materials, setMaterials] = useState(initialMaterials);
  const [materialId, setMaterialId] = useState("");
  const [consumption, setConsumption] = useState("1");
  const [waste, setWaste] = useState("");
  const [error, setError] = useState<string | null>(null);
  const selectedUnit = resolveMaterialUnit(materials.find((row) => row.id === materialId));

  useEffect(() => {
    setMaterials(initialMaterials);
  }, [initialMaterials]);

  function submit() {
    setError(null);
    if (!materialId) {
      setError("Оберіть матеріал з каталогу.");
      return;
    }
    const consumptionPerUnit = Math.max(0, Number(consumption) || 0);
    if (consumptionPerUnit <= 0) {
      setError("Вкажіть норму витрати на одиницю.");
      return;
    }

    const formData = new FormData();
    formData.set("productId", productId);
    formData.set("materialId", materialId);
    formData.set("consumptionPerUnit", String(consumptionPerUnit));
    if (waste.trim() !== "") formData.set("wastePercent", waste);
    for (const id of sizeIds) formData.append("sizeIds", id);

    startTransition(async () => {
      const result = await addProductMaterialAction(formData);
      if (!result.ok) {
        setError("Не вдалося додати матеріал. Перевірте поля.");
        return;
      }
      setMaterialId("");
      setConsumption("1");
      setWaste("");
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 border-t border-[var(--color-divider)] bg-[var(--color-surface-subtle)] px-3 py-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <CompositionScopeHint sizeIds={sizeIds} sizeLabel={sizeLabel} />
        <MaterialCreatePanel
          units={units}
          variant="ghost"
          size="sm"
          triggerLabel="Новий матеріал"
          onCreated={(result) => {
            const created = result.material as
              | { id: string; nameUk: string; unit?: string }
              | undefined;
            if (!created) return;
            const label = created.unit
              ? `${created.nameUk} (${created.unit})`
              : created.nameUk;
            setMaterials((prev) =>
              prev.some((row) => row.id === created.id)
                ? prev
                : [...prev, { id: created.id, label, unit: created.unit }],
            );
            setMaterialId(created.id);
            router.refresh();
          }}
        />
      </div>
      {error ? <p className="text-[12px] text-[var(--color-danger-text)]">{error}</p> : null}
      <div className="flex flex-wrap items-end gap-2">
        <Select
          size="sm"
          label="З каталогу"
          className="min-w-[180px] flex-1"
          searchable
          value={materialId}
          onChange={(event) => setMaterialId(event.target.value)}
        >
          <option value="">Оберіть матеріал…</option>
          {materials.map((material) => (
            <option
              key={material.id}
              value={material.id}
              data-description={materialOptionDescription(
                material.densityGsm,
                material.composition,
                material.supplierNames,
              )}
            >
              {material.label}
            </option>
          ))}
        </Select>
        <label className="w-[88px]">
          <span className="mb-1 block text-[11px] font-medium text-[var(--color-text-tertiary)]">
            {selectedUnit ? `Норма, ${selectedUnit}` : "Норма"}
          </span>
          <input
            type="number"
            min={0}
            step="0.0001"
            value={consumption}
            onChange={(event) => setConsumption(event.target.value)}
            title={
              selectedUnit
                ? `Скільки ${selectedUnit} іде на 1 виріб`
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
          disabled={pending || !materialId}
          onClick={submit}
          className="inline-flex items-center gap-1"
        >
          <IconPlus size={14} />
          {pending ? "…" : "Додати"}
        </Button>
      </div>
    </div>
  );
}

export function AddProductMaterialPanel({
  productId,
  materials: initialMaterials,
  units,
  sizeIds = [],
  sizeLabel,
}: {
  productId: string;
  materials: Option[];
  units: UnitOption[];
  sizeIds?: string[];
  sizeLabel?: string;
}) {
  const [materials, setMaterials] = useState(initialMaterials);
  const [materialId, setMaterialId] = useState("");
  const router = useRouter();
  const selectedUnit = resolveMaterialUnit(materials.find((row) => row.id === materialId));

  useEffect(() => {
    setMaterials(initialMaterials);
  }, [initialMaterials]);

  const scoped = sizeIds.length > 0;

  return (
    <CreatePanel
      title="Матеріал у комплектацію"
      description={
        scoped
          ? `Норма — у одиниці виміру матеріалу з каталогу, на 1 виріб. Лише розмір ${sizeLabel ?? "обраний"}.`
          : "Норма — у одиниці виміру матеріалу з каталогу (м, шт, кг…), на 1 виріб."
      }
      triggerLabel="Додати…"
      submitLabel="Додати до виробу"
      action={addProductMaterialAction}
      variant="ghost"
      size="sm"
    >
      <input type="hidden" name="productId" value={productId} />
      {sizeIds.map((id) => (
        <input key={id} type="hidden" name="sizeIds" value={id} />
      ))}
      <input type="hidden" name="materialId" value={materialId} />

      <div className="mb-3">
        <CompositionScopeHint sizeIds={sizeIds} sizeLabel={sizeLabel} />
      </div>

      <FormGroup label="Матеріал" columns={1}>
        <Select
          label="Позиція каталогу"
          required
          searchable
          value={materialId}
          onChange={(event) => setMaterialId(event.target.value)}
        >
          <option value="" disabled>
            Оберіть матеріал…
          </option>
          {materials.map((material) => (
            <option
              key={material.id}
              value={material.id}
              data-description={materialOptionDescription(
                material.densityGsm,
                material.composition,
                material.supplierNames,
              )}
            >
              {material.label}
            </option>
          ))}
        </Select>
      </FormGroup>

      <FormGroup label="Норма витрати" columns={2}>
        <Input
          name="consumptionPerUnit"
          label={selectedUnit ? `Норма, ${selectedUnit} / виріб` : "Норма на 1 виріб"}
          type="number"
          step="0.0001"
          min="0"
          required
          hint={selectedUnit ? undefined : "Спочатку оберіть позицію"}
        />
        <Input
          name="wastePercent"
          label="Відходи, %"
          type="number"
          step="0.01"
          min="0"
        />
      </FormGroup>

      <MissingRecordHint>
        <MaterialCreatePanel
          units={units}
          variant="secondary"
          triggerLabel="Створити матеріал"
          onCreated={(result) => {
            const created = result.material as
              | { id: string; nameUk: string; unit?: string }
              | undefined;
            if (!created) return;
            const label = created.unit
              ? `${created.nameUk} (${created.unit})`
              : created.nameUk;
            setMaterials((prev) =>
              prev.some((row) => row.id === created.id)
                ? prev
                : [...prev, { id: created.id, label, unit: created.unit }],
            );
            setMaterialId(created.id);
            router.refresh();
          }}
        />
      </MissingRecordHint>
    </CreatePanel>
  );
}

export function AddProductOperationPanel({
  productId,
  operations,
  sizeIds = [],
  sizeLabel,
}: {
  productId: string;
  operations: Option[];
  sizeIds?: string[];
  sizeLabel?: string;
}) {
  const scoped = sizeIds.length > 0;

  return (
    <CreatePanel
      title="Операція у комплектацію"
      description={
        scoped
          ? `Вартість з довідника. Операція лише для розміру ${sizeLabel ?? "обраного"}.`
          : "Вартість з довідника. Scope «Усі» — операція для всієї сітки."
      }
      triggerLabel="Додати операцію"
      submitLabel="Додати до виробу"
      action={addProductOperationAction}
      variant="secondary"
      size="sm"
    >
      <input type="hidden" name="productId" value={productId} />
      {sizeIds.map((id) => (
        <input key={id} type="hidden" name="sizeIds" value={id} />
      ))}

      <div className="mb-3">
        <CompositionScopeHint sizeIds={sizeIds} sizeLabel={sizeLabel} />
      </div>

      <FormGroup label="Операція" columns={1}>
        <Select name="operationId" label="Позиція довідника" required searchable defaultValue="">
          <option value="" disabled>
            Оберіть операцію…
          </option>
          {operations.map((operation) => (
            <option key={operation.id} value={operation.id}>
              {operation.label}
            </option>
          ))}
        </Select>
      </FormGroup>

      <MissingRecordHint>
        <OperationCreatePanel triggerLabel="Створити операцію" />
      </MissingRecordHint>
    </CreatePanel>
  );
}

export function AddProductDecorationPanel({
  productId,
  decorations,
}: {
  productId: string;
  decorations: Option[];
}) {
  return (
    <CreatePanel
      title="Нанесення у комплектацію"
      description="Приладка враховується один раз на партію, тариф — на кожну одиницю."
      triggerLabel="Додати нанесення"
      submitLabel="Додати до виробу"
      action={addProductDecorationAction}
      variant="secondary"
      size="sm"
    >
      <input type="hidden" name="productId" value={productId} />

      <FormGroup label="Метод нанесення" columns={1}>
        <Select name="decorationMethodId" label="Позиція довідника" required searchable defaultValue="">
          <option value="" disabled>
            Оберіть метод…
          </option>
          {decorations.map((decoration) => (
            <option key={decoration.id} value={decoration.id}>
              {decoration.label}
            </option>
          ))}
        </Select>
      </FormGroup>

      <MissingRecordHint>
        <DecorationCreatePanel triggerLabel="Створити метод" />
      </MissingRecordHint>
    </CreatePanel>
  );
}
