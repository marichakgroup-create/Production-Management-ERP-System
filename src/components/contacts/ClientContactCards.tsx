"use client";

import { ContactCard, ContactCardsGrid, type ContactField } from "@/components/contacts/ContactCard";
import {
  PartyPeopleEditor,
  type PartyPersonRow,
} from "@/components/contacts/PartyPeopleEditor";
import { updateClientAction } from "@/server/domains/clients/actions";

export type ClientCardRow = {
  id: string;
  companyName: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  legalDetails: string | null;
  note: string | null;
  ordersCount: number;
  contacts: PartyPersonRow[];
};

export function ClientContactCards({
  rows,
  canEdit,
}: {
  rows: ClientCardRow[];
  canEdit: boolean;
}) {
  if (rows.length === 0) return null;

  return (
    <ContactCardsGrid>
      {rows.map((row) => {
        const fields: ContactField[] = [
          {
            key: "phone",
            label: "Телефон компанії",
            value: row.phone ?? "",
            kind: "tel",
            placeholder: "+380",
          },
          {
            key: "email",
            label: "Email компанії",
            value: row.email ?? "",
            kind: "email",
          },
          {
            key: "website",
            label: "Сайт",
            value: row.website ?? "",
            placeholder: "https://",
          },
          {
            key: "note",
            label: "Нотатка",
            value: row.note ?? "",
            wide: true,
            placeholder: "Умови, домовленості…",
          },
        ];

        return (
          <ContactCard
            key={row.id}
            title={row.companyName}
            titleKey="companyName"
            href={`/clients/${row.id}`}
            detailLabel="Детальніше"
            meta={`${row.ordersCount} зам.`}
            disabled={!canEdit}
            fields={fields}
            below={
              <PartyPeopleEditor
                kind="client"
                partyId={row.id}
                people={row.contacts}
                canEdit={canEdit}
                dense
              />
            }
            onSave={async (values) => {
              const formData = new FormData();
              formData.set("id", row.id);
              for (const [key, value] of Object.entries(values)) {
                formData.set(key, value);
              }
              formData.set("contactPerson", row.contactPerson ?? "");
              formData.set("legalDetails", row.legalDetails ?? "");
              const result = await updateClientAction(formData);
              return { ok: result.ok, error: result.ok ? undefined : result.error };
            }}
          />
        );
      })}
    </ContactCardsGrid>
  );
}
