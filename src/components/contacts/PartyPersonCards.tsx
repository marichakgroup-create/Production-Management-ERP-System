"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { IconPlus, IconTrash } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import type { PartyPersonRow } from "@/components/contacts/PartyPeopleEditor";
import {
  createClientContactAction,
  createSupplierContactPersonAction,
  deleteClientContactAction,
  deleteSupplierContactPersonAction,
  updateClientContactAction,
  updateSupplierContactPersonAction,
} from "@/server/domains/contacts/actions";

type Kind = "client" | "supplier";

/**
 * Light person cards for the object sidebar — company stays primary on the left,
 * people are secondary units on the right (progressive disclosure / hierarchy).
 */
export function PartyPersonCards({
  kind,
  partyId,
  people,
  canEdit,
}: {
  kind: Kind;
  partyId: string;
  people: PartyPersonRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    nameUk: "",
    roleUk: "",
    phone: "",
    email: "",
    isPrimary: people.length === 0,
  });

  function resetAdd() {
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

  function run(work: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error === "VALIDATION" ? "Вкажіть імʼя особи." : "Не вдалося зберегти.");
        return;
      }
      after?.();
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
    run(
      () =>
        kind === "client"
          ? createClientContactAction(formData)
          : createSupplierContactPersonAction(formData),
      resetAdd,
    );
  }

  function savePerson(person: PartyPersonRow, patch: Partial<PartyPersonRow>) {
    const formData = new FormData();
    formData.set("id", person.id);
    formData.set("nameUk", patch.nameUk ?? person.nameUk);
    formData.set("roleUk", patch.roleUk ?? person.roleUk ?? "");
    formData.set("phone", patch.phone ?? person.phone ?? "");
    formData.set("email", patch.email ?? person.email ?? "");
    if (patch.isPrimary ?? person.isPrimary) formData.set("isPrimary", "1");
    run(
      () =>
        kind === "client"
          ? updateClientContactAction(formData)
          : updateSupplierContactPersonAction(formData),
      () => setEditingId(null),
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
    <SoftBusy busy={pending} label="Оновлення осіб…">
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-2 px-0.5">
          <p className="type-caption text-[var(--color-text-quiet)]">
            Контактні особи
            <span className="ml-1 tabular">{people.length}</span>
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
          <div className="rounded-[var(--radius-surface)] border border-dashed border-[var(--color-border)] px-3 py-4">
            <p className="type-caption text-center">Ще немає осіб для звʼязку.</p>
          </div>
        ) : null}

        <ul className="space-y-2">
          {people.map((person) => {
            const isEditing = canEdit && editingId === person.id;
            return (
              <li
                key={person.id}
                className={cn(
                  "rounded-[var(--radius-surface)] border bg-[var(--color-surface)] px-3 py-2.5 shadow-[var(--shadow-card)]",
                  person.isPrimary
                    ? "border-[var(--color-primary-200)]"
                    : "border-[var(--color-border)]",
                )}
              >
                {isEditing ? (
                  <PersonEditForm
                    person={person}
                    disabled={pending}
                    onCancel={() => setEditingId(null)}
                    onSave={(patch) => savePerson(person, patch)}
                    onRemove={() => removePerson(person)}
                  />
                ) : (
                  <button
                    type="button"
                    disabled={!canEdit || pending}
                    onClick={() => canEdit && setEditingId(person.id)}
                    className={cn(
                      "w-full min-w-0 text-left",
                      canEdit && "cursor-pointer",
                      !canEdit && "cursor-default",
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="truncate text-[13.5px] font-semibold text-[var(--color-text-primary)]">
                        {person.nameUk}
                      </p>
                      {person.isPrimary ? (
                        <span className="shrink-0 rounded-[var(--radius-badge)] bg-[var(--color-primary-50)] px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-primary-800)]">
                          основний
                        </span>
                      ) : null}
                    </div>
                    {person.roleUk?.trim() ? (
                      <p className="type-caption mt-0.5 truncate text-[var(--color-text-quiet)]">
                        {person.roleUk.trim()}
                      </p>
                    ) : null}
                    {[person.phone, person.email].filter(Boolean).length > 0 ? (
                      <p className="type-caption mt-1.5 truncate tabular text-[var(--color-text-secondary)]">
                        {[person.phone, person.email].filter(Boolean).join(" · ")}
                      </p>
                    ) : (
                      <p className="type-caption mt-1.5 text-[var(--color-text-quiet)]">
                        {canEdit ? "Натисніть, щоб заповнити" : "—"}
                      </p>
                    )}
                  </button>
                )}
              </li>
            );
          })}
        </ul>

        {adding && canEdit ? (
          <div className="space-y-2 rounded-[var(--radius-surface)] border border-dashed border-[var(--color-border-strong)] bg-[var(--color-surface)] px-3 py-2.5">
            <p className="text-[12px] font-medium text-[var(--color-text-secondary)]">Нова особа</p>
            <div className="grid gap-2">
              <Input
                label="Імʼя"
                value={draft.nameUk}
                onChange={(e) => setDraft((prev) => ({ ...prev, nameUk: e.target.value }))}
                autoFocus
                required
              />
              <Input
                label="Посада"
                value={draft.roleUk}
                onChange={(e) => setDraft((prev) => ({ ...prev, roleUk: e.target.value }))}
                placeholder="Менеджер…"
              />
              <Input
                label="Телефон"
                type="tel"
                value={draft.phone}
                onChange={(e) => setDraft((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+380"
              />
              <Input
                label="Email"
                type="email"
                value={draft.email}
                onChange={(e) => setDraft((prev) => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(e) => setDraft((prev) => ({ ...prev, isPrimary: e.target.checked }))}
              />
              Основний контакт
            </label>
            <div className="flex flex-wrap gap-1.5">
              <Button
                type="button"
                size="sm"
                onClick={saveNew}
                disabled={pending || !draft.nameUk.trim()}
              >
                Зберегти
              </Button>
              <Button type="button" size="sm" variant="ghost" onClick={resetAdd} disabled={pending}>
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

function PersonEditForm({
  person,
  disabled,
  onSave,
  onCancel,
  onRemove,
}: {
  person: PartyPersonRow;
  disabled?: boolean;
  onSave: (patch: Partial<PartyPersonRow>) => void;
  onCancel: () => void;
  onRemove: () => void;
}) {
  const [nameUk, setNameUk] = useState(person.nameUk);
  const [roleUk, setRoleUk] = useState(person.roleUk ?? "");
  const [phone, setPhone] = useState(person.phone ?? "");
  const [email, setEmail] = useState(person.email ?? "");
  const [isPrimary, setIsPrimary] = useState(person.isPrimary);

  return (
    <div className="space-y-2">
      <div className="grid gap-2">
        <Input label="Імʼя" value={nameUk} onChange={(e) => setNameUk(e.target.value)} disabled={disabled} />
        <Input label="Посада" value={roleUk} onChange={(e) => setRoleUk(e.target.value)} disabled={disabled} />
        <Input label="Телефон" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={disabled} />
        <Input label="Email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={disabled} />
      </div>
      <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
        <input
          type="checkbox"
          checked={isPrimary}
          disabled={disabled}
          onChange={(e) => setIsPrimary(e.target.checked)}
        />
        Основний
      </label>
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <button
          type="button"
          aria-label={`Прибрати ${person.nameUk}`}
          disabled={disabled}
          onClick={onRemove}
          className="rounded-[6px] p-1.5 text-[var(--color-text-tertiary)] hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)] disabled:opacity-50"
        >
          <IconTrash size={14} />
        </button>
        <div className="flex gap-1.5">
          <Button type="button" size="sm" variant="ghost" disabled={disabled} onClick={onCancel}>
            Скасувати
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={disabled || !nameUk.trim()}
            onClick={() => onSave({ nameUk, roleUk, phone, email, isPrimary })}
          >
            Зберегти
          </Button>
        </div>
      </div>
    </div>
  );
}
