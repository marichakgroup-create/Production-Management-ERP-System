/** Manager-entered total run before admin breaks it down by size. */
export const ORIENTATIVE_TIRAGE_SIZE_CODE = "ONE";
export const ORIENTATIVE_TIRAGE_NAME_UK = "Тираж (орієнтовно)";

export type OrderSizeLine = {
  sizeCode: string;
  sizeNameUk: string;
  quantity: number;
};

export function isOrientativeTirageSize(
  size: Pick<OrderSizeLine, "sizeCode" | "sizeNameUk">,
): boolean {
  return (
    size.sizeCode === ORIENTATIVE_TIRAGE_SIZE_CODE &&
    size.sizeNameUk === ORIENTATIVE_TIRAGE_NAME_UK
  );
}

export function isRealSizeCode(sizeCode: string): boolean {
  return sizeCode !== ORIENTATIVE_TIRAGE_SIZE_CODE;
}

export function sizesQuantitySum(sizes: Array<{ quantity: number }>): number {
  return sizes.reduce((sum, row) => sum + (Number.isFinite(row.quantity) ? row.quantity : 0), 0);
}

/** Positive qty on real (non-ONE) size codes. */
export function realSizesQuantitySum(sizes: OrderSizeLine[]): number {
  return sizesQuantitySum(
    sizes.filter((row) => isRealSizeCode(row.sizeCode) && row.quantity > 0),
  );
}

/**
 * Position still needs a size breakdown before production handover.
 * Orientative ONE tirage always requires it; catalog-sized products without real sizes too.
 * Catalog-empty products («Без розміру») do not.
 */
export function itemNeedsSizeBreakdown(
  sizes: OrderSizeLine[],
  opts: { catalogHasSizes: boolean },
): boolean {
  if (sizes.some(isOrientativeTirageSize)) return true;
  if (!opts.catalogHasSizes) return false;
  const hasReal = sizes.some((row) => isRealSizeCode(row.sizeCode) && row.quantity > 0);
  return !hasReal;
}

/** Ready for production: no orientative tirage; catalog-sized lines have real sizes summing to total. */
export function itemSizeBreakdownReady(
  sizes: OrderSizeLine[],
  totalQuantity: number,
  opts: { catalogHasSizes: boolean },
): boolean {
  if (itemNeedsSizeBreakdown(sizes, opts)) return false;
  if (!opts.catalogHasSizes) return true;
  const realSum = realSizesQuantitySum(sizes);
  return realSum > 0 && realSum === totalQuantity;
}

/**
 * Full editable size grid for an order line: all product catalog sizes
 * (qty 0 if not yet on the line) plus any extra order-only codes.
 * Catalog order is preserved for display.
 */
export function mergeOrderSizesWithCatalog(
  orderSizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>,
  catalogSizes: Array<{ code: string; nameUk: string }> | null | undefined,
): OrderSizeLine[] {
  if (!catalogSizes?.length) {
    return orderSizes.map((row) => ({
      sizeCode: row.sizeCode,
      sizeNameUk: row.sizeNameUk,
      quantity: row.quantity,
    }));
  }

  const qtyByCode = new Map<string, number>();
  const nameByCode = new Map<string, string>();
  for (const row of orderSizes) {
    if (!isRealSizeCode(row.sizeCode)) continue;
    qtyByCode.set(row.sizeCode, row.quantity);
    nameByCode.set(row.sizeCode, row.sizeNameUk);
  }

  const result: OrderSizeLine[] = [];
  const seen = new Set<string>();
  for (const cat of catalogSizes) {
    const code = cat.code.trim();
    if (!code || seen.has(code)) continue;
    seen.add(code);
    result.push({
      sizeCode: code,
      sizeNameUk: nameByCode.get(code) ?? cat.nameUk,
      quantity: qtyByCode.get(code) ?? 0,
    });
  }
  for (const row of orderSizes) {
    if (!isRealSizeCode(row.sizeCode) || seen.has(row.sizeCode)) continue;
    seen.add(row.sizeCode);
    result.push({
      sizeCode: row.sizeCode,
      sizeNameUk: row.sizeNameUk,
      quantity: row.quantity,
    });
  }
  return result;
}
