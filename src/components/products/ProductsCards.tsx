"use client";

import { useMemo } from "react";
import Image from "next/image";
import Link from "next/link";
import { StatusBadge } from "@/components/ui/Page";
import {
  RowCheckbox,
  SelectionBar,
  sortRows,
  useRowSelection,
  useTableSort,
} from "@/components/ui/table-interactions";
import { BulkDeleteButton, OpenSelectedLink } from "@/components/ui/BulkDeleteButton";
import { IconProducts } from "@/components/ui/Icons";
import { cn, formatMoneyUah } from "@/lib/utils";
import { bulkArchiveProductsAction } from "@/server/domains/products/actions";
import type { ProductsTableRow } from "@/components/products/ProductsTable";

type SortKey = "name" | "status" | "price";

function primaryPrice(row: ProductsTableRow): number | null {
  if (!row.ready) return null;
  return row.prices[1] ?? row.prices[0] ?? row.prices.find((p) => p != null) ?? null;
}

export function ProductsCards({
  rows,
  empty,
  canDelete = false,
  showPrices = true,
}: {
  rows: ProductsTableRow[];
  empty: { title: string; description?: string; action?: React.ReactNode };
  canDelete?: boolean;
  showPrices?: boolean;
}) {
  const { sort } = useTableSort<SortKey>({ key: "status", direction: "desc" });
  const sorted = useMemo(
    () =>
      sortRows(
        rows,
        sort,
        {
          name: (row) => row.nameUk,
          status: (row) => (row.ready ? 1 : 0),
          price: (row) => primaryPrice(row) ?? 0,
        },
        sort?.key === "status" ? { key: "name", direction: "asc" } : undefined,
      ),
    [rows, sort],
  );
  const ids = useMemo(() => sorted.map((row) => row.id), [sorted]);
  const selection = useRowSelection(ids);

  if (sorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-tint-sage)] text-[var(--color-primary-700)]">
          <IconProducts size={22} />
        </div>
        <div className="max-w-sm space-y-1">
          <p className="text-[14px] font-semibold text-[var(--color-text-primary)]">{empty.title}</p>
          {empty.description ? (
            <p className="text-[12.5px] leading-relaxed text-[var(--color-text-secondary)]">
              {empty.description}
            </p>
          ) : null}
        </div>
        {empty.action}
      </div>
    );
  }

  return (
    <div>
      <SelectionBar count={selection.selectedIds.length} onClear={selection.clear}>
        {selection.selectedIds.length === 1 ? (
          <OpenSelectedLink href={`/products/${selection.selectedIds[0]}`} />
        ) : null}
        {canDelete ? (
          <BulkDeleteButton
            ids={selection.selectedIds}
            action={bulkArchiveProductsAction}
            title="Видалити вироби?"
            description="Обрані вироби потраплять в архів і зникнуть з каталогу для нових замовлень. Зафіксовані версії в замовленнях не зміняться."
            onDone={selection.clear}
          />
        ) : null}
      </SelectionBar>

      <div className="flex items-center gap-2 border-b border-[var(--color-divider)] px-3.5 py-2">
        <RowCheckbox
          checked={selection.allSelected}
          indeterminate={selection.someSelected}
          onChange={selection.toggleAll}
          label="Обрати всі"
        />
        <span className="type-caption">Обрати всі на сторінці</span>
      </div>

      <div className="max-h-[min(70vh,calc(100dvh-13rem))] overflow-y-auto overflow-x-hidden">
        <ul className="grid grid-cols-1 gap-2.5 p-3.5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sorted.map((product) => {
            const isSelected = selection.isSelected(product.id);
            const initial = product.nameUk.trim().charAt(0).toUpperCase() || "В";

            return (
              <li key={product.id} className="min-w-0">
                <article
                  className={cn(
                    "group relative flex h-full overflow-hidden rounded-[var(--radius-surface)] border bg-[var(--color-surface)] transition-colors",
                    isSelected
                      ? "border-[var(--color-primary-300)] ring-1 ring-[var(--color-primary-200)]"
                      : "border-[var(--color-border)] hover:border-[var(--color-border-strong)]",
                  )}
                >
                  <div className="absolute top-2 left-2 z-[1]">
                    <RowCheckbox
                      checked={isSelected}
                      onChange={() => selection.toggleOne(product.id)}
                      label={`Обрати ${product.nameUk}`}
                    />
                  </div>

                  <Link
                    href={`/products/${product.id}`}
                    className="flex min-w-0 flex-1 gap-3 p-2.5 outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-focus-ring)] focus-visible:ring-inset"
                  >
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-[6px] border border-[var(--color-border)] bg-[var(--color-tint-slate)]">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                          unoptimized={
                            product.imageUrl.startsWith("/uploads/") ||
                            product.imageUrl.includes("supabase.co")
                          }
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center text-[var(--color-text-tertiary)]">
                          <span className="text-[11px] font-semibold tracking-wide">{initial}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <h3 className="line-clamp-2 text-[13px] font-semibold leading-snug text-[var(--color-text-primary)]">
                            {product.nameUk}
                          </h3>
                          <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-tertiary)]">
                            {product.isBaseModel ? (
                              <span className="text-[var(--color-primary-700)]">Базова</span>
                            ) : null}
                            {product.isBaseModel && product.internalCode ? " · " : null}
                            {product.internalCode ?? "Без коду"}
                          </p>
                        </div>
                        <StatusBadge dot tone={product.ready ? "success" : "warning"}>
                          {product.ready ? "Готовий" : "Комплектація"}
                        </StatusBadge>
                      </div>

                      {product.compositionSummary ? (
                        <p className="line-clamp-4 text-[11.5px] leading-snug text-[var(--color-text-quiet)]">
                          {product.compositionSummary}
                        </p>
                      ) : (
                        <p className="text-[11px] text-[var(--color-text-quiet)]">Склад не вказано</p>
                      )}

                      <div className="mt-auto space-y-0.5 pt-0.5">
                        {showPrices ? (
                          product.ready && product.prices.some((p) => p != null) ? (
                            product.priceTiers.map((qty, index) => {
                              const tierPrice = product.prices[index];
                              if (tierPrice == null) return null;
                              return (
                                <p
                                  key={`${product.id}-${qty}`}
                                  className="flex items-baseline justify-between gap-2 tabular text-[12.5px]"
                                >
                                  <span className="text-[10.5px] text-[var(--color-text-tertiary)]">
                                    від {qty} шт
                                  </span>
                                  <span className="font-semibold text-[var(--color-text-primary)]">
                                    {formatMoneyUah(tierPrice)}
                                  </span>
                                </p>
                              );
                            })
                          ) : (
                            <p className="text-[11.5px] text-[var(--color-text-tertiary)]">
                              Ціна після комплектації
                            </p>
                          )
                        ) : (
                          <p className="text-[11.5px] text-[var(--color-text-quiet)]">
                            {product.materialsCount} мат. · {product.operationsCount} оп.
                          </p>
                        )}
                      </div>
                    </div>
                  </Link>
                </article>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
