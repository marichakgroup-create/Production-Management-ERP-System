import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Currency style is avoided on purpose: Node and browser ICU render UAH
 * differently ("грн" vs "₴"), which desynchronises server and client output.
 */
export function formatMoneyUah(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  const amount = new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
  return `${amount} ₴`;
}

const unitLabels: Record<string, string> = {
  m: "м",
  m2: "м²",
  pcs: "шт",
  kg: "кг",
  l: "л",
  set: "компл.",
};

export function formatUnit(code: string): string {
  return unitLabels[code] ?? code;
}

/** Amount without a currency sign, for columns that name the currency in the header. */
export function formatAmount(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  return new Intl.NumberFormat("uk-UA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

/** Whole hryvnias for dense price/cut tables (kopiykas kept in calc, hidden in UI). */
export function formatAmountWhole(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(num)) return "—";
  return new Intl.NumberFormat("uk-UA", {
    maximumFractionDigits: 0,
  }).format(Math.round(num));
}

/** Whole-hryvnia amount for dense table cells, where kopiykas add noise. */
export function formatMoneyShort(value: number | string): string {
  const num = typeof value === "string" ? Number(value) : value;
  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 0 }).format(num)} ₴`;
}

/** Ukrainian has three plural forms: 1 крок, 2 кроки, 5 кроків. */
export function pluralUk(count: number, one: string, few: string, many: string): string {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

export function formatDateUk(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

/** Compact list date: DD.MM.YY */
export function formatDateShortUk(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "—";
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const yy = String(date.getFullYear()).slice(-2);
  return `${dd}.${mm}.${yy}`;
}

export function formatDateTimeUk(value: Date | string | null | undefined): string {
  if (!value) return "—";
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("uk-UA", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}
