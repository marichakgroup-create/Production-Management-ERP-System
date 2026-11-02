"use client";

import { useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Select } from "@/components/ui/Field";
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
}: {
  orderId: string;
  canEdit: boolean;
  contacts: ContactOption[];
  legalEntities: LegalOption[];
  selectedContactId: string | null;
  selectedLegalId: string | null;
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

  const phone = selectedContact?.phone?.trim() || null;
  const email = selectedContact?.email?.trim() || null;

  return (
    <div className="space-y-2.5">
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
        <p className="type-caption">Немає контактних осіб у картці клієнта.</p>
      )}

      {legalEntities.length > 0 ? (
        <Select
          label="Реквізити"
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
      ) : (
        <p className="type-caption">Немає реквізитів у картці клієнта.</p>
      )}

      {selectedLegal?.details?.trim() ? (
        <p className="type-caption whitespace-pre-wrap text-[var(--color-text-secondary)]">
          {selectedLegal.details.trim()}
        </p>
      ) : null}

      {phone || email ? (
        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5">
          {phone ? (
            <div className="min-w-0">
              <dt className="type-caption">Телефон</dt>
              <dd className="mt-0.5 truncate text-[13px] font-semibold">{phone}</dd>
            </div>
          ) : null}
          {email ? (
            <div className="min-w-0">
              <dt className="type-caption">Email</dt>
              <dd className="mt-0.5 truncate text-[13px] font-semibold">{email}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
