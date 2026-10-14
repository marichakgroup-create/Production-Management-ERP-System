"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select, type SelectOption } from "@/components/ui/Select";
import { IconPlus } from "@/components/ui/Icons";
import { SoftBusy } from "@/components/ui/SoftBusy";
import {
  addOrderDecorationFormatAction,
  addOrderMiscDecorationCostAction,
} from "@/server/domains/decoration-formats/actions";
import { syncOrderScreenPrintAction } from "@/server/domains/screen-print/actions";
import {
  mapDecorationFormatTiers,
  MISC_DECORATION_COST_NAME,
  MISC_DECORATION_OPTION_VALUE,
  resolveDecorationFormatRate,
} from "@/lib/decoration-format-pricing";
import {
  lookupScreenPrintBaseRate,
  resolveScreenPrintUnitRate,
  uniqueColorCounts,
  type ScreenPrintCoefficient,
  type ScreenPrintPriceCell,
} from "@/lib/screen-print-pricing";
import { TABLE_ADD_FOOTER_CLASS } from "@/components/ui/Table";
import { cn, formatMoneyUah } from "@/lib/utils";
import type { DecorationFormatCatalogRow } from "@/server/domains/decoration-formats/service";

const SCREEN_PRINT_VALUE_PREFIX = "sp:";

const compactFieldClass =
  "h-8 rounded-[6px] border border-[var(--color-border)] bg-white px-1.5 text-right text-[12.5px] tabular outline-none placeholder:text-[11px] focus:border-[var(--color-primary-500)] disabled:opacity-60";

function screenPrintValue(colorCount: number) {
  return `${SCREEN_PRINT_VALUE_PREFIX}${colorCount}`;
}

function parseScreenPrintColorCount(value: string): number | null {
  if (!value.startsWith(SCREEN_PRINT_VALUE_PREFIX)) return null;
  const n = Number(value.slice(SCREEN_PRINT_VALUE_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Unified decoration picker: Шовкотрафарет + DTF Друк (+ додаткові витрати /шт).
 */
export function OrderDecorationFormatPicker({
  orderId,
  orderItemId,
  quantity,
  formats,
  screenPrintCells = [],
  screenPrintCoefficients = [],
  locked,
  hideCosts = false,
}: {
  orderId: string;
  orderItemId: string;
  quantity: number;
  formats: DecorationFormatCatalogRow[];
  screenPrintCells?: ScreenPrintPriceCell[];
  screenPrintCoefficients?: ScreenPrintCoefficient[];
  locked?: boolean;
  hideCosts?: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [miscAmount, setMiscAmount] = useState("");
  const [coefCodes, setCoefCodes] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const isMisc = selected === MISC_DECORATION_OPTION_VALUE;
  const screenPrintColors = parseScreenPrintColorCount(selected);
  const isScreenPrint = screenPrintColors != null;

  const dtfOptions = useMemo(() => {
    return formats
      .filter((row) => row.status === "ACTIVE")
      .map((row) => {
        const unitRate = resolveDecorationFormatRate({
          quantity,
          tiers: mapDecorationFormatTiers(row.tiers),
        });
        return {
          id: row.id,
          label: hideCosts
            ? row.nameUk
            : `${row.nameUk} · ${formatMoneyUah(unitRate)}/шт`,
          unitRate,
        };
      });
  }, [formats, quantity, hideCosts]);

  const screenPrintOptions = useMemo(() => {
    return uniqueColorCounts(screenPrintCells)
      .map((colorCount) => {
        const base = lookupScreenPrintBaseRate({
          quantity,
          colorCount,
          cells: screenPrintCells,
        });
        if (!base) return null;
        return {
          value: screenPrintValue(colorCount),
          colorCount,
          baseRate: base.baseRate,
          label: hideCosts
            ? `${colorCount} кол.`
            : `${colorCount} кол. · ${formatMoneyUah(base.baseRate)}/шт`,
        };
      })
      .filter((row): row is NonNullable<typeof row> => row != null);
  }, [screenPrintCells, quantity, hideCosts]);

  const selectOptions = useMemo((): SelectOption[] => {
    const rows: SelectOption[] = [{ value: "", label: "Оберіть нанесення…" }];
    for (const row of screenPrintOptions) {
      rows.push({
        value: row.value,
        label: row.label,
        group: "Шовкотрафарет",
      });
    }
    for (const row of dtfOptions) {
      rows.push({
        value: row.id,
        label: row.label,
        group: "DTF Друк",
      });
    }
    rows.push({
      value: MISC_DECORATION_OPTION_VALUE,
      label: MISC_DECORATION_COST_NAME,
      group: "Інше",
    });
    return rows;
  }, [screenPrintOptions, dtfOptions]);

  const dtfPreview =
    !isMisc && !isScreenPrint
      ? (dtfOptions.find((row) => row.id === selected) ?? null)
      : null;

  const screenPrintPreview = useMemo(() => {
    if (screenPrintColors == null) return null;
    return resolveScreenPrintUnitRate({
      quantity,
      colorCount: screenPrintColors,
      cells: screenPrintCells,
      coefficients: screenPrintCoefficients,
      selectedCodes: coefCodes,
    });
  }, [
    screenPrintColors,
    quantity,
    screenPrintCells,
    screenPrintCoefficients,
    coefCodes,
  ]);

  if (locked) return null;

  function resetDraft() {
    setSelected("");
    setMiscAmount("");
    setCoefCodes([]);
    setError(null);
  }

  function toggleCoef(code: string) {
    setCoefCodes((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  function add() {
    if (!selected) {
      setError("Оберіть нанесення");
      return;
    }
    setError(null);
    startTransition(async () => {
      if (selected === MISC_DECORATION_OPTION_VALUE) {
        const amount = miscAmount.trim() === "" ? 0 : Math.max(0, Number(miscAmount) || 0);
        const result = await addOrderMiscDecorationCostAction({
          orderId,
          orderItemId,
          amount,
        });
        if (!result.ok) {
          setError("Не вдалося додати витрати");
          return;
        }
        resetDraft();
        router.refresh();
        return;
      }

      const colorCount = parseScreenPrintColorCount(selected);
      if (colorCount != null) {
        const result = await syncOrderScreenPrintAction({
          orderId,
          orderItemId,
          enabled: true,
          colorCount,
          selectedCodes: coefCodes,
        });
        if (!result.ok) {
          setError(
            result.error === "NO_RATE"
              ? "Немає ставки для цього тиражу / кольорів у довіднику"
              : "Не вдалося додати нанесення",
          );
          return;
        }
        resetDraft();
        router.refresh();
        return;
      }

      const result = await addOrderDecorationFormatAction({
        orderId,
        orderItemId,
        formatId: selected,
      });
      if (!result.ok) {
        setError(
          result.error === "NO_RATE"
            ? "Немає ставки для цього формату"
            : "Не вдалося додати нанесення",
        );
        return;
      }
      resetDraft();
      router.refresh();
    });
  }

  return (
    <SoftBusy busy={pending} label="Додаємо нанесення…">
      <div className={cn(TABLE_ADD_FOOTER_CLASS, "space-y-2")}>
        <div className="flex flex-wrap items-end gap-2">
          <Select
            size="sm"
            className="min-w-[16rem] flex-1"
            value={selected}
            disabled={pending}
            options={selectOptions}
            searchable
            hideSelectedDescription
            aria-label="Тип нанесення"
            onChange={(event) => {
              setSelected(event.target.value);
              setError(null);
              setCoefCodes([]);
              if (event.target.value !== MISC_DECORATION_OPTION_VALUE) {
                setMiscAmount("");
              }
            }}
          />
          {isMisc && !hideCosts ? (
            <input
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              placeholder="₴/шт"
              title={`Ставка за виріб · × тираж ${quantity}`}
              aria-label="Ставка додаткових витрат за виріб"
              value={miscAmount}
              disabled={pending}
              onChange={(event) => {
                setMiscAmount(event.target.value);
                setError(null);
              }}
              className={cn(compactFieldClass, "w-[72px]")}
            />
          ) : null}
          {!hideCosts && dtfPreview ? (
            <p className="type-caption self-center text-[var(--color-text-secondary)]">
              {formatMoneyUah(dtfPreview.unitRate)}/шт · тираж {quantity}
            </p>
          ) : null}
          {!hideCosts && screenPrintPreview ? (
            <p className="type-caption self-center text-[var(--color-text-secondary)]">
              <span className="font-semibold tabular text-[var(--color-text-primary)]">
                {formatMoneyUah(screenPrintPreview.unitRate)}
              </span>
              /шт
              {screenPrintPreview.applied.length
                ? ` · ${screenPrintPreview.applied.map((a) => `×${a.factor}`).join(" ")}`
                : ""}
            </p>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={add}
            disabled={pending || !selected}
            loading={pending}
            className="inline-flex shrink-0 items-center gap-1"
          >
            <IconPlus size={14} />
            Додати
          </Button>
        </div>

        {isScreenPrint && screenPrintCoefficients.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {screenPrintCoefficients.map((coef) => (
              <label
                key={coef.code}
                className="inline-flex h-8 items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-white px-2 text-[12px]"
                title={coef.noteUk ?? undefined}
              >
                <input
                  type="checkbox"
                  checked={coefCodes.includes(coef.code)}
                  disabled={pending}
                  onChange={() => toggleCoef(coef.code)}
                />
                <span>
                  {coef.nameUk} ×{coef.factor}
                </span>
              </label>
            ))}
          </div>
        ) : null}

        {error ? (
          <p className="text-[12.5px] text-[var(--color-danger-text)]">{error}</p>
        ) : null}
      </div>
    </SoftBusy>
  );
}
