import type { FabricUnitMode } from "@/lib/fabric-pricing";

/** Short unit for thresholds / qty captions (Межа роздробу), from BOM unit. */
export function materialQtyUnitShort(unitMode: FabricUnitMode | string): string {
  switch (unitMode) {
    case "m":
    case "m2":
      return "м";
    case "kg":
      return "кг";
    case "cone":
      return "од.";
    default:
      return "шт";
  }
}

/** Labels for pack content + purchase quote, driven by BOM consumption unit. */
export function materialPackLabels(unitMode: FabricUnitMode | string) {
  switch (unitMode) {
    case "m":
    case "m2":
      return {
        contentLabel: "Довжина",
        eachQuote: "м",
        packQuote: "уп.",
        packPriceLabel: "Ціна упаковки",
        packPriceEmptyHint: "Спочатку вкажіть довжину на матеріалі",
        unitSuffixUah: "₴/м",
        unitSuffixUsd: "$/м",
        packSuffixUah: "₴",
        packSuffixUsd: "$",
        showUnitsPerKg: false,
      };
    case "cone":
      return {
        contentLabel: "Од. в упаковці",
        eachQuote: "од.",
        packQuote: "уп.",
        packPriceLabel: "Ціна упаковки",
        packPriceEmptyHint: "Спочатку вкажіть вміст упаковки на матеріалі",
        unitSuffixUah: "₴/од.",
        unitSuffixUsd: "$/од.",
        packSuffixUah: "₴",
        packSuffixUsd: "$",
        showUnitsPerKg: false,
      };
    case "kg":
      return {
        contentLabel: "Од. в упаковці",
        eachQuote: "кг",
        packQuote: "уп.",
        packPriceLabel: "Ціна упаковки",
        packPriceEmptyHint: "Спочатку вкажіть вміст упаковки на матеріалі",
        unitSuffixUah: "₴/кг",
        unitSuffixUsd: "$/кг",
        packSuffixUah: "₴",
        packSuffixUsd: "$",
        showUnitsPerKg: false,
      };
    default:
      return {
        contentLabel: "Шт в упаковці",
        eachQuote: "шт",
        packQuote: "уп.",
        packPriceLabel: "Ціна упаковки",
        packPriceEmptyHint: "Спочатку вкажіть «Шт в упаковці» на матеріалі",
        unitSuffixUah: "₴/шт",
        unitSuffixUsd: "$/шт",
        packSuffixUah: "₴",
        packSuffixUsd: "$",
        showUnitsPerKg: true,
      };
  }
}

/** Hide archived/demo units from pickers (бобіна → use м + довжина). */
export function isSelectableMaterialUnit(unit: { label: string; code?: string | null }) {
  const code = String(unit.code ?? "")
    .trim()
    .toLowerCase();
  const label = String(unit.label ?? "")
    .trim()
    .toLowerCase();
  if (code === "cone") return false;
  if (label.includes("бобін")) return false;
  return true;
}
