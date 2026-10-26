"use client";

import { Input } from "@/components/ui/Input";
import { FormGroup, Textarea } from "@/components/ui/Field";
import { CreatePanel } from "@/components/ui/CreatePanel";
import { createSupplierContactAction } from "@/server/domains/catalog/supplier-contact-actions";

export function SupplierCreatePanel({
  triggerLabel = "Новий постачальник",
  variant = "primary",
  size = "md",
}: {
  triggerLabel?: string;
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
}) {
  return (
    <CreatePanel
      title="Новий постачальник"
      description="Назва обовʼязкова. Ціни матеріалів лишаються в картці матеріалу."
      triggerLabel={triggerLabel}
      submitLabel="Зберегти"
      action={createSupplierContactAction}
      variant={variant}
      size={size}
      width="lg"
    >
      <FormGroup label="Постачальник" columns={1}>
        <Input name="nameUk" label="Назва" required autoFocus />
      </FormGroup>
      <FormGroup label="Компанія / перша особа" columns={2}>
        <Input name="contactPerson" label="Контактна особа" placeholder="Стане основним контактом" />
        <Input name="contactRoleUk" label="Посада" placeholder="Менеджер…" />
        <Input name="phone" label="Телефон компанії" type="tel" placeholder="+380" />
        <Input name="email" label="Email компанії" type="email" />
        <Input name="website" label="Сайт" placeholder="https://" />
      </FormGroup>
      <FormGroup label="Нотатка" columns={1}>
        <Textarea name="note" label="Нотатка" placeholder="Умови, терміни, коментар" />
      </FormGroup>
    </CreatePanel>
  );
}
