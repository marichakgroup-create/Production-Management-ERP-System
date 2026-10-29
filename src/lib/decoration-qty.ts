import { isMiscDecorationCostName } from "@/lib/decoration-format-pricing";

export type DecorationQtyRow = {
  id?: string;
  name?: string | null;
  nameSnapshot?: string | null;
  quantity?: number | null;
};

function rowName(row: DecorationQtyRow): string {
  return String(row.nameSnapshot ?? row.name ?? "").trim();
}

/** Extra ₴/шт costs do not consume tirage slots. */
export function decorationOccupiesTirage(name: string | null | undefined): boolean {
  return !isMiscDecorationCostName(name);
}

export function decorationCostQuantity(
  row: DecorationQtyRow,
  itemQuantity: number,
): number {
  const itemQty = Math.max(0, Math.floor(Number(itemQuantity) || 0));
  if (row.quantity != null && Number.isFinite(row.quantity)) {
    return Math.max(0, Math.floor(row.quantity));
  }
  return itemQty;
}

export function decorationOccupiedQuantity(
  row: DecorationQtyRow,
  itemQuantity: number,
): number {
  if (!decorationOccupiesTirage(rowName(row))) return 0;
  return decorationCostQuantity(row, itemQuantity);
}

export function occupiedDecorationQty(
  rows: DecorationQtyRow[],
  itemQuantity: number,
  excludeId?: string | null,
): number {
  return rows.reduce((sum, row) => {
    if (excludeId && row.id === excludeId) return sum;
    return sum + decorationOccupiedQuantity(row, itemQuantity);
  }, 0);
}

export function remainingDecorationQty(
  rows: DecorationQtyRow[],
  itemQuantity: number,
  excludeId?: string | null,
): number {
  const itemQty = Math.max(0, Math.floor(Number(itemQuantity) || 0));
  return Math.max(0, itemQty - occupiedDecorationQty(rows, itemQty, excludeId));
}

export function decorationLineTotal(
  row: { setupCost: number; unitRate: number } & DecorationQtyRow,
  itemQuantity: number,
): number {
  return row.setupCost + row.unitRate * decorationCostQuantity(row, itemQuantity);
}
