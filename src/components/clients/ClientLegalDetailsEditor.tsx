"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Field";
import { SoftBusy } from "@/components/ui/SoftBusy";
import { IconPlus, IconTrash } from "@/components/ui/Icons";
import {
  createClientLegalDetailAction,
  deleteClientLegalDetailAction,
  updateClientLegalDetailAction,
} from "@/server/domains/clients/actions";

export type ClientLegalDetailRow = {
  id: string;
  nameUk: string;
  details: string | null;
  isPrimary: boolean;
};

/**
 * Legal / banking реквізити. Parent HeaderBlock owns the section title.
 */
export function ClientLegalDetailsEditor({
  clientId,
  rows,
  canEdit,
  embedded = true,
}: {
  clientId: string;
  rows: ClientLegalDetailRow[];
  canEdit: boolean;
  embedded?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    nameUk: "",
    details: "",
    isPrimary: rows.length === 0,
  });

  function resetDraft() {
    setDraft({
      nameUk: "",
      details: "",
      isPrimary: rows.length === 0,
    });
    setAdding(false);
    setError(null);
  }

  function run(work: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(
          result.error === "VALIDATION"
            ? "Вкажіть назву або текст реквізитів."
            : "Не вдалося зберегти.",
        );
        return;
      }
      resetDraft();
      router.refresh();
    });
  }

  function saveNew() {
    const formData = new FormData();
    formData.set("clientId", clientId);
    formData.set("nameUk", draft.nameUk);
    formData.set("details", draft.details);
    if (draft.isPrimary) formData.set("isPrimary", "1");
    run(() => createClientLegalDetailAction(formData));
  }

  function saveRow(row: ClientLegalDetailRow, patch: Partial<ClientLegalDetailRow>) {
    const formData = new FormData();
    formData.set("id", row.id);
    formData.set("nameUk", patch.nameUk ?? row.nameUk);
    formData.set("details", patch.details ?? row.details ?? "");
    if (patch.isPrimary ?? row.isPrimary) formData.set("isPrimary", "1");
    run(() => updateClientLegalDetailAction(formData));
  }

  function removeRow(row: ClientLegalDetailRow) {
    const formData = new FormData();
    formData.set("id", row.id);
    formData.set("clientId", clientId);
    run(() => deleteClientLegalDetailAction(formData));
  }

  return (
    <SoftBusy busy={pending} label="Оновлення реквізитів…">
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          {!embedded ? (
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-quiet)]">
              Реквізити
              <span className="ml-1.5 font-normal tabular text-[var(--color-text-tertiary)]">
                {rows.length}
              </span>
            </p>
          ) : (
            <p className="type-caption tabular text-[var(--color-text-quiet)]">
              {rows.length} записів
            </p>
          )}
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

        {rows.length === 0 && !adding ? (
          <p className="type-caption">Ще немає — додайте юр. особу / IBAN / адресу.</p>
        ) : null}

        <ul className="divide-y divide-[var(--color-divider)]">
          {rows.map((row) => (
            <li key={row.id} className="py-3 first:pt-0 last:pb-0">
              {canEdit ? (
                <LegalFields
                  key={row.id}
                  row={row}
                  disabled={pending}
                  onSave={(patch) => saveRow(row, patch)}
                  onRemove={() => removeRow(row)}
                />
              ) : (
                <div className="min-w-0">
                  <p className="text-[13.5px] font-medium text-[var(--color-text-primary)]">
                    {row.nameUk}
                    {row.isPrimary ? (
                      <span className="ml-1.5 text-[10px] font-semibold uppercase text-[var(--color-text-quiet)]">
                        основні
                      </span>
                    ) : null}
                  </p>
                  {row.details?.trim() ? (
                    <p className="type-caption mt-0.5 whitespace-pre-wrap text-[var(--color-text-secondary)]">
                      {row.details.trim()}
                    </p>
                  ) : (
                    <p className="type-caption mt-0.5">—</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>

        {adding && canEdit ? (
          <div className="space-y-2 border-t border-dashed border-[var(--color-border-strong)] pt-3">
            <Input
              label="Назва"
              value={draft.nameUk}
              onChange={(event) => setDraft((prev) => ({ ...prev, nameUk: event.target.value }))}
              placeholder="ТОВ … / ФОП … / IBAN"
              autoFocus
            />
            <Textarea
              label="Реквізити"
              value={draft.details}
              onChange={(event) => setDraft((prev) => ({ ...prev, details: event.target.value }))}
              placeholder="ЄДРПОУ, адреса, IBAN, банк…"
              rows={3}
            />
            <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
              <input
                type="checkbox"
                checked={draft.isPrimary}
                onChange={(event) =>
                  setDraft((prev) => ({ ...prev, isPrimary: event.target.checked }))
                }
              />
              Основні реквізити
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                size="sm"
                onClick={saveNew}
                disabled={pending || (!draft.nameUk.trim() && !draft.details.trim())}
              >
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

function LegalFields({
  row,
  disabled,
  onSave,
  onRemove,
}: {
  row: ClientLegalDetailRow;
  disabled?: boolean;
  onSave: (patch: Partial<ClientLegalDetailRow>) => void;
  onRemove: () => void;
}) {
  const [nameUk, setNameUk] = useState(row.nameUk);
  const [details, setDetails] = useState(row.details ?? "");
  const [isPrimary, setIsPrimary] = useState(row.isPrimary);

  const dirty =
    nameUk !== row.nameUk ||
    details !== (row.details ?? "") ||
    isPrimary !== row.isPrimary;

  return (
    <div className="space-y-2">
      <Input label="Назва" value={nameUk} onChange={(e) => setNameUk(e.target.value)} disabled={disabled} />
      <Textarea
        label="Реквізити"
        value={details}
        onChange={(e) => setDetails(e.target.value)}
        disabled={disabled}
        rows={3}
      />
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-[12.5px] text-[var(--color-text-secondary)]">
          <input
            type="checkbox"
            checked={isPrimary}
            disabled={disabled}
            onChange={(event) => setIsPrimary(event.target.checked)}
          />
          Основні
        </label>
        <div className="flex items-center gap-1.5">
          {dirty ? (
            <Button
              type="button"
              size="sm"
              disabled={disabled || (!nameUk.trim() && !details.trim())}
              onClick={() => onSave({ nameUk, details, isPrimary })}
            >
              Зберегти
            </Button>
          ) : null}
          <button
            type="button"
            aria-label={`Прибрати ${row.nameUk}`}
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
