/** Shared shape for a saved client bank account. */
export type ClientLegalDetailInput = {
  nameUk: string;
  details?: string | null;
  isPrimary?: boolean;
};

export function normalizeClientLegalDetail(
  raw: ClientLegalDetailInput,
): ClientLegalDetailInput | null {
  const nameUk = String(raw.nameUk ?? "").replace(/\s+/g, " ").trim();
  const details = String(raw.details ?? "").trim() || null;
  if (!nameUk && !details) return null;
  return {
    nameUk: nameUk || "IBAN",
    details,
    isPrimary: Boolean(raw.isPrimary),
  };
}
