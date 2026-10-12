"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Select, type SelectOption } from "@/components/ui/Select";
import { Input } from "@/components/ui/Input";
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
import { formatMoneyUah } from "@/lib/utils";
import type { DecorationFormatCatalogRow } from "@/server/domains/decoration-formats/service";

const SCREEN_PRINT_VALUE_PREFIX = "sp:";

function screenPrintValue(colorCount: number) {
  return `${SCREEN_PRINT_VALUE_PREFIX}${colorCount}`;
}

function parseScreenPrintColorCount(value: string): number | null {
  if (!value.startsWith(SCREEN_PRINT_VALUE_PREFIX)) return null;
  const n = Number(value.slice(SCREEN_PRINT_VALUE_PREFIX.length));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Unified decoration picker: Шовкотрафарет + DTF Друк (+ додаткові витрати).
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

  const dtfPreview = !isMisc && !isScreenPrint
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
    <SoftBusy busy={pending}>
      <div className="mt-3 space-y-2 border-t border-[var(--color-border)] pt-3">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[16rem] flex-1">
            <Select
              label="Нанесення"
              value={selected}
              disabled={pending}
              options={selectOptions}
              searchable
              onChange={(event) => {
                setSelected(event.target.value);
                setError(null);
                setCoefCodes([]);
                if (event.target.value !== MISC_DECORATION_OPTION_VALUE) {
                  setMiscAmount("");
                }
              }}
            />
          </div>
          {isMisc && !hideCosts ? (
            <div className="w-[8.5rem] shrink-0">
              <Input
                label="Сума"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                placeholder="0"
                value={miscAmount}
                disabled={pending}
                suffix="₴"
                onChange={(event) => {
                  setMiscAmount(event.target.value);
                  setError(null);
                }}
              />
            </div>
          ) : null}
          {!hideCosts && dtfPreview ? (
            <p className="type-caption pb-2 text-[var(--color-text-secondary)]">
              {formatMoneyUah(dtfPreview.unitRate)}/шт за тиражем {quantity}
            </p>
          ) : null}
          {!hideCosts && screenPrintPreview ? (
            <div className="pb-1 text-right">
              <p className="tabular text-[13px] font-semibold text-[var(--color-text-primary)]">
                {formatMoneyUah(screenPrintPreview.unitRate)}
                <span className="ml-1 type-caption font-normal">/шт</span>
              </p>
              <p className="type-caption">
                база {formatMoneyUah(screenPrintPreview.baseRate)}
                {screenPrintPreview.applied.length
                  ? ` · ${screenPrintPreview.applied.map((a) => `×${a.factor}`).join(" ")}`
                  : ""}
              </p>
            </div>
          ) : null}
          <Button
            type="button"
            size="sm"
            onClick={add}
            disabled={pending || !selected}
            className="shrink-0"
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
                className="inline-flex items-center gap-1.5 rounded-[8px] border border-[var(--color-border)] bg-white px-2 py-1.5 text-[12px]"
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
