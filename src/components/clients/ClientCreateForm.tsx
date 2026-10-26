"use client";

import { Input } from "@/components/ui/Input";
import { FormGroup, Textarea } from "@/components/ui/Field";
import { CreatePanel } from "@/components/ui/CreatePanel";
import { createClientAction } from "@/server/domains/clients/actions";

/**
 * Client creation. Reused both on the clients page and inline inside the order
 * flow, so a missing client never interrupts order entry.
 */
export function ClientCreatePanel({
  onCreated,
  triggerLabel = "Новий клієнт",
  variant = "primary",
  size = "md",
}: {
  onCreated?: (client: {
    id: string;
    companyName: string;
    contactPerson?: string | null;
    phone?: string | null;
    email?: string | null;
    contacts?: Array<{
      id: string;
      nameUk: string;
      roleUk?: string | null;
      phone?: string | null;
      email?: string | null;
      isPrimary?: boolean;
    }>;
  }) => void;
  triggerLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <CreatePanel
      title="Новий клієнт"
      description="Мінімум — назва компанії. Решту реквізитів можна заповнити пізніше."
      triggerLabel={triggerLabel}
      submitLabel="Зберегти клієнта"
      action={createClientAction}
      variant={variant}
      size={size}
      width="lg"
      onCreated={(result) =>
        onCreated?.({
          id: String(result.clientId),
          companyName: String(result.companyName),
          contactPerson: result.contactPerson != null ? String(result.contactPerson) : null,
          phone: result.phone != null ? String(result.phone) : null,
          email: result.email != null ? String(result.email) : null,
          contacts: Array.isArray(result.contacts)
            ? (result.contacts as Array<Record<string, unknown>>).map((person) => ({
                id: String(person.id ?? ""),
                nameUk: String(person.nameUk ?? ""),
                roleUk: person.roleUk != null ? String(person.roleUk) : null,
                phone: person.phone != null ? String(person.phone) : null,
                email: person.email != null ? String(person.email) : null,
                isPrimary: Boolean(person.isPrimary),
              }))
            : [],
        })
      }
    >
      <FormGroup label="Компанія" columns={1}>
        <Input name="companyName" label="Назва компанії / ПІБ" required autoFocus />
      </FormGroup>

      <FormGroup label="Компанія / перша особа" columns={2}>
        <Input name="contactPerson" label="Контактна особа" placeholder="Стане основним контактом" />
        <Input name="contactRoleUk" label="Посада" placeholder="Менеджер…" />
        <Input name="phone" label="Телефон компанії" type="tel" placeholder="+380" />
        <Input name="email" label="Email компанії" type="email" />
        <Input name="website" label="Сайт" placeholder="https://" />
      </FormGroup>

      <FormGroup label="Реквізити" columns={1}>
        <Textarea name="legalDetails" label="Юридичні реквізити" placeholder="ЄДРПОУ, адреса, IBAN" />
        <Input name="note" label="Нотатка" placeholder="Умови роботи, знижки, домовленості" />
      </FormGroup>
    </CreatePanel>
  );
}
