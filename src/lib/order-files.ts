import { isMiscDecorationCostName } from "@/lib/decoration-format-pricing";

/** Internal limits for order attachments (artwork / documents). */
export const ORDER_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const ORDER_FILE_MAX_COUNT = 20;

export const ORDER_FILE_MAX_MB = ORDER_FILE_MAX_BYTES / (1024 * 1024);

/** Print-shop artwork: raster, vector, layout, embroidery machines, archives. */
const ORDER_FILE_EXTENSION_LIST = [
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "bmp",
  "svg",
  "heic",
  "heif",
  "tif",
  "tiff",
  "psd",
  "psb",
  "ai",
  "eps",
  "cdr",
  "cdt",
  "indd",
  "idml",
  "afdesign",
  "afphoto",
  "afpub",
  "sketch",
  "xd",
  "dst",
  "pes",
  "exp",
  "jef",
  "zip",
  "rar",
  "7z",
] as const;

export const ORDER_FILE_EXTENSIONS = new Set<string>(ORDER_FILE_EXTENSION_LIST);

export const ORDER_FILE_ACCEPT = ORDER_FILE_EXTENSION_LIST.map((ext) => `.${ext}`).join(",");

const ORDER_FILE_MIME = new Set([
  "application/pdf",
  "application/postscript",
  "application/illustrator",
  "application/vnd.adobe.illustrator",
  "image/vnd.adobe.photoshop",
  "application/x-photoshop",
  "application/zip",
  "application/x-zip-compressed",
  "application/vnd.rar",
  "application/x-rar-compressed",
  "application/x-7z-compressed",
]);

/**
 * Storage object keys accept only a small ASCII set.
 * The name shown in the order and used for download stays the original file name.
 * Supabase: /^[A-Za-z0-9_/!.*'() &$=@;:+,?-]*$/
 */
const CYRILLIC_TO_LATIN: Record<string, string> = {
  а: "a",
  б: "b",
  в: "v",
  г: "h",
  ґ: "g",
  д: "d",
  е: "e",
  є: "ie",
  ж: "zh",
  з: "z",
  и: "y",
  і: "i",
  ї: "i",
  й: "i",
  к: "k",
  л: "l",
  м: "m",
  н: "n",
  о: "o",
  п: "p",
  р: "r",
  с: "s",
  т: "t",
  у: "u",
  ф: "f",
  х: "x",
  ц: "ts",
  ч: "ch",
  ш: "sh",
  щ: "shch",
  ь: "",
  ю: "iu",
  я: "ia",
  ё: "e",
  э: "e",
  ы: "y",
  ъ: "",
};

/** Latin letters that NFKD does not split into A–Z plus a mark. */
const LATIN_TO_ASCII: Record<string, string> = {
  æ: "ae",
  ø: "o",
  ö: "o",
  ß: "ss",
  ð: "d",
  þ: "th",
  đ: "d",
  ł: "l",
  œ: "oe",
  ı: "i",
  ħ: "h",
  ŋ: "ng",
  ŧ: "t",
  ĸ: "k",
  ƒ: "f",
  µ: "u",
};

const STORAGE_KEY = /^[A-Za-z0-9_/!.*'() &$=@;:+,?-]+$/;

function applyLetterMap(value: string, map: Record<string, string>): string {
  let out = "";
  for (const ch of value) {
    const mapped = map[ch.toLowerCase()];
    if (mapped === undefined) {
      out += ch;
      continue;
    }
    const replacement =
      ch === ch.toLowerCase() ? mapped : mapped.charAt(0).toUpperCase() + mapped.slice(1);
    out += replacement;
  }
  return out;
}

function foldStorageName(name: string): string {
  const folded = name.normalize("NFKC").normalize("NFKD").replace(/\p{M}/gu, "");
  return applyLetterMap(applyLetterMap(folded, CYRILLIC_TO_LATIN), LATIN_TO_ASCII)
    .replace(/[×✕✖]/g, "x")
    .replace(/[–—―−]/g, "-")
    .replace(/[“”„«»]/g, "'")
    .replace(/[‘’]/g, "'")
    .replace(/…/g, "...")
    .replace(/№/g, "No")
    .replace(/[•·]/g, "-")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F\u3000]/g, " ");
}

export function orderFileObjectName(name: string, ext: string): string {
  const safeExt = ext.toLowerCase().replace(/[^a-z0-9]/g, "") || "bin";
  const cleaned = foldStorageName(name)
    .replace(/[\\/]+/g, "_")
    .replace(/[^A-Za-z0-9_!.*'() &$=@;:+,?-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[\s_]+|[\s_]+$/g, "");
  const dot = cleaned.lastIndexOf(".");
  const rawStem = dot >= 0 ? cleaned.slice(0, dot) : cleaned;
  const rawExt = dot >= 0 ? cleaned.slice(dot + 1).replace(/[^A-Za-z0-9]/g, "") : "";
  const stem = rawStem.replace(/^[\s_.]+|[\s_.]+$/g, "").slice(0, 120);
  const extension = rawExt || safeExt;
  if (!stem || !/[A-Za-z0-9]/.test(stem)) return `file.${extension}`;
  const result = `${stem}.${extension}`;
  if (STORAGE_KEY.test(result)) return result;
  return `file.${safeExt}`;
}

export function orderFileAllowed(file: { name: string; type: string }) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ORDER_FILE_EXTENSIONS.has(ext)) return true;
  const type = file.type.toLowerCase();
  if (type.startsWith("image/")) return true;
  return ORDER_FILE_MIME.has(type);
}

export type ArtworkDecorationFacts = {
  id: string;
  /** When set, «Додаткові витрати» rows are ignored for artwork gates. */
  nameUk?: string | null;
};

export type ArtworkItemFacts = {
  id: string;
  decorationsCount: number;
  /** When present, readiness is checked per decoration slot. */
  decorations?: ArtworkDecorationFacts[];
};

export type ArtworkFileFacts = {
  orderItemId?: string | null;
  orderItemDecorationId?: string | null;
};

function decorationSlots(item: ArtworkItemFacts): ArtworkDecorationFacts[] {
  if (item.decorations && item.decorations.length > 0) {
    return item.decorations.filter((row) => !isMiscDecorationCostName(row.nameUk));
  }
  // Legacy callers without decoration ids: one virtual slot per item.
  if (item.decorationsCount > 0) return [{ id: `__item__:${item.id}` }];
  return [];
}

function fileCoversDecoration(
  item: ArtworkItemFacts,
  decorationId: string,
  files: ArtworkFileFacts[],
): boolean {
  if (decorationId.startsWith("__item__:")) {
    return files.some((file) => file.orderItemId === item.id);
  }
  if (files.some((file) => file.orderItemDecorationId === decorationId)) {
    return true;
  }
  // Item-linked file without decoration id still covers all slots on that item
  // when no decoration-linked files exist yet (migration / legacy uploads).
  const hasDecorationLinked = files.some(
    (file) => file.orderItemId === item.id && file.orderItemDecorationId,
  );
  if (hasDecorationLinked) return false;
  return files.some((file) => file.orderItemId === item.id && !file.orderItemDecorationId);
}

/**
 * Artwork gate for production:
 * - no decorations → ok
 * - only unlinked files (legacy) → ok if any file exists
 * - otherwise every decoration slot needs ≥1 file
 *   (falls back to per-item when decoration ids are absent)
 */
export function orderArtworkReady(
  items: ArtworkItemFacts[],
  files: ArtworkFileFacts[],
): boolean {
  const decorated = items.filter((item) => decorationSlots(item).length > 0);
  if (decorated.length === 0) return true;
  if (files.length === 0) return false;

  const linked = files.filter((file) => file.orderItemId || file.orderItemDecorationId);
  const unlinked = files.filter((file) => !file.orderItemId && !file.orderItemDecorationId);
  if (linked.length === 0 && unlinked.length > 0) return true;

  return decorated.every((item) =>
    decorationSlots(item).every((slot) => fileCoversDecoration(item, slot.id, files)),
  );
}

export function itemNeedsArtworkFile(
  item: ArtworkItemFacts,
  files: ArtworkFileFacts[],
): boolean {
  const slots = decorationSlots(item);
  if (slots.length === 0) return false;
  if (slots.every((slot) => fileCoversDecoration(item, slot.id, files))) return false;
  // Legacy unlinked files cover the whole order.
  const hasLinked = files.some((file) => file.orderItemId || file.orderItemDecorationId);
  if (!hasLinked && files.length > 0) return false;
  return true;
}

export function decorationNeedsArtworkFile(
  item: ArtworkItemFacts,
  decorationId: string,
  files: ArtworkFileFacts[],
): boolean {
  if (!decorationId) return false;
  if (fileCoversDecoration(item, decorationId, files)) return false;
  const hasLinked = files.some((file) => file.orderItemId || file.orderItemDecorationId);
  if (!hasLinked && files.length > 0) return false;
  return true;
}
