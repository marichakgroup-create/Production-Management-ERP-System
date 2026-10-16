"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import {
  filterUnusedCatalogColors,
  paletteCatalogForSupplier,
} from "@/lib/supplier-palettes";
import {
  mergeColorLists,
  normalizeColorLabel,
  rememberCustomColorSwatch,
  swatchForColorLabel,
  TRIM_COLOR_SWATCHES,
} from "@/lib/trim-colors";
import { cn } from "@/lib/utils";

function labelsMatch(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Compact supplier palette: selected chips with ×, add via searchable dropdown + custom.
 */
export function SupplierPaletteEditor({
  value,
  onChange,
  supplierNameUk,
}: {
  /** Comma-separated labels (same wire format as before). */
  value: string;
  onChange: (nextCsv: string) => void;
  /** When set, locked suppliers get a preferred searchable catalog. */
  supplierNameUk?: string | null;
}) {
  const colors = useMemo(() => mergeColorLists(value.split(",")), [value]);
  const [draftName, setDraftName] = useState("");
  const [draftSwatch, setDraftSwatch] = useState("#4B5563");
  const [pickKey, setPickKey] = useState(0);
  /** Custom colors created in this editor — stay in the dropdown after remove. */
  const [extras, setExtras] = useState<string[]>([]);

  const { colors: baseCatalog } = useMemo(
    () =>
      paletteCatalogForSupplier(
        supplierNameUk,
        TRIM_COLOR_SWATCHES.map((row) => row.label),
      ),
    [supplierNameUk],
  );

  // Keep previously saved custom colors in the pick list after × remove.
  useEffect(() => {
    const custom = colors.filter(
      (label) => !baseCatalog.some((row) => labelsMatch(row, label)),
    );
    if (custom.length === 0) return;
    setExtras((prev) => mergeColorLists(prev, custom));
  }, [colors, baseCatalog]);

  const pool = useMemo(
    () => mergeColorLists(baseCatalog, extras, colors),
    [baseCatalog, extras, colors],
  );

  const unused = useMemo(
    () => filterUnusedCatalogColors(pool, colors),
    [pool, colors],
  );

  const selectOptions = useMemo(
    () => [
      { value: "", label: "Додати колір…" },
      ...unused.map((label) => {
        const swatch = swatchForColorLabel(label);
        return {
          value: label,
          label,
          swatch: swatch.swatch,
          swatchBordered: swatch.bordered,
        };
      }),
    ],
    [unused],
  );

  function commit(next: string[]) {
    onChange(next.join(", "));
  }

  function removeAt(index: number) {
    commit(colors.filter((_, i) => i !== index));
  }

  function addColor(rawName: string, swatch?: string) {
    const label = normalizeColorLabel(rawName);
    if (!label) return;
    if (colors.some((row) => labelsMatch(row, label))) return;
    if (swatch) rememberCustomColorSwatch(label, swatch);
    if (!baseCatalog.some((row) => labelsMatch(row, label))) {
      setExtras((prev) => mergeColorLists(prev, [label]));
    }
    commit(mergeColorLists(colors, [label]));
    setDraftName("");
    setDraftSwatch("#4B5563");
    setPickKey((key) => key + 1);
  }

  function applyFullCatalog() {
    commit(mergeColorLists(baseCatalog, colors));
    setPickKey((key) => key + 1);
  }

  return (
    <div className="sm:col-span-full space-y-2.5">
      {colors.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {colors.map((label, index) => {
            const swatch = swatchForColorLabel(label);
            return (
              <span
                key={`${label}-${index}`}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] py-0.5 pl-1.5 pr-1 text-[11.5px] font-medium text-[var(--color-text-primary)]"
              >
                <span
                  className={cn(
                    "size-3.5 shrink-0 rounded-full ring-1 ring-black/12",
                    swatch.bordered && "border border-[var(--color-border-strong)]",
                  )}
                  style={{ backgroundColor: swatch.swatch }}
                  aria-hidden
                />
                <span className="min-w-0 truncate" title={label}>
                  {label}
                </span>
                <button
                  type="button"
                  className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[13px] leading-none text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]"
                  onClick={() => removeAt(index)}
                  aria-label={`Прибрати ${label}`}
                  title="Прибрати"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[14rem] flex-1 basis-[16rem]">
          <Select
            key={pickKey}
            size="sm"
            searchable
            value=""
            aria-label="Додати колір"
            placeholder="Додати колір…"
            options={selectOptions}
            disabled={unused.length === 0}
            onChange={(event) => {
              const next = event.target.value;
              if (!next) return;
              addColor(next);
            }}
          />
        </div>
        {baseCatalog.length > 20 && unused.length > 0 ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={applyFullCatalog}
            title="Додати всі з каталогу постачальника"
          >
            Усі
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="color"
          value={draftSwatch}
          onChange={(event) => setDraftSwatch(event.target.value)}
          className="h-8 w-10 shrink-0 cursor-pointer rounded-[6px] border border-[var(--color-border-strong)] bg-[var(--color-surface)] p-0.5"
          aria-label="Зразок кольору"
          title="Зразок"
        />
        <Input
          className="min-w-[8rem] flex-1"
          value={draftName}
          onChange={(event) => setDraftName(event.target.value)}
          placeholder="Новий колір…"
          aria-label="Назва кольору"
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              addColor(draftName, draftSwatch);
            }
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!draftName.trim()}
          onClick={() => addColor(draftName, draftSwatch)}
        >
          Додати
        </Button>
      </div>
    </div>
  );
}
