/** Snapshot shape written by saveProposal / read by activateProposal. */

export type ProposalItemSnapshot = {
  productId?: string | null;
  sourceProductId?: string | null;
  nameUk: string;
  totalQuantity: number;
  comment?: string | null;
  sewerCountOverride?: number | null;
  fabricDeliveryAmount?: number | null;
  fabricDeliveryComputed?: number | null;
  fabricDeliveryManual?: boolean | null;
  sizes: Array<{
    sizeCode: string;
    sizeNameUk: string;
    quantity: number;
  }>;
  materials: Array<Record<string, unknown>>;
  operations: Array<Record<string, unknown>>;
  decorations: Array<Record<string, unknown>>;
  additionalCosts: Array<Record<string, unknown>>;
};

export type ProposalVersionSnapshot = {
  item?: ProposalItemSnapshot | null;
  calc?: unknown;
  pricing?: unknown;
  commercial?: unknown;
  manualSellingPricePerUnit?: number | null;
  proposalRevision?: number | null;
  fixedCosts?: unknown;
};

function num(value: unknown, fallback = 0): number {
  if (value == null || value === "") return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function str(value: unknown): string | null {
  if (value == null) return null;
  const s = String(value).trim();
  return s || null;
}

/** Normalize prisma/json row into a create-payload for OrderItemSize. */
export function snapshotSizes(raw: unknown): ProposalItemSnapshot["sizes"] {
  if (!Array.isArray(raw)) return [];
  return raw.map((row) => {
    const r = row as Record<string, unknown>;
    return {
      sizeCode: String(r.sizeCode ?? ""),
      sizeNameUk: String(r.sizeNameUk ?? r.sizeCode ?? ""),
      quantity: Math.max(0, Math.round(num(r.quantity))),
    };
  }).filter((row) => row.sizeCode);
}

export function parseProposalItemSnapshot(raw: unknown): ProposalItemSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const root = raw as ProposalVersionSnapshot;
  const item = root.item;
  if (!item || typeof item !== "object") return null;
  const nameUk = str(item.nameUk);
  if (!nameUk) return null;
  const sizes = snapshotSizes(item.sizes);
  if (sizes.length === 0) return null;
  return {
    productId: str(item.productId) ?? null,
    sourceProductId: str(item.sourceProductId) ?? null,
    nameUk,
    totalQuantity: Math.max(
      0,
      Math.round(num(item.totalQuantity, sizes.reduce((s, x) => s + x.quantity, 0))),
    ),
    comment: str(item.comment),
    sewerCountOverride:
      item.sewerCountOverride == null
        ? null
        : Math.round(num(item.sewerCountOverride)),
    fabricDeliveryAmount: num(item.fabricDeliveryAmount, 0),
    fabricDeliveryComputed:
      item.fabricDeliveryComputed == null ? null : num(item.fabricDeliveryComputed),
    fabricDeliveryManual: Boolean(item.fabricDeliveryManual),
    sizes,
    materials: Array.isArray(item.materials) ? (item.materials as Array<Record<string, unknown>>) : [],
    operations: Array.isArray(item.operations)
      ? (item.operations as Array<Record<string, unknown>>)
      : [],
    decorations: Array.isArray(item.decorations)
      ? (item.decorations as Array<Record<string, unknown>>)
      : [],
    additionalCosts: Array.isArray(item.additionalCosts)
      ? (item.additionalCosts as Array<Record<string, unknown>>)
      : [],
  };
}

export function proposalSnapshotRestorable(snapshotJson: unknown): boolean {
  const item = parseProposalItemSnapshot(snapshotJson);
  if (!item) return false;
  // Need either a catalog link or enough BOM rows to rebuild the line.
  return Boolean(item.productId || item.sourceProductId || item.materials.length > 0);
}

export function materialCreateFromSnapshot(row: Record<string, unknown>, sortOrder: number) {
  return {
    materialId: str(row.materialId),
    nameSnapshot: String(row.nameSnapshot ?? "Матеріал"),
    unitCodeSnapshot: String(row.unitCodeSnapshot ?? "шт"),
    consumptionPerUnit: num(row.consumptionPerUnit),
    wastePercent: num(row.wastePercent),
    purchasePrice: num(row.purchasePrice),
    actualPurchasePrice:
      row.actualPurchasePrice == null ? null : num(row.actualPurchasePrice),
    supplierId: str(row.supplierId),
    supplierNameSnapshot: str(row.supplierNameSnapshot),
    colorSnapshot: str(row.colorSnapshot),
    deliveryType: (str(row.deliveryType) as
      | "CARGO"
      | "NP_STANDARD"
      | "NP_VOLUME"
      | null) ?? null,
    cargoUsdPerKg: row.cargoUsdPerKg == null ? null : num(row.cargoUsdPerKg),
    usdUahRate: row.usdUahRate == null ? null : num(row.usdUahRate),
    costVatOverride: (str(row.costVatOverride) as "NET" | "GROSS" | null) ?? null,
    fabricDeliveryAmount: num(row.fabricDeliveryAmount, 0),
    fabricDeliveryComputed:
      row.fabricDeliveryComputed == null ? null : num(row.fabricDeliveryComputed),
    fabricDeliveryManual: Boolean(row.fabricDeliveryManual),
    minWholesaleMetersOverride:
      row.minWholesaleMetersOverride == null ? null : num(row.minWholesaleMetersOverride),
    sortOrder: row.sortOrder == null ? sortOrder : Math.round(num(row.sortOrder, sortOrder)),
    sizeCode: str(row.sizeCode),
  };
}

export function operationCreateFromSnapshot(row: Record<string, unknown>, sortOrder: number) {
  return {
    operationId: str(row.operationId),
    nameSnapshot: String(row.nameSnapshot ?? "Операція"),
    calculationMethod: (str(row.calculationMethod) as
      | "UNIT_RATE"
      | "SHIFT_OUTPUT"
      | "QUANTITY_TIER"
      | null) ?? "UNIT_RATE",
    unitRate: row.unitRate == null ? null : num(row.unitRate),
    shiftCost: row.shiftCost == null ? null : num(row.shiftCost),
    standardOutput: row.standardOutput == null ? null : num(row.standardOutput),
    sortOrder: row.sortOrder == null ? sortOrder : Math.round(num(row.sortOrder, sortOrder)),
    sizeCode: str(row.sizeCode),
  };
}

export function decorationCreateFromSnapshot(row: Record<string, unknown>, sortOrder: number) {
  return {
    decorationMethodId: str(row.decorationMethodId),
    nameSnapshot: String(row.nameSnapshot ?? "Оздоблення"),
    setupCost: num(row.setupCost),
    unitRate: num(row.unitRate),
    sortOrder: row.sortOrder == null ? sortOrder : Math.round(num(row.sortOrder, sortOrder)),
  };
}

export function additionalCostCreateFromSnapshot(row: Record<string, unknown>) {
  return {
    nameUk: String(row.nameUk ?? "Додатково"),
    amount: num(row.amount),
    isPerUnit: row.isPerUnit == null ? true : Boolean(row.isPerUnit),
  };
}
