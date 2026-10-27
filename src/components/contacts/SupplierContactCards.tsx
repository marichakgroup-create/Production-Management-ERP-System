import {
  ContactCardsGrid,
  ContactSummaryCard,
} from "@/components/contacts/ContactSummaryCard";
import type { PartyPersonRow } from "@/components/contacts/PartyPeopleEditor";

export type SupplierCardRow = {
  id: string;
  nameUk: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  materialsCount: number;
  contacts: PartyPersonRow[];
};

function primaryPerson(row: SupplierCardRow) {
  return row.contacts.find((person) => person.isPrimary) ?? row.contacts[0] ?? null;
}

export function SupplierContactCards({ rows }: { rows: SupplierCardRow[] }) {
  if (rows.length === 0) return null;

  return (
    <ContactCardsGrid>
      {rows.map((row) => {
        const person = primaryPerson(row);
        const name = person?.nameUk || row.contactPerson;
        const role = person?.roleUk?.trim();
        const phone = person?.phone || row.phone;
        const email = person?.email || row.email;
        const primaryLine = [name, role].filter(Boolean).join(" · ") || null;
        const secondaryLine = [phone, email].filter(Boolean).join(" · ") || null;
        const meta = [
          `${row.materialsCount} мат.`,
          row.contacts.length > 0 ? `${row.contacts.length} осіб` : null,
        ].filter(Boolean) as string[];

        return (
          <ContactSummaryCard
            key={row.id}
            href={`/clients/suppliers/${row.id}`}
            title={row.nameUk}
            primaryLine={primaryLine}
            secondaryLine={secondaryLine}
            meta={meta}
          />
        );
      })}
    </ContactCardsGrid>
  );
}
