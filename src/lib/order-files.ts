/** Internal limits for order attachments (artwork / documents). */
export const ORDER_FILE_MAX_BYTES = 50 * 1024 * 1024;
export const ORDER_FILE_MAX_COUNT = 20;

export const ORDER_FILE_MAX_MB = ORDER_FILE_MAX_BYTES / (1024 * 1024);

export const ORDER_FILE_ACCEPT =
  ".pdf,.png,.jpg,.jpeg,.webp,.gif,.svg,.tif,.tiff,.ai,.eps,.zip";

export const ORDER_FILE_EXTENSIONS = new Set([
  "pdf",
  "png",
  "jpg",
  "jpeg",
  "webp",
  "gif",
  "svg",
  "tif",
  "tiff",
  "ai",
  "eps",
  "zip",
]);

export function orderFileAllowed(file: { name: string; type: string }) {
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (ORDER_FILE_EXTENSIONS.has(ext)) return true;
  return (
    file.type.startsWith("image/") ||
    file.type === "application/pdf" ||
    file.type === "application/zip" ||
    file.type === "application/postscript"
  );
}

export type ArtworkDecorationFacts = {
  id: string;
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
  if (item.decorations && item.decorations.length > 0) return item.decorations;
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
