export type ArtworkSizeQty = { sizeCode: string; quantity: number };

export function parseFileSizeQuantities(raw: unknown): ArtworkSizeQty[] {
  if (!Array.isArray(raw)) return [];
  const byCode = new Map<string, number>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const sizeCode = String((row as { sizeCode?: unknown }).sizeCode ?? "").trim();
    const quantity = Math.max(0, Math.floor(Number((row as { quantity?: unknown }).quantity) || 0));
    if (!sizeCode || quantity <= 0) continue;
    byCode.set(sizeCode, (byCode.get(sizeCode) ?? 0) + quantity);
  }
  return [...byCode.entries()].map(([sizeCode, quantity]) => ({ sizeCode, quantity }));
}

export function fileAllocatedPieces(file: {
  pieceQuantity?: number | null;
  sizeQuantities?: unknown;
}): number {
  const sized = parseFileSizeQuantities(file.sizeQuantities);
  if (sized.length > 0) {
    return sized.reduce((sum, row) => sum + row.quantity, 0);
  }
  return Math.max(0, Math.floor(Number(file.pieceQuantity) || 0));
}

export function decorationAllocatedPieces(
  files: Array<{ pieceQuantity?: number | null; sizeQuantities?: unknown }>,
): number {
  return files.reduce((sum, file) => sum + fileAllocatedPieces(file), 0);
}
