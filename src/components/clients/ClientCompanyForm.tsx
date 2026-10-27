"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { FormGroup, Textarea } from "@/components/ui/Field";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { updateClientAction } from "@/server/domains/clients/actions";

export type ClientCompanyValues = {
  id: string;
  companyName: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  note: string | null;
  /** Kept for legacy mirror; people/legal live in their own editors. */
  contactPerson: string | null;
  legalDetails: string | null;
};

/**
 * Company-level fields on the client detail page.
 * People and legal реквізити are edited in sibling sections.
 */
export function ClientCompanyForm({
  initial,
  canEdit,
}: {
  initial: ClientCompanyValues;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    companyName: initial.companyName,
    phone: initial.phone ?? "",
    email: initial.email ?? "",
    website: initial.website ?? "",
    note: initial.note ?? "",
  });

  const dirty =
    draft.companyName !== initial.companyName ||
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
      formData.set("companyName", draft.companyName);
      formData.set("phone", draft.phone);
      formData.set("email", draft.email);
      formData.set("website", draft.website);
      formData.set("note", draft.note);
      formData.set("contactPerson", initial.contactPerson ?? "");
      formData.set("legalDetails", initial.legalDetails ?? "");
      const result = await updateClientAction(formData);
      if (!result.ok) {
        setError(result.error === "VALIDATION" ? "Перевірте поля." : "Не вдалося зберегти.");
        return;
      }
      router.refresh();
    });
  }

  function reset() {
    setDraft({
      companyName: initial.companyName,
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
            label="Назва компанії"
            value={draft.companyName}
            required
            disabled={pending}
            onChange={(event) =>
              setDraft((prev) => ({ ...prev, companyName: event.target.value }))
            }
          />
        </FormGroup>
        <FormGroup columns={2} compact>
          <Input
            label="Телефон компанії"
            type="tel"
            value={draft.phone}
            placeholder="+380"
            disabled={pending}
            onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
          />
          <Input
            label="Email компанії"
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
            placeholder="Умови роботи, знижки…"
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
                disabled={pending || !dirty || !draft.companyName.trim()}
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
