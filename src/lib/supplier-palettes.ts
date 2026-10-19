/**
 * Shared fabric/trim color pick-list for every supplier offer.
 * Each material keeps its own selected subset in MaterialSupplier.availableColors.
 */

import { mergeColorLists, normalizeColorLabel, TRIM_COLOR_SWATCHES } from "@/lib/trim-colors";

/** Full fabric palette (originally Зейджан) — available to all suppliers. */
export const FABRIC_COLOR_CATALOG: string[] = [
  "Чорний",
  "Білий",
  "Шампань",
  "Світлий меланж",
  "Банановий",
  "Меланж малина",
  "Меланж блакитний",
  "Меланж беж",
  "Меланж капучино",
  "Таш",
  "Бежевий",
  "Візон",
  "Світлий візон",
  "Темний візон",
  "Капучино",
  "Гірчиця",
  "Жовтий лимон",
  "Жовтий жовток",
  "Світлий лимон",
  "Койот",
  "Фіолетовий",
  "Темний фіолет",
  "Бузковий мор",
  "Бузковий мор світліше",
  "Брудно рожевий",
  "Ліловий",
  "Світло ліловий",
  "Чайка",
  "Бордо",
  "Вишня",
  "Червоний світлий",
  "Червоний темний",
  "Малина",
  "Рожевий",
  "Світло-рожевий",
  "Пудра",
  "Оранж",
  "Персик",
  "Корал",
  "Цегла",
  "Ірис",
  "Морська хвиля",
  "Оболонь",
  "Світлий хакі",
  "Темний хакі",
  "Зелена трава",
  "Салатовий",
  "Смарагд",
  "Світлий смарагд",
  "Олива",
  "Світла олива",
  "Мінт світлий",
  "Ментол",
  "Блакитний",
  "Блакитний світлий",
  "Бірюза",
  "Марсала",
  "Бірюза №2",
  "Волошка",
  "Світлий джинс",
  "Темний джинс",
  "Темно-синій",
  "Світло-сірий",
  "Сірий",
  "Сірий олива",
  "Сірий грі світлий",
  "Сірий грі",
  "Темний меланж №2",
  "Темний меланж",
  "Вершковий",
  "Темний таш",
  "Фісташка",
  "Світлий ірис",
  "Теракотовий",
  "Коричневий",
  "Шоколад",
  "Аметичтовий",
  "Штормове море",
  "Темна оболонь",
];

/** @deprecated Use FABRIC_COLOR_CATALOG — kept for older imports. */
export const ZEYDJAN_COLOR_CATALOG = FABRIC_COLOR_CATALOG;

/** Universal pick-list: fabric catalog + trim presets (Navy, нікель, …). */
export function sharedColorPickList(extraPresets: string[] = []): string[] {
  return mergeColorLists(
    FABRIC_COLOR_CATALOG,
    TRIM_COLOR_SWATCHES.map((row) => row.label),
    extraPresets,
  );
}

/**
 * Catalog pool for the palette editor — same list for every supplier (incl. new ones).
 * `locked` is always false: selection is per-material, not forced.
 */
export function paletteCatalogForSupplier(
  _supplierNameUk?: string | null,
  freePresets: string[] = [],
): { colors: string[]; locked: boolean } {
  return { colors: sharedColorPickList(freePresets), locked: false };
}

/** @deprecated No supplier is palette-locked anymore; kept for call-site compatibility. */
export function lockedSupplierCatalog(_supplierNameUk?: string | null): string[] | null {
  return null;
}

/** @deprecated Always false — full catalog is shared, selection is per material. */
export function isLockedSupplierPalette(_supplierNameUk?: string | null): boolean {
  return false;
}

export function filterUnusedCatalogColors(catalog: string[], selected: string[]): string[] {
  const taken = new Set(
    selected
      .map((row) => normalizeColorLabel(row)?.toLowerCase())
      .filter((row): row is string => Boolean(row)),
  );
  return catalog.filter((label) => {
    const key = normalizeColorLabel(label)?.toLowerCase();
    return key ? !taken.has(key) : false;
  });
}
