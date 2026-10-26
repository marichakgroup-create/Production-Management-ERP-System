"use client";

import { ContactCard, ContactCardsGrid, type ContactField } from "@/components/contacts/ContactCard";
import {
  PartyPeopleEditor,
  type PartyPersonRow,
} from "@/components/contacts/PartyPeopleEditor";
import { updateSupplierContactAction } from "@/server/domains/catalog/supplier-contact-actions";

export type SupplierCardRow = {
  id: string;
  nameUk: string;
  contactPerson: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  note: string | null;
  materialsCount: number;
  contacts: PartyPersonRow[];
};

export function SupplierContactCards({
  rows,
  canEdit,
}: {
  rows: SupplierCardRow[];
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
            placeholder: "Умови, терміни…",
          },
        ];

        return (
          <ContactCard
            key={row.id}
            title={row.nameUk}
            titleKey="nameUk"
            meta={`${row.materialsCount} мат.`}
            disabled={!canEdit}
            fields={fields}
            below={
              <PartyPeopleEditor
                kind="supplier"
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
              const result = await updateSupplierContactAction(formData);
              return { ok: result.ok, error: result.ok ? undefined : result.error };
            }}
          />
        );
      })}
    </ContactCardsGrid>
  );
}
