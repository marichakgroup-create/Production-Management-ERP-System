"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Field";
import { OrderPartyDetails } from "@/components/orders/OrderPartyDetails";
import { updateOrderClientPartyAction } from "@/server/domains/orders/actions";

type ContactOption = {
  id: string;
  nameUk: string;
  roleUk?: string | null;
  phone?: string | null;
  email?: string | null;
  isPrimary?: boolean;
};

type LegalOption = {
  id: string;
  nameUk: string;
  details?: string | null;
  isPrimary?: boolean;
};

export function OrderClientPartyFields({
  orderId,
  canEdit,
  contacts,
  legalEntities,
  selectedContactId,
  selectedLegalId,
  fallbackPhone,
  fallbackEmail,
  website,
  fallbackLegalDetails,
  note,
}: {
  orderId: string;
  canEdit: boolean;
  contacts: ContactOption[];
  legalEntities: LegalOption[];
  selectedContactId: string | null;
  selectedLegalId: string | null;
  fallbackPhone?: string | null;
  fallbackEmail?: string | null;
  website?: string | null;
  fallbackLegalDetails?: string | null;
  note?: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const contactId = selectedContactId ?? "";
  const legalId = selectedLegalId ?? "";
  const selectedContact = useMemo(
    () => contacts.find((row) => row.id === contactId) ?? null,
    [contacts, contactId],
  );
  const selectedLegal = useMemo(
    () => legalEntities.find((row) => row.id === legalId) ?? null,
    [legalEntities, legalId],
  );

  function save(patch: { clientContactId?: string; clientLegalDetailId?: string }) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    if (patch.clientContactId !== undefined) {
      formData.set("clientContactId", patch.clientContactId);
    }
    if (patch.clientLegalDetailId !== undefined) {
      formData.set("clientLegalDetailId", patch.clientLegalDetailId);
    }
    startTransition(async () => {
      await updateOrderClientPartyAction(formData);
      router.refresh();
    });
  }

  const phone = selectedContact?.phone?.trim() || fallbackPhone?.trim() || null;
  const email = selectedContact?.email?.trim() || fallbackEmail?.trim() || null;
  const legalDetails = selectedLegal?.details?.trim() || fallbackLegalDetails?.trim() || null;

  return (
    <div className="grid items-start gap-3 sm:grid-cols-2">
      {contacts.length > 0 ? (
        <Select
          label="Відповідальний"
          size="sm"
          disabled={!canEdit || pending}
          value={contactId}
          hideSelectedDescription
          onChange={(event) => save({ clientContactId: event.target.value })}
        >
          <option value="">Не вказано</option>
          {contacts.map((person) => (
            <option
              key={person.id}
              value={person.id}
              data-description={
                [
                  person.roleUk?.trim() || null,
                  person.isPrimary ? "основний" : null,
                  person.phone?.trim() || null,
                ]
                  .filter(Boolean)
                  .join(" · ") || undefined
              }
            >
              {person.nameUk}
            </option>
          ))}
        </Select>
      ) : (
        <p className="type-body-secondary sm:col-span-2">Немає контактних осіб у картці клієнта.</p>
      )}

      {legalEntities.length > 0 ? (
        <div className="min-w-0">
          <Select
            label="IBAN"
            size="sm"
            disabled={!canEdit || pending}
            value={legalId}
            hideSelectedDescription
            onChange={(event) => save({ clientLegalDetailId: event.target.value })}
          >
            <option value="">Не вказано</option>
            {legalEntities.map((row) => (
              <option
                key={row.id}
                value={row.id}
                data-description={
                  [row.isPrimary ? "основні" : null, row.details?.replace(/\s+/g, " ").trim() || null]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
              >
                {row.nameUk}
              </option>
            ))}
          </Select>
        </div>
      ) : (
        <p className="type-body-secondary">Немає IBAN у картці клієнта.</p>
      )}

      <div className="sm:col-span-2">
        <OrderPartyDetails
          rows={[
            { label: "Посада", value: selectedContact?.roleUk },
            { label: "Телефон", value: phone },
            { label: "Email", value: email },
            { label: "Сайт", value: website },
            { label: "IBAN", value: legalDetails, code: true },
            { label: "Примітка", value: note },
          ]}
        />
      </div>
    </div>
  );
}
