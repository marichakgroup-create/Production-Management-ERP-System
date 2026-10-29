import { resolveQuantityTierRate, type QuantityRateTier } from "@/lib/quantity-tiers";

export type DecorationFormatKind = "DTF" | "EMBROIDERY";

/** Default qty ladder columns for the DTF format matrix. */
export const DEFAULT_DECORATION_FORMAT_QTY_TIERS = [20, 50, 100, 200] as const;

/** Default qty ladder for embroidery (20–49 / від 50). */
export const DEFAULT_EMBROIDERY_FORMAT_QTY_TIERS = [20, 50] as const;

export type DecorationFormatSeedRow = {
  nameUk: string;
  /** Rates aligned with DEFAULT_DECORATION_FORMAT_QTY_TIERS. */
  rates: [number, number, number, number];
};

export type EmbroideryFormatSeedRow = {
  nameUk: string;
  detailUk: string;
  /** Rates aligned with DEFAULT_EMBROIDERY_FORMAT_QTY_TIERS. */
  rates: [number, number];
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

/** Commercial embroidery price sheet (₴/шт). */
export const DEFAULT_EMBROIDERY_FORMATS: EmbroideryFormatSeedRow[] = [
  { nameUk: "Малий логотип", detailUk: "До 5 × 5 см", rates: [55, 50] },
  { nameUk: "Логотип на грудях / рукаві", detailUk: "До 10 × 5 см", rates: [70, 60] },
  { nameUk: "Збільшений логотип на грудях", detailUk: "До 10 × 10 см", rates: [100, 80] },
  { nameUk: "Видовжений напис на спині", detailUk: "До 25 × 5 см", rates: [120, 100] },
  { nameUk: "Великий логотип на спині", detailUk: "До 25 × 10 см", rates: [180, 160] },
];

export const DECORATION_FORMAT_NAME_PREFIX = "Нанесення · ";
export const EMBROIDERY_FORMAT_NAME_PREFIX = "Нанесення · Вишивка · ";

export function defaultQtyTiersForKind(kind: DecorationFormatKind): readonly number[] {
  return kind === "EMBROIDERY"
    ? DEFAULT_EMBROIDERY_FORMAT_QTY_TIERS
    : DEFAULT_DECORATION_FORMAT_QTY_TIERS;
}

export function decorationKindLabel(kind: DecorationFormatKind): string {
  return kind === "EMBROIDERY" ? "Вишивка" : "DTF Друк";
}

export function formatCatalogDisplayName(nameUk: string, detailUk?: string | null): string {
  const name = nameUk.trim();
  const detail = String(detailUk ?? "").trim();
  if (!detail) return name;
  return `${name} (${detail})`;
}

/** Sentinel in the order format picker — not a catalog format. */
export const MISC_DECORATION_OPTION_VALUE = "__misc_extra__";

/** Snapshot name for unplanned decoration costs (unitRate × tirage). */
export const MISC_DECORATION_COST_NAME = "Додаткові витрати";

export function isMiscDecorationCostName(nameSnapshot: string | null | undefined): boolean {
  return String(nameSnapshot ?? "").trim() === MISC_DECORATION_COST_NAME;
}

export function decorationFormatLineName(
  formatNameUk: string,
  opts?: { kind?: DecorationFormatKind | string | null; detailUk?: string | null },
): string {
  const prefix =
    opts?.kind === "EMBROIDERY" ? EMBROIDERY_FORMAT_NAME_PREFIX : DECORATION_FORMAT_NAME_PREFIX;
  const display = formatCatalogDisplayName(formatNameUk, opts?.detailUk);
  if (!display) return prefix.trim();
  if (display.startsWith(EMBROIDERY_FORMAT_NAME_PREFIX) || display.startsWith(DECORATION_FORMAT_NAME_PREFIX)) {
    return display;
  }
  return `${prefix}${display}`;
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
