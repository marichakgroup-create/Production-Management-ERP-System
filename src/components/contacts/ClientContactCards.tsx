import {
  ContactCardsGrid,
  ContactSummaryCard,
} from "@/components/contacts/ContactSummaryCard";
import type { PartyPersonRow } from "@/components/contacts/PartyPeopleEditor";

export type ClientCardRow = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  ordersCount: number;
  contacts: PartyPersonRow[];
  legalEntitiesCount: number;
};

function primaryPerson(row: ClientCardRow) {
  return row.contacts.find((person) => person.isPrimary) ?? row.contacts[0] ?? null;
}

export function ClientContactCards({ rows }: { rows: ClientCardRow[] }) {
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
          `${row.ordersCount} зам.`,
          row.contacts.length > 0 ? `${row.contacts.length} осіб` : null,
          row.legalEntitiesCount > 0 ? `${row.legalEntitiesCount} рекв.` : null,
        ].filter(Boolean) as string[];

        return (
          <ContactSummaryCard
            key={row.id}
            href={`/clients/${row.id}`}
            title={row.companyName}
            primaryLine={primaryLine}
            secondaryLine={secondaryLine}
            meta={meta}
          />
        );
      })}
    </ContactCardsGrid>
  );
}
