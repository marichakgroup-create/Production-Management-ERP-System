/** Shared shape for legal / banking реквізити under a client. */
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
    nameUk: nameUk || "Реквізити",
    details,
    isPrimary: Boolean(raw.isPrimary),
  };
}
