/** Shared shape for people under a client or supplier company. */
export type PartyContactInput = {
  nameUk: string;
  roleUk?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
};

export function normalizePartyContact(raw: PartyContactInput): PartyContactInput | null {
  const nameUk = String(raw.nameUk ?? "").replace(/\s+/g, " ").trim();
  if (!nameUk) return null;
  const roleUk = String(raw.roleUk ?? "").trim() || null;
  const phone = String(raw.phone ?? "").trim() || null;
  const email = String(raw.email ?? "").trim() || null;
  return {
    nameUk,
    roleUk,
    phone,
    email,
    isPrimary: Boolean(raw.isPrimary),
  };
}

export function formatPartyContactLabel(row: {
  nameUk: string;
  roleUk?: string | null;
  phone?: string | null;
}): string {
  const role = row.roleUk?.trim();
  const phone = row.phone?.trim();
  const bits = [row.nameUk.trim(), role || null, phone || null].filter(Boolean);
  return bits.join(" · ");
}
