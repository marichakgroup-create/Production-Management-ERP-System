"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { IconPlus, IconTrash } from "@/components/ui/Icons";
import {
  Table,
  TableCard,
  TableEmpty,
  TableToolbar,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { saveDecorationFormatsMatrixAction } from "@/server/domains/decoration-formats/actions";
import { DEFAULT_DECORATION_FORMAT_QTY_TIERS } from "@/lib/decoration-format-pricing";
import type { DecorationFormatCatalogRow } from "@/server/domains/decoration-formats/service";
import { cn } from "@/lib/utils";

const softCell =
  "h-8 w-full rounded-[6px] border border-transparent bg-transparent px-1 text-right text-[13px] tabular text-[var(--color-text-primary)] outline-none transition-[border-color,background-color] placeholder:text-[var(--color-text-quiet)] hover:border-[var(--color-border)] focus:border-[var(--color-primary-400)] focus:bg-[color-mix(in_srgb,var(--color-primary-50)_40%,transparent)] disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const softLine =
  "h-8 w-full min-w-0 rounded-[6px] border border-transparent bg-transparent px-1.5 text-[13px] outline-none transition-[border-color,background-color] placeholder:text-[var(--color-text-quiet)] hover:border-[var(--color-border)] focus:border-[var(--color-primary-400)] focus:bg-[color-mix(in_srgb,var(--color-primary-50)_40%,transparent)] disabled:opacity-60";

const headerQty =
  "h-7 w-[4.25rem] rounded-[6px] border border-transparent bg-transparent px-1 text-center text-[12.5px] font-semibold tabular outline-none hover:border-[var(--color-border)] focus:border-[var(--color-primary-400)] focus:bg-[color-mix(in_srgb,var(--color-primary-50)_40%,transparent)] disabled:opacity-60 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const draftCell =
  "h-8 w-full rounded-[6px] border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-1 text-right text-[13px] tabular outline-none placeholder:text-[var(--color-text-quiet)] focus:border-solid focus:border-[var(--color-primary-400)] [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

const RATE_COL_WIDTH = "7.5rem";
const NAME_COL_WIDTH = "14rem";
const ACTION_COL_WIDTH = "2.75rem";

type EditorRow = {
  key: string;
  id: string | null;
  nameUk: string;
  /** Rates keyed by current minQuantity. */
  rates: Record<number, number>;
};

function tierMinsFromRows(rows: DecorationFormatCatalogRow[]): number[] {
  const mins = new Set<number>();
  for (const row of rows) {
    for (const tier of row.tiers) mins.add(tier.minQuantity);
  }
  if (mins.size === 0) return [...DEFAULT_DECORATION_FORMAT_QTY_TIERS];
  return [...mins].sort((a, b) => a - b);
}

function toEditorRows(rows: DecorationFormatCatalogRow[]): EditorRow[] {
  return rows
    .filter((row) => row.status === "ACTIVE")
    .map((row, index) => ({
      key: row.id || `row-${index}`,
      id: row.id.startsWith("fallback_") ? null : row.id,
      nameUk: row.nameUk,
      rates: Object.fromEntries(row.tiers.map((t) => [t.minQuantity, t.unitRate])),
    }));
}

function serialize(rows: EditorRow[], mins: number[]) {
  return JSON.stringify(
    rows.map((row) => ({
      id: row.id,
      nameUk: row.nameUk.trim(),
      rates: mins.map((min) => row.rates[min] ?? 0),
    })),
  );
}

function bandLabel(minQuantity: number, nextMin: number | null | undefined): string {
  if (nextMin != null && nextMin > minQuantity) {
    return `${minQuantity}–${nextMin - 1}`;
  }
  return `від ${minQuantity}`;
}

function remapRates(
  rates: Record<number, number>,
  fromMin: number,
  toMin: number,
): Record<number, number> {
  if (fromMin === toMin) return rates;
  const next = { ...rates };
  const value = next[fromMin] ?? 0;
  delete next[fromMin];
  next[toMin] = value;
  return next;
}

export function DecorationFormatsAdminPanel({
  formats: initialFormats,
}: {
  formats: DecorationFormatCatalogRow[];
}) {
  const router = useRouter();
  const [mins, setMins] = useState(() => tierMinsFromRows(initialFormats));
  const [rows, setRows] = useState(() => toEditorRows(initialFormats));
  const [draftQty, setDraftQty] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setMins(tierMinsFromRows(initialFormats));
    setRows(toEditorRows(initialFormats));
  }, [initialFormats]);

  const dirty = useMemo(() => {
    const baselineMins = tierMinsFromRows(initialFormats);
    const baseline = toEditorRows(initialFormats);
    return (
      JSON.stringify(mins) !== JSON.stringify(baselineMins) ||
      serialize(rows, mins) !== serialize(baseline, baselineMins)
    );
  }, [rows, mins, initialFormats]);

  function setRate(key: string, minQuantity: number, unitRate: number) {
    setRows((prev) =>
      prev.map((row) =>
        row.key === key
          ? { ...row, rates: { ...row.rates, [minQuantity]: Math.max(0, unitRate) } }
          : row,
      ),
    );
  }

  function setName(key: string, nameUk: string) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, nameUk } : row)));
  }

  function removeRow(key: string) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  function addRow() {
    const key = `new-${Date.now()}`;
    setRows((prev) => [
      ...prev,
      {
        key,
        id: null,
        nameUk: "",
        rates: Object.fromEntries(mins.map((min) => [min, 0])),
      },
    ]);
  }

  /** Change a column's «від N шт» threshold; keep rates under the new key. */
  function updateColumnMin(oldMin: number, raw: string) {
    const nextMin = Math.floor(Number(raw));
    if (!Number.isFinite(nextMin) || nextMin <= 0) {
      setError("Тираж від має бути цілим числом > 0");
      return;
    }
    if (nextMin === oldMin) return;
    if (mins.includes(nextMin)) {
      setError(`Стовпець «від ${nextMin}» уже є`);
      return;
    }
    setError(null);
    setMins((prev) => [...prev.filter((m) => m !== oldMin), nextMin].sort((a, b) => a - b));
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        rates: remapRates(row.rates, oldMin, nextMin),
      })),
    );
  }

  function removeColumn(minQuantity: number) {
    if (mins.length <= 1) {
      setError("Потрібен хоча б один стовпець тиражу");
      return;
    }
    setError(null);
    setMins((prev) => prev.filter((m) => m !== minQuantity));
    setRows((prev) =>
      prev.map((row) => {
        const rates = { ...row.rates };
        delete rates[minQuantity];
        return { ...row, rates };
      }),
    );
  }

  function addColumn() {
    const qty = Math.floor(Number(draftQty));
    if (!Number.isFinite(qty) || qty <= 0) {
      setError("Вкажіть тираж від (шт) для нового стовпця");
      return;
    }
    if (mins.includes(qty)) {
      setError(`Стовпець «від ${qty}» уже є`);
      return;
    }
    setError(null);
    setMins((prev) => [...prev, qty].sort((a, b) => a - b));
    setRows((prev) =>
      prev.map((row) => ({
        ...row,
        rates: { ...row.rates, [qty]: 0 },
      })),
    );
    setDraftQty("");
  }

  function persist() {
    setMessage(null);
    setError(null);
    if (mins.length === 0) {
      setError("Додайте хоча б один стовпець тиражу");
      return;
    }
    for (const row of rows) {
      if (!row.nameUk.trim()) {
        setError("У кожного формату має бути назва");
        return;
      }
    }
    const payload = rows.map((row, index) => ({
      id: row.id,
      nameUk: row.nameUk.trim(),
      sortOrder: index + 1,
      status: "ACTIVE" as const,
      tiers: mins.map((minQuantity) => ({
        minQuantity,
        unitRate: Number(row.rates[minQuantity] ?? 0),
      })),
    }));

    startTransition(async () => {
      const fd = new FormData();
      fd.set("matrixJson", JSON.stringify(payload));
      const result = await saveDecorationFormatsMatrixAction(fd);
      if (!result.ok) {
        setError("Не вдалося зберегти. Перевірте ставки й тиражі.");
        return;
      }
      setMessage("Збережено");
      router.refresh();
    });
  }

  return (
    <SoftBusy busy={pending}>
      <div className="space-y-3">
        {error ? (
          <Banner tone="danger" title={error} />
        ) : message ? (
          <Banner tone="success" title={message} />
        ) : (
          <Banner tone="info" title="Матриця формат × тираж">
            Рядок — формат · стовпець — «від N шт» (editable) · клітинка — ₴/шт. Тираж менше
            першого порогу бере ставку першого стовпця.
          </Banner>
        )}

        <TableCard>
          <TableToolbar
            left={
              <div className="min-w-0">
                <p className="type-subsection">Прайс ₴/шт за форматом</p>
                <p className="type-caption mt-0.5">
                  {rows.length} формат{rows.length === 1 ? "" : "ів"} · {mins.length} сходів
                  тиражу
                </p>
              </div>
            }
            right={
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min={1}
                  disabled={pending}
                  className={cn(draftCell, "w-[5rem] text-center")}
                  value={draftQty}
                  onChange={(event) => setDraftQty(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addColumn();
                    }
                  }}
                  placeholder="від шт"
                  aria-label="Новий тираж від"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={addColumn}
                  disabled={pending}
                >
                  <IconPlus size={14} />
                  Стовпець
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={addRow} disabled={pending}>
                  <IconPlus size={14} />
                  Формат
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={persist}
                  disabled={pending || !dirty || (rows.length === 0 && mins.length === 0)}
                >
                  {pending ? "…" : "Зберегти"}
                </Button>
              </div>
            }
          />

          <div className="overflow-x-auto">
            {rows.length === 0 ? (
              <TableEmpty
                colSpan={Math.max(mins.length, 1) + 2}
                title="Немає форматів"
                description="Додайте рядок формату. Стовпці тиражу можна міняти в шапці."
              />
            ) : (
              <Table className="min-w-max table-fixed">
                <THead>
                  <TH width={NAME_COL_WIDTH} stickyLeft className="min-w-[14rem]">
                    Формат
                  </TH>
                  {mins.map((minQuantity, index) => {
                    const nextMin = mins[index + 1] ?? null;
                    const range = bandLabel(minQuantity, nextMin);
                    return (
                      <TH
                        key={`col-${minQuantity}`}
                        align="center"
                        width={RATE_COL_WIDTH}
                        className="px-1"
                      >
                        <div className="flex flex-col items-center gap-0.5">
                          <span className="inline-flex items-center gap-0.5">
                            <span className="type-caption font-normal normal-case tracking-normal text-[var(--color-text-tertiary)]">
                              від
                            </span>
                            <input
                              type="number"
                              min={1}
                              disabled={pending}
                              className={headerQty}
                              defaultValue={minQuantity}
                              key={`min-${minQuantity}`}
                              aria-label={`Тираж від для стовпця ${range}`}
                              onBlur={(event) => updateColumnMin(minQuantity, event.target.value)}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  (event.target as HTMLInputElement).blur();
                                }
                              }}
                            />
                            <span className="type-caption font-normal normal-case tracking-normal text-[var(--color-text-tertiary)]">
                              шт
                            </span>
                            <button
                              type="button"
                              title={`Прибрати стовпець від ${minQuantity}`}
                              aria-label={`Прибрати стовпець від ${minQuantity}`}
                              disabled={pending || mins.length <= 1}
                              onClick={() => removeColumn(minQuantity)}
                              className="rounded p-0.5 text-[var(--color-text-quiet)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-30"
                            >
                              <IconTrash size={12} />
                            </button>
                          </span>
                          <span className="type-caption tabular text-[var(--color-text-secondary)]">
                            {range} · ₴/шт
                          </span>
                        </div>
                      </TH>
                    );
                  })}
                  <TH width={ACTION_COL_WIDTH} align="center" />
                </THead>
                <TBody>
                  {rows.map((row) => (
                    <TR key={row.key}>
                      <TD stickyLeft className="min-w-[14rem] py-1" style={{ width: NAME_COL_WIDTH }}>
                        <input
                          type="text"
                          value={row.nameUk}
                          disabled={pending}
                          onChange={(event) => setName(row.key, event.target.value)}
                          placeholder="Назва формату"
                          className={softLine}
                        />
                      </TD>
                      {mins.map((minQuantity, index) => {
                        const nextMin = mins[index + 1] ?? null;
                        return (
                          <TD
                            key={`${row.key}-${minQuantity}`}
                            numeric
                            className="px-1 py-1"
                            style={{ width: RATE_COL_WIDTH, maxWidth: RATE_COL_WIDTH }}
                          >
                            <input
                              type="number"
                              min={0}
                              step="1"
                              value={row.rates[minQuantity] ?? 0}
                              disabled={pending}
                              onChange={(event) =>
                                setRate(row.key, minQuantity, Number(event.target.value) || 0)
                              }
                              className={softCell}
                              title={`${bandLabel(minQuantity, nextMin)} шт · ₴/шт`}
                              aria-label={`${row.nameUk || "Формат"} · ${bandLabel(minQuantity, nextMin)} · ₴/шт`}
                            />
                          </TD>
                        );
                      })}
                      <TD align="center" className="py-1" style={{ width: ACTION_COL_WIDTH }}>
                        <button
                          type="button"
                          aria-label={`Прибрати ${row.nameUk || "формат"}`}
                          disabled={pending}
                          onClick={() => removeRow(row.key)}
                          className="rounded-[var(--radius-control)] p-1 text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
                        >
                          <IconTrash size={15} />
                        </button>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </TableCard>
      </div>
    </SoftBusy>
  );
}
