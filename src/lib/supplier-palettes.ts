/**
 * Locked supplier color catalogs — pick only from these labels in settings / BOM.
 */

import { mergeColorLists, normalizeColorLabel } from "@/lib/trim-colors";

/** Full Зейджан fabric palette (source of truth for all Zeydjan material offers). */
export const ZEYDJAN_COLOR_CATALOG: string[] = [
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

const LOCKED_SUPPLIER_CATALOGS: Array<{
  match: RegExp;
  catalog: string[];
}> = [{ match: /^зейдж/i, catalog: ZEYDJAN_COLOR_CATALOG }];

export function lockedSupplierCatalog(supplierNameUk: string | null | undefined): string[] | null {
  const name = (supplierNameUk ?? "").replace(/\s+/g, " ").trim();
  if (!name) return null;
  for (const row of LOCKED_SUPPLIER_CATALOGS) {
    if (row.match.test(name)) return mergeColorLists(row.catalog);
  }
  return null;
}

export function isLockedSupplierPalette(supplierNameUk: string | null | undefined): boolean {
  return lockedSupplierCatalog(supplierNameUk) != null;
}

/** Catalog pool for the editor: locked supplier → fixed list; else free presets. */
export function paletteCatalogForSupplier(
  supplierNameUk: string | null | undefined,
  freePresets: string[],
): { colors: string[]; locked: boolean } {
  const locked = lockedSupplierCatalog(supplierNameUk);
  if (locked) return { colors: locked, locked: true };
  return { colors: mergeColorLists(freePresets), locked: false };
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
