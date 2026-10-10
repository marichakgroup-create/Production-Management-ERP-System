import { resolveQuantityTierRate, type QuantityRateTier } from "@/lib/quantity-tiers";

/** Default qty ladder columns for the application-format matrix. */
export const DEFAULT_DECORATION_FORMAT_QTY_TIERS = [20, 50, 100, 200] as const;

export type DecorationFormatSeedRow = {
  nameUk: string;
  /** Rates aligned with DEFAULT_DECORATION_FORMAT_QTY_TIERS. */
  rates: [number, number, number, number];
};

/** Seed matrix from the commercial format×tirage price sheet. */
export const DEFAULT_DECORATION_FORMATS: DecorationFormatSeedRow[] = [
  { nameUk: "До 5 × 5 см", rates: [45, 35, 29, 25] },
  { nameUk: "До 10 × 10 см", rates: [55, 48, 43, 40] },
  { nameUk: "A6 — до 10 × 15 см", rates: [60, 55, 48, 45] },
  { nameUk: "A5 — до 15 × 21 см", rates: [80, 75, 68, 65] },
  { nameUk: "½ A4 — до 10 × 30 см", rates: [90, 85, 78, 75] },
  { nameUk: "A4 — до 21 × 30 см", rates: [110, 100, 95, 90] },
  { nameUk: "A3 — до 30 × 42 см", rates: [190, 175, 160, 150] },
];

export const DECORATION_FORMAT_NAME_PREFIX = "Нанесення · ";

export function decorationFormatLineName(formatNameUk: string): string {
  const name = formatNameUk.trim();
  if (!name) return DECORATION_FORMAT_NAME_PREFIX.trim();
  if (name.startsWith(DECORATION_FORMAT_NAME_PREFIX)) return name;
  return `${DECORATION_FORMAT_NAME_PREFIX}${name}`;
}

export function isDecorationFormatLineName(nameSnapshot: string | null | undefined): boolean {
  return Boolean(nameSnapshot?.startsWith(DECORATION_FORMAT_NAME_PREFIX));
}

/** Short label for UI (strips «Нанесення · » prefix when present). */
export function decorationDisplayName(nameSnapshot: string | null | undefined): string {
  const name = String(nameSnapshot ?? "").trim();
  if (!name) return "Нанесення";
  if (name.startsWith(DECORATION_FORMAT_NAME_PREFIX)) {
    return name.slice(DECORATION_FORMAT_NAME_PREFIX.length).trim() || name;
  }
  return name;
}

export function qtyTierColumnLabel(minQuantity: number, nextMin?: number | null): string {
  if (nextMin != null && nextMin > minQuantity) {
    return `${minQuantity}–${nextMin - 1} шт.`;
  }
  return `від ${minQuantity} шт.`;
}

export function decorationFormatTierColumns(
  mins: readonly number[] = DEFAULT_DECORATION_FORMAT_QTY_TIERS,
): Array<{ minQuantity: number; label: string }> {
  return mins.map((minQuantity, index) => ({
    minQuantity,
    label: qtyTierColumnLabel(minQuantity, mins[index + 1] ?? null),
  }));
}

export function resolveDecorationFormatRate(args: {
  quantity: number;
  tiers: QuantityRateTier[];
  fallbackRate?: number;
}): number {
  const tiers = [...args.tiers].sort((a, b) => a.minQuantity - b.minQuantity);
  const fallback =
    args.fallbackRate != null && Number.isFinite(args.fallbackRate)
      ? args.fallbackRate
      : tiers[0]?.ratePerUnit ?? 0;
  return resolveQuantityTierRate({
    quantity: args.quantity,
    tiers,
    fallbackRate: fallback,
  });
}

export function mapDecorationFormatTiers(
  rows: Array<{ minQuantity: number; unitRate: unknown }> | null | undefined,
): QuantityRateTier[] {
  if (!rows?.length) return [];
  return rows.map((row) => ({
    minQuantity: row.minQuantity,
    ratePerUnit: Number(row.unitRate),
  }));
}
