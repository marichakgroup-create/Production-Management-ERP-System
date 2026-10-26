"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { IconPlus, IconTrash } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import {
  createClientContactAction,
  createSupplierContactPersonAction,
  deleteClientContactAction,
  deleteSupplierContactPersonAction,
  updateClientContactAction,
  updateSupplierContactPersonAction,
} from "@/server/domains/contacts/actions";

export type PartyPersonRow = {
  id: string;
  nameUk: string;
  roleUk: string | null;
  phone: string | null;
  email: string | null;
  isPrimary: boolean;
};

type Kind = "client" | "supplier";

/**
 * Compact people list under a company (client or supplier).
 * Hierarchy: company card → contact persons.
 */
export function PartyPeopleEditor({
  kind,
  partyId,
  people,
  canEdit,
  dense = false,
}: {
  kind: Kind;
  partyId: string;
  people: PartyPersonRow[];
  canEdit: boolean;
  dense?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    nameUk: "",
    roleUk: "",
    phone: "",
    email: "",
    isPrimary: people.length === 0,
  });

  function resetDraft() {
    setDraft({
      nameUk: "",
      roleUk: "",
      phone: "",
      email: "",
      isPrimary: people.length === 0,
    });
    setAdding(false);
    setError(null);
  }

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error === "VALIDATION" ? "Вкажіть імʼя особи." : "Не вдалося зберегти.");
        return;
      }
      resetDraft();
      router.refresh();
    });
  }

  function saveNew() {
    const formData = new FormData();
    formData.set(kind === "client" ? "clientId" : "supplierId", partyId);
    formData.set("nameUk", draft.nameUk);
    formData.set("roleUk", draft.roleUk);
    formData.set("phone", draft.phone);
    formData.set("email", draft.email);
    if (draft.isPrimary) formData.set("isPrimary", "1");
    run(() =>
      kind === "client"
        ? createClientContactAction(formData)
        : createSupplierContactPersonAction(formData),
    );
  }

  function savePerson(person: PartyPersonRow, patch: Partial<PartyPersonRow> & { isPrimary?: boolean }) {
    const formData = new FormData();
    formData.set("id", person.id);
    formData.set("nameUk", patch.nameUk ?? person.nameUk);
    formData.set("roleUk", patch.roleUk ?? person.roleUk ?? "");
    formData.set("phone", patch.phone ?? person.phone ?? "");
    formData.set("email", patch.email ?? person.email ?? "");
    if (patch.isPrimary ?? person.isPrimary) formData.set("isPrimary", "1");
    run(() =>
      kind === "client"
        ? updateClientContactAction(formData)
        : updateSupplierContactPersonAction(formData),
    );
  }

  function removePerson(person: PartyPersonRow) {
    const formData = new FormData();
    formData.set("id", person.id);
    formData.set(kind === "client" ? "clientId" : "supplierId", partyId);
    run(() =>
      kind === "client"
        ? deleteClientContactAction(formData)
        : deleteSupplierContactPersonAction(formData),
    );
  }

  return (
    <SoftBusy busy={pending} label="Оновлення контактів…">
      <div className={cn("space-y-2", dense ? "pt-1" : "pt-2")}>
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-quiet)]">
            Контактні особи
            <span className="ml-1.5 font-normal tabular text-[var(--color-text-tertiary)]">
              {people.length}
            </span>
          </p>
          {canEdit && !adding ? (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--color-primary-700)] hover:underline"
            >
              <IconPlus size={12} />
              Додати
            </button>
          ) : null}
        </div>

        {people.length === 0 && !adding ? (
          <p className="type-caption">Ще немає — додайте людину для замовлень / звʼязку.</p>
        ) : null}

        <ul className="space-y-1.5">
          {people.map((person) => (
            <li
              key={person.id}
              className="rounded-[8px] border border-[var(--color-divider)] bg-[var(--color-bg)]/50 px-2.5 py-2"
            >
              {canEdit ? (
                <PersonFields
                  key={person.id}
                  person={person}
                  disabled={pending}
                  onSave={(patch) => savePerson(person, patch)}
                  onRemove={() => removePerson(person)}
                />
              ) : (
                <div className="min-w-0">
                  <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                    {person.nameUk}
                    {person.isPrimary ? (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-[var(--color-text-quiet)]">
                        основний
                      </span>
                    ) : null}
                  </p>
                  {person.roleUk?.trim() ? (
                    <p className="type-caption mt-0.5 truncate text-[var(--color-text-quiet)]">
                      {person.roleUk.trim()}
                    </p>
                  ) : null}
                  {[person.phone, person.email].filter(Boolean).length > 0 ? (
                    <p className="type-caption mt-0.5 truncate">
                      {[person.phone, person.email].filter(Boolean).join(" · ")}
                    </p>
                  ) : !person.roleUk?.trim() ? (
                    <p className="type-caption mt-0.5">—</p>
                  ) : null}
                </div>
              )}
            </li>
          ))}
        </ul>

        {adding && canEdit ? (
          <div className="space-y-2 rounded-[8px] border border-dashed border-[var(--color-border-strong)] px-2.5 py-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Input
                label="Імʼя"
                value={draft.nameUk}
                onChange={(event) => setDraft((prev) => ({ ...prev, nameUk: event.target.value }))}
                autoFocus
                required
              />
              <Input
                label="Посада"
                value={draft.roleUk}
                onChange={(event) => setDraft((prev) => ({ ...prev, roleUk: event.target.value }))}
                placeholder="Менеджер…"
              />
              <Input
                label="Телефон"
                type="tel"
                value={draft.phone}
                onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
                placeholder="+380"
              />
              <Input
                label="Email"
                type="email"
                value={draft.email}
                onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, isPrimary: event.target.checked }))
                }
              />
              Основний контакт
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" size="sm" onClick={saveNew} disabled={pending || !draft.nameUk.trim()}>
                Зберегти
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetDraft} disabled={pending}>
                Скасувати
              </Button>
            </div>
          </div>
        ) : null}

        {error ? <p className="type-caption text-[var(--color-danger-text)]">{error}</p> : null}
      </div>
    </SoftBusy>
  );
}

function PersonFields({
  person,
  disabled,
  onSave,
  onRemove,
}: {
  person: PartyPersonRow;
  disabled?: boolean;
  onSave: (patch: Partial<PartyPersonRow> & { isPrimary?: boolean }) => void;
  onRemove: () => void;
}) {
  const [nameUk, setNameUk] = useState(person.nameUk);
  const [roleUk, setRoleUk] = useState(person.roleUk ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [isPrimary, setIsPrimary] = useState(person.isPrimary);

  const dirty =
    nameUk !== person.nameUk ||
    roleUk !== (person.roleUk ?? "") ||
    phone !== (person.phone ?? "") ||
    email !== (person.email ?? "") ||
    isPrimary !== person.isPrimary;

  return (
    <div className="space-y-2">
      <div className="grid gap-2 sm:grid-cols-2">
        <Input label="Імʼя" value={nameUk} onChange={(e) => setNameUk(e.target.value)} disabled={disabled} />
        <Input label="Посада" value={roleUk} onChange={(e) => setRoleUk(e.target.value)} disabled={disabled} />
        <Input label="Телефон" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={disabled} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={isPrimary}
            disabled={disabled}
            onChange={(event) => setIsPrimary(event.target.checked)}
          />
          Основний
        </label>
        <div className="flex items-center gap-1.5">
          {dirty ? (
            <Button
              type="button"
              size="sm"
              disabled={disabled || !nameUk.trim()}
              onClick={() => onSave({ nameUk, roleUk, phone, email, isPrimary })}
            >
              Зберегти
            </Button>
          ) : null}
          <button
            type="button"
            aria-label={`Прибрати ${person.nameUk}`}
            disabled={disabled}
            onClick={onRemove}
            className="rounded-[6px] p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
          >
            <IconTrash size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
