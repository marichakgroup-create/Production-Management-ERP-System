"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StatusBadge } from "@/components/ui/Page";
import {
  CellStack,
  TableEmpty,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import {
  RowCheckbox,
  SelectionBar,
  SortableTH,
  sortRows,
  useRowSelection,
  useTableSort,
} from "@/components/ui/table-interactions";
import { BulkDeleteButton, OpenSelectedLink } from "@/components/ui/BulkDeleteButton";
import { Button } from "@/components/ui/Button";
import { IconPin } from "@/components/ui/Icons";
import { cn, formatAmount, formatDateShortUk } from "@/lib/utils";
import { bulkArchiveProductsAction } from "@/server/domains/products/actions";

export type ProductsTableRow = {
  id: string;
  nameUk: string;
  internalCode: string | null;
  imageUrl?: string | null;
  isBaseModel?: boolean;
  /** Short fabric/BOM composition for card secondary text. */
  compositionSummary?: string | null;
  materialsCount: number;
  operationsCount: number;
  decorationsCount: number;
  ready: boolean;
  updatedAt?: string | null;
  prices: Array<number | null>;
  priceTiers: number[];
};

type SortKey = "name" | "status" | "updated" | `price:${number}`;

const CHECK_COL_PX = 40;
const NAME_COL_LEFT = `${CHECK_COL_PX}px`;
const PINNED_STORAGE_KEY = "erp.products.pinnedIds";

/** Price columns hidden from the products list (still used elsewhere). */
const HIDDEN_LIST_PRICE_TIERS = new Set([10, 20, 60]);

function priceAtTier(row: ProductsTableRow, qty: number): number | null {
  const index = row.priceTiers.indexOf(qty);
  if (index < 0) return null;
  return row.prices[index] ?? null;
}

function collectPriceTiers(rows: ProductsTableRow[]): number[] {
  const set = new Set<number>();
  for (const row of rows) {
    for (const qty of row.priceTiers) {
      if (!Number.isFinite(qty) || qty <= 0) continue;
      if (HIDDEN_LIST_PRICE_TIERS.has(qty)) continue;
      set.add(qty);
    }
  }
  if (set.size === 0) return [50, 100, 500];
  return [...set].sort((a, b) => a - b);
}

function formatTierLabel(qty: number) {
  return `${qty}\u00a0шт`;
}

function readPinnedIds(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PINNED_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  } catch {
    return [];
  }
}

function writePinnedIds(ids: string[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(PINNED_STORAGE_KEY, JSON.stringify(ids));
}

export function ProductsTable({
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
  const priceTiers = useMemo(() => collectPriceTiers(rows), [rows]);
  const highlightTier = priceTiers[Math.min(1, Math.max(0, priceTiers.length - 1))];
  const { sort, toggle } = useTableSort<SortKey>({ key: "status", direction: "desc" });

  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [pinsReady, setPinsReady] = useState(false);

  useEffect(() => {
    setPinnedIds(readPinnedIds());
    setPinsReady(true);
  }, []);

  const pinnedSet = useMemo(() => new Set(pinnedIds), [pinnedIds]);

  const sorted = useMemo(() => {
    const base = sortRows(
      rows,
      sort,
      {
        name: (row) => row.nameUk,
        status: (row) => (row.ready ? 1 : 0),
        updated: (row) => (row.updatedAt ? new Date(row.updatedAt).getTime() : null),
        ...Object.fromEntries(
          priceTiers.map((qty) => [
            `price:${qty}`,
            (row: ProductsTableRow) => priceAtTier(row, qty) ?? -1,
          ]),
        ),
      } as Record<SortKey, (row: ProductsTableRow) => string | number | null | undefined>,
      sort?.key === "status" ? { key: "name", direction: "asc" } : undefined,
    );
    if (!pinsReady || pinnedSet.size === 0) return base;
    const pinned: ProductsTableRow[] = [];
    const rest: ProductsTableRow[] = [];
    for (const row of base) {
      if (pinnedSet.has(row.id)) pinned.push(row);
      else rest.push(row);
    }
    // Keep pin order as stored (newest pin actions append / user sequence).
    pinned.sort((a, b) => pinnedIds.indexOf(a.id) - pinnedIds.indexOf(b.id));
    return [...pinned, ...rest];
  }, [rows, sort, priceTiers, pinsReady, pinnedSet, pinnedIds]);

  const ids = useMemo(() => sorted.map((row) => row.id), [sorted]);
  const selection = useRowSelection(ids);
  const colSpan = showPrices ? 4 + priceTiers.length : 4;

  const selectedPinnedCount = useMemo(
    () => selection.selectedIds.filter((id) => pinnedSet.has(id)).length,
    [selection.selectedIds, pinnedSet],
  );
  const selectedUnpinnedCount = selection.selectedIds.length - selectedPinnedCount;

  function persistPins(next: string[]) {
    setPinnedIds(next);
    writePinnedIds(next);
  }

  function pinSelected() {
    const next = [...pinnedIds];
    for (const id of selection.selectedIds) {
      if (!next.includes(id)) next.push(id);
    }
    persistPins(next);
  }

  function unpinSelected() {
    const drop = new Set(selection.selectedIds);
    persistPins(pinnedIds.filter((id) => !drop.has(id)));
  }

  const mainScrollRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [scrollWidth, setScrollWidth] = useState(0);
  const [needsHScroll, setNeedsHScroll] = useState(false);
  const syncing = useRef<"main" | "top" | null>(null);

  const measureWidth = useCallback(() => {
    const el = mainScrollRef.current;
    if (!el) return;
    setScrollWidth(el.scrollWidth);
    setNeedsHScroll(el.scrollWidth > el.clientWidth + 1);
  }, []);

  useEffect(() => {
    measureWidth();
    const el = mainScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(measureWidth);
    ro.observe(el);
    const table = el.querySelector("table");
    if (table) ro.observe(table);
    window.addEventListener("resize", measureWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measureWidth);
    };
  }, [measureWidth, sorted.length, priceTiers.length, showPrices]);

  function onMainScroll() {
    const main = mainScrollRef.current;
    const top = topScrollRef.current;
    if (!main || !top) return;
    if (syncing.current === "top") return;
    syncing.current = "main";
    top.scrollLeft = main.scrollLeft;
    syncing.current = null;
  }

  function onTopScroll() {
    const main = mainScrollRef.current;
    const top = topScrollRef.current;
    if (!main || !top) return;
    if (syncing.current === "main") return;
    syncing.current = "top";
    main.scrollLeft = top.scrollLeft;
    syncing.current = null;
  }

  return (
    <div>
      <SelectionBar count={selection.selectedIds.length} onClear={selection.clear}>
        {selectedUnpinnedCount > 0 ? (
          <Button type="button" size="sm" variant="secondary" onClick={pinSelected}>
            <IconPin size={14} />
            Закріпити
          </Button>
        ) : null}
        {selectedPinnedCount > 0 ? (
          <Button type="button" size="sm" variant="ghost" onClick={unpinSelected}>
            Відкріпити
          </Button>
        ) : null}
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

      {showPrices && needsHScroll ? (
        <div
          ref={topScrollRef}
          className="table-scroll-top"
          onScroll={onTopScroll}
          aria-hidden
        >
          <div className="table-scroll-top-spacer" style={{ width: scrollWidth }} />
        </div>
      ) : null}

      <div
        ref={mainScrollRef}
        className="table-scroll max-h-[min(70vh,calc(100dvh-13rem))] max-w-full overflow-auto"
        onScroll={onMainScroll}
      >
        <table className="erp-table w-full min-w-max border-collapse text-[13px]">
          <THead>
            <TH width={`${CHECK_COL_PX}px`} align="center" stickyLeft className="!border-r-0">
              <RowCheckbox
                checked={selection.allSelected}
                indeterminate={selection.someSelected}
                onChange={selection.toggleAll}
                label="Обрати всі"
              />
            </TH>
            <SortableTH
              columnKey="name"
              sort={sort}
              onSort={toggle}
              stickyLeft={NAME_COL_LEFT}
              className="is-pinned-left-edge"
            >
              Виріб
            </SortableTH>
            {showPrices
              ? priceTiers.map((qty, index) => (
                  <SortableTH
                    key={qty}
                    columnKey={`price:${qty}`}
                    sort={sort}
                    onSort={toggle}
                    align="right"
                    width="88px"
                    title={`Ціна ₴/шт при тиражі від ${qty} шт`}
                    className={cn(index === 0 && "border-l border-[var(--color-divider)]")}
                  >
                    <span className="block normal-case tracking-normal">
                      <span className="block text-[10px] font-normal text-[var(--color-text-quiet)]">
                        від
                      </span>
                      <span className="tabular text-[12px] font-semibold text-[var(--color-text-secondary)]">
                        {formatTierLabel(qty)}
                      </span>
                    </span>
                  </SortableTH>
                ))
              : null}
            <SortableTH columnKey="status" sort={sort} onSort={toggle}>
              Стан
            </SortableTH>
            <SortableTH
              columnKey="updated"
              sort={sort}
              onSort={toggle}
              align="right"
              width="88px"
              stickyRight
              title="Дата останньої зміни"
            >
              Змінено
            </SortableTH>
          </THead>
          <TBody>
            {sorted.length === 0 ? (
              <TableEmpty
                colSpan={colSpan}
                title={empty.title}
                description={empty.description}
                action={empty.action}
              />
            ) : (
              sorted.map((product) => {
                const isSelected = selection.isSelected(product.id);
                const isPinned = pinnedSet.has(product.id);
                return (
                  <TR key={product.id} selected={isSelected}>
                    <TD align="center" stickyLeft className="!border-r-0">
                      <RowCheckbox
                        checked={isSelected}
                        onChange={() => selection.toggleOne(product.id)}
                        label={`Обрати ${product.nameUk}`}
                      />
                    </TD>
                    <TD stickyLeft={NAME_COL_LEFT} className="is-pinned-left-edge">
                      <div className="flex min-w-0 items-start gap-1.5">
                        {isPinned ? (
                          <span
                            className="mt-0.5 shrink-0 text-[var(--color-primary-700)]"
                            title="Закріплено зверху"
                          >
                            <IconPin size={13} />
                          </span>
                        ) : null}
                        <CellStack
                          title={product.nameUk}
                          subtitle={
                            <>
                              {product.isBaseModel ? (
                                <span className="text-[var(--color-primary-700)]">Базова модель</span>
                              ) : null}
                              {product.isBaseModel && product.internalCode ? " · " : null}
                              {product.internalCode ?? undefined}
                            </>
                          }
                          href={`/products/${product.id}`}
                          maxWidth="240px"
                        />
                      </div>
                    </TD>
                    {showPrices
                      ? priceTiers.map((qty, index) => {
                          const price = priceAtTier(product, qty);
                          const emphasize = qty === highlightTier;
                          return (
                            <TD
                              key={`${product.id}-${qty}`}
                              numeric
                              nowrap
                              className={cn(
                                index === 0 && "border-l border-[var(--color-divider)]",
                                !product.ready && "text-[var(--color-text-tertiary)]",
                                emphasize &&
                                  product.ready &&
                                  "font-medium text-[var(--color-text-primary)]",
                              )}
                              title={
                                product.ready && price != null
                                  ? `${formatTierLabel(qty)} · ${formatAmount(Number(price))} ₴/шт`
                                  : undefined
                              }
                            >
                              {product.ready && price != null ? formatAmount(Number(price)) : "—"}
                            </TD>
                          );
                        })
                      : null}
                    <TD nowrap>
                      <StatusBadge dot tone={product.ready ? "success" : "warning"}>
                        {product.ready ? "Готовий" : "Комплектація"}
                      </StatusBadge>
                    </TD>
                    <TD align="right" nowrap stickyRight>
                      <span
                        className="tabular text-[12.5px] text-[var(--color-text-secondary)]"
                        title={
                          product.updatedAt
                            ? new Date(product.updatedAt).toLocaleString("uk-UA")
                            : undefined
                        }
                      >
                        {formatDateShortUk(product.updatedAt)}
                      </span>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </table>
      </div>
    </div>
  );
}
