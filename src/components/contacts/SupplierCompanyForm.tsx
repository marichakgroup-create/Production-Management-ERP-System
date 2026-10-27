"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormGroup, Textarea } from "@/components/ui/Field";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { updateSupplierContactAction } from "@/server/domains/catalog/supplier-contact-actions";

export type SupplierCompanyValues = {
  id: string;
  nameUk: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  note: string | null;
  contactPerson: string | null;
};

export function SupplierCompanyForm({
  initial,
  canEdit,
}: {
  initial: SupplierCompanyValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    nameUk: initial.nameUk,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    website: initial.website ?? "",
    note: initial.note ?? "",
  });

  const dirty =
    draft.nameUk !== initial.nameUk ||
    draft.phone !== (initial.phone ?? "") ||
    draft.email !== (initial.email ?? "") ||
    draft.website !== (initial.website ?? "") ||
    draft.note !== (initial.note ?? "");

  function save() {
    if (!canEdit || !dirty) return;
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("id", initial.id);
      formData.set("nameUk", draft.nameUk);
      formData.set("phone", draft.phone);
      formData.set("email", draft.email);
      formData.set("website", draft.website);
      formData.set("note", draft.note);
      formData.set("contactPerson", initial.contactPerson ?? "");
      const result = await updateSupplierContactAction(formData);
      if (!result.ok) {
        setError(
          result.error === "DUPLICATE_NAME"
            ? "Постачальник з такою назвою вже є."
            : result.error === "NAME_REQUIRED"
              ? "Вкажіть назву."
              : "Не вдалося зберегти.",
        );
        return;
      }
      router.refresh();
    });
  }

  function reset() {
    setDraft({
      nameUk: initial.nameUk,
      phone: initial.phone ?? "",
      email: initial.email ?? "",
      website: initial.website ?? "",
      note: initial.note ?? "",
    });
    setError(null);
  }

  if (!canEdit) {
    return (
      <dl className="block">
        {[
          { label: "Телефон", value: initial.phone },
          { label: "Email", value: initial.email },
          { label: "Сайт", value: initial.website },
          { label: "Примітка", value: initial.note, multiline: true },
        ].map((item) => (
          <div
            key={item.label}
            className={
              item.multiline
                ? "block border-b border-[var(--color-divider)] py-2 last:border-0"
                : "flex items-baseline justify-between gap-4 border-b border-[var(--color-divider)] py-2 last:border-0"
            }
          >
            <dt className="shrink-0 text-[13px] text-[var(--color-text-secondary)]">{item.label}</dt>
            <dd
              className={
                item.multiline
                  ? "mt-0.5 whitespace-pre-wrap text-[13.5px] font-medium text-[var(--color-text-primary)]"
                  : "min-w-0 text-right text-[13.5px] font-medium text-[var(--color-text-primary)]"
              }
            >
              {item.value?.trim() || "—"}
            </dd>
          </div>
        ))}
      </dl>
    );
  }

  return (
    <SoftBusy busy={pending} label="Збереження…">
      <div className="space-y-3">
        <FormGroup columns={1} compact>
          <Input
            label="Назва"
            value={draft.nameUk}
            required
            disabled={pending}
            onChange={(event) => setDraft((prev) => ({ ...prev, nameUk: event.target.value }))}
          />
        </FormGroup>
        <FormGroup columns={2} compact>
          <Input
            label="Телефон"
            type="tel"
            value={draft.phone}
            placeholder="+380"
            disabled={pending}
            onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <Input
            label="Email"
            type="email"
            value={draft.email}
            disabled={pending}
            onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
          />
          <Input
            label="Сайт"
            value={draft.website}
            placeholder="https://"
            disabled={pending}
            onChange={(event) => setDraft((prev) => ({ ...prev, website: event.target.value }))}
          />
        </FormGroup>
        <FormGroup columns={1} compact>
          <Textarea
            label="Примітка"
            value={draft.note}
            rows={2}
            placeholder="Умови, терміни…"
            disabled={pending}
            onChange={(event) => setDraft((prev) => ({ ...prev, note: event.target.value }))}
          />
        </FormGroup>

        {(dirty || error) && (
          <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] pt-3">
            {error ? (
              <span className="type-caption text-[var(--color-danger-text)]">{error}</span>
            ) : null}
            <div className="ml-auto flex gap-1.5">
              <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={reset}>
                Скасувати
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={pending || !dirty || !draft.nameUk.trim()}
                onClick={save}
              >
                {pending ? "…" : "Зберегти"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </SoftBusy>
  );
}
