"use client";

import { useEffect, useId, useState } from "react";
import { cn } from "@/lib/utils";
import { IconPlus } from "@/components/ui/Icons";
import {
  mergeColorLists,
  normalizeColorLabel,
  swatchForColorLabel,
  TRIM_COLOR_SWATCHES,
} from "@/lib/trim-colors";

export type SpecColorOption = {
  id: string;
  label: string;
  swatch: string;
  bordered?: boolean;
};

const CUSTOM_COLORS_KEY = "erp-spec-custom-colors";

function labelsMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

function slugifyColorLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9\u0400-\u04FF-]/gi, "");
}

function loadCustomColors(): SpecColorOption[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CUSTOM_COLORS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as SpecColorOption[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveCustomColors(colors: SpecColorOption[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(colors));
}

function toOption(label: string): SpecColorOption {
  const swatch = swatchForColorLabel(label);
  return {
    id: label.toLowerCase(),
    label: swatch.label,
    swatch: swatch.swatch,
    bordered: swatch.bordered,
  };
}

/** Common presets when catalog palette is empty. */
export const DEFAULT_SPEC_COLORS: SpecColorOption[] = TRIM_COLOR_SWATCHES.map((row) => ({
  id: row.label.toLowerCase(),
  label: row.label,
  swatch: row.swatch,
  bordered: row.bordered,
}));

export function SpecColorPicker({
  value,
  onChange,
  hint,
  /** Colors from Material.availableColors — source of truth for this SKU. */
  materialColors,
  /** Persist add/remove on the material / draft row palette. */
  onMaterialColorsChange,
  /** Tighter swatches for side panels / supplier blocks. */
  compact = false,
}: {
  value: string | null | undefined;
  onChange: (next: string | null) => void;
  hint?: string;
  materialColors?: string[] | null;
  onMaterialColorsChange?: (next: string[]) => void;
  compact?: boolean;
}) {
  const formId = useId();
  const [customColors, setCustomColors] = useState<SpecColorOption[]>([]);
  const [adding, setAdding] = useState(false);
  const [newLabel, setNewLabel] = useState("");
  const [newSwatch, setNewSwatch] = useState("#4B5563");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCustomColors(loadCustomColors());
  }, []);

  const managed = Boolean(onMaterialColorsChange);
  const catalogLabels = materialColors ?? [];
  const restrictToCatalog = catalogLabels.length > 0;
  const presetLabels = restrictToCatalog
    ? catalogLabels
    : DEFAULT_SPEC_COLORS.slice(0, 8).map((color) => color.label);
  const paletteLabels = restrictToCatalog
    ? mergeColorLists(presetLabels)
    : mergeColorLists(
        presetLabels,
        customColors.map((color) => color.label),
      );
  const palette = paletteLabels.map(toOption);
  const selected = value?.trim() || null;

  function selectColor(label: string) {
    onChange(normalizeColorLabel(label) ?? label);
    setAdding(false);
    setError(null);
  }

  function clearColor() {
    onChange(null);
    setAdding(false);
    setError(null);
  }

  function removeFromPalette(label: string) {
    if (!onMaterialColorsChange) return;
    const next = catalogLabels.filter((row) => !labelsMatch(row, label));
    onMaterialColorsChange(next);
    setCustomColors((prev) => {
      const nextCustom = prev.filter((color) => !labelsMatch(color.label, label));
      saveCustomColors(nextCustom);
      return nextCustom;
    });
    if (selected && labelsMatch(selected, label)) onChange(null);
  }

  function addCustomColor() {
    const label = normalizeColorLabel(newLabel);
    if (!label) {
      setError("Вкажіть назву кольору");
      return;
    }
    if (palette.some((color) => labelsMatch(color.label, label))) {
      selectColor(label);
      setNewLabel("");
      setAdding(false);
      return;
    }
    const option: SpecColorOption = {
      id: `custom-${slugifyColorLabel(label) || Date.now()}`,
      label,
      swatch: newSwatch || "#4B5563",
      bordered: isLightCssColor(newSwatch),
    };
    const nextCustom = [...customColors, option];
    setCustomColors(nextCustom);
    saveCustomColors(nextCustom);
    if (onMaterialColorsChange) {
      onMaterialColorsChange(mergeColorLists(catalogLabels, [label]));
    }
    onChange(label);
    setNewLabel("");
    setNewSwatch("#4B5563");
    setAdding(false);
    setError(null);
  }

  return (
    <div className={cn("space-y-2", !compact && "space-y-3")}>
      {hint ? <p className="type-caption">{hint}</p> : null}

      <div className={cn("flex flex-wrap", compact ? "gap-x-2 gap-y-2" : "gap-x-3 gap-y-3")}>
        {palette.map((color) => {
          const active = selected ? labelsMatch(color.label, selected) : false;
          const isCatalog = catalogLabels.some((row) => labelsMatch(row, color.label));
          return (
            <div
              key={color.id}
              className={cn(
                "relative flex flex-col items-center text-center",
                compact ? "w-[3.25rem] gap-1" : "w-[4.25rem] gap-1.5",
              )}
            >
              <button
                type="button"
                onClick={() => selectColor(color.label)}
                className="group flex w-full flex-col items-center gap-1"
                title={color.label}
              >
                <span
                  className={cn(
                    "relative flex items-center justify-center rounded-full transition-transform duration-150 group-hover:scale-[1.04]",
                    compact ? "size-7" : "size-10",
                    active
                      ? "ring-2 ring-[var(--color-primary-600)] ring-offset-1 ring-offset-[var(--color-surface)]"
                      : "ring-1 ring-black/5",
                    color.bordered && "border border-[var(--color-border-strong)]",
                  )}
                  style={{ backgroundColor: color.swatch }}
                  aria-hidden
                >
                  {active ? (
                    <span
                      className={cn(
                        "absolute inset-0 m-auto rounded-full",
                        compact ? "size-1.5" : "size-2",
                        isLightCssColor(color.swatch)
                          ? "bg-[var(--color-text-primary)]"
                          : "bg-white",
                      )}
                    />
                  ) : null}
                </span>
                <span
                  className={cn(
                    "max-w-full truncate font-medium leading-tight",
                    compact ? "text-[10px]" : "text-[11px]",
                    active
                      ? "text-[var(--color-text-primary)]"
                      : "text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]",
                  )}
                >
                  {color.label}
                </span>
              </button>
              {managed && isCatalog && palette.length > 1 ? (
                <button
                  type="button"
                  aria-label={`Прибрати ${color.label} з палітри`}
                  onClick={() => removeFromPalette(color.label)}
                  className="absolute -right-0.5 -top-0.5 flex size-4 items-center justify-center rounded-full bg-[var(--color-surface)] text-[10px] text-[var(--color-text-tertiary)] opacity-0 shadow ring-1 ring-[var(--color-border)] transition-opacity hover:text-[var(--color-danger-text)] group-hover:opacity-100"
                >
                  ×
                </button>
              ) : null}
            </div>
          );
        })}

        {!restrictToCatalog && (managed || !compact) ? (
          <button
            type="button"
            onClick={() => {
              setAdding((open) => !open);
              setError(null);
            }}
            className={cn(
              "group flex flex-col items-center text-center",
              compact ? "w-[3.25rem] gap-1" : "w-[4.25rem] gap-1.5",
            )}
            title="Додати колір"
          >
            <span
              className={cn(
                "flex items-center justify-center rounded-full border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface-subtle)] text-[var(--color-text-secondary)] transition-colors group-hover:border-[var(--color-primary-400)] group-hover:text-[var(--color-primary-700)]",
                compact ? "size-7" : "size-10",
                adding && "border-[var(--color-primary-500)] text-[var(--color-primary-700)]",
              )}
            >
              <IconPlus size={compact ? 14 : 16} />
            </span>
            <span
              className={cn(
                "font-medium text-[var(--color-text-secondary)] group-hover:text-[var(--color-text-primary)]",
                compact ? "text-[10px]" : "text-[11px]",
              )}
            >
              Інший
            </span>
          </button>
        ) : null}
      </div>

      {selected ? (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={clearColor}
            className="text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]"
          >
            Скинути
          </button>
        </div>
      ) : null}

      {adding ? (
        <div className="space-y-2.5 rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)]">
          <div className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1">
              <span className="type-caption">Зразок</span>
              <input
                type="color"
                value={newSwatch}
                onChange={(event) => setNewSwatch(event.target.value)}
                className="h-10 w-12 cursor-pointer rounded-[8px] border border-[var(--color-border)] bg-transparent p-0.5"
                aria-label="Зразок кольору"
              />
            </label>
            <label className="min-w-[10rem] flex-1 space-y-1">
              <span className="type-caption">Назва</span>
              <input
                id={`${formId}-label`}
                value={newLabel}
                onChange={(event) => setNewLabel(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addCustomColor();
                  }
                }}
                placeholder="напр. Graphite"
                className="h-10 w-full rounded-[var(--radius-control)] border border-[var(--color-border-strong)] bg-[var(--color-surface)] px-2.5 text-[13.5px] outline-none focus:border-[var(--color-primary-500)] focus:ring-2 focus:ring-[var(--color-focus-ring)]"
              />
            </label>
            <button type="button" onClick={addCustomColor} className="btn-primary h-10 px-3 text-[13px]">
              Додати
            </button>
          </div>
          {error ? <p className="text-[12.5px] text-[var(--color-danger-text)]">{error}</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function isLightCssColor(color: string) {
  if (color.startsWith("#") && color.length === 7) {
    const r = Number.parseInt(color.slice(1, 3), 16);
    const g = Number.parseInt(color.slice(3, 5), 16);
    const b = Number.parseInt(color.slice(5, 7), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.72;
  }
  return false;
}

export function resolveSpecColorSwatch(label: string | null | undefined): SpecColorOption | null {
  if (!label?.trim()) return null;
  const custom = loadCustomColors().find((color) => labelsMatch(color.label, label));
  if (custom) return custom;
  return toOption(label);
}
