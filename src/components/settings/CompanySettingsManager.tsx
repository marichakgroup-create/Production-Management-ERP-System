"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAppDialog } from "@/components/ui/ConfirmDialog";
import { Banner } from "@/components/ui/Banner";
import { Input } from "@/components/ui/Input";
import { Checkbox, FormGroup, Textarea } from "@/components/ui/Field";
import { IconPlus, IconTrash } from "@/components/ui/Icons";
import { cn } from "@/lib/utils";
import {
  deleteCompanySettingsAction,
  saveCompanySettingsAction,
} from "@/server/domains/settings/actions";

export type CompanyRow = {
  id: string;
  legalName: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  taxId: string | null;
  iban: string | null;
  quotationFooter: string | null;
  isDefault: boolean;
};

const emptyDraft = {
  legalName: "",
  address: "",
  phone: "",
  email: "",
  taxId: "",
  iban: "",
  quotationFooter: "",
  isDefault: false,
};

export function CompanySettingsManager({
  companies,
  canEdit,
}: {
  companies: CompanyRow[];
  canEdit: boolean;
}) {
  const router = useRouter();
  const dialog = useAppDialog();
  const [pending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string>(
    companies.find((row) => row.isDefault)?.id ?? companies[0]?.id ?? "new",
  );
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const selected = companies.find((row) => row.id === selectedId) ?? null;
  const creating = selectedId === "new" || !selected;

  const initial = useMemo(
    () =>
      selected
        ? {
            legalName: selected.legalName,
            address: selected.address ?? "",
            phone: selected.phone ?? "",
            email: selected.email ?? "",
            taxId: selected.taxId ?? "",
            iban: selected.iban ?? "",
            quotationFooter: selected.quotationFooter ?? "",
            isDefault: selected.isDefault,
          }
        : emptyDraft,
    [selected],
  );
  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    setDraft(initial);
  }, [initial]);

  function save() {
    setError(null);
    setMessage(null);
    const formData = new FormData();
    if (selected && !creating) formData.set("id", selected.id);
    formData.set("legalName", draft.legalName);
    formData.set("address", draft.address);
    formData.set("phone", draft.phone);
    formData.set("email", draft.email);
    formData.set("taxId", draft.taxId);
    formData.set("iban", draft.iban);
    formData.set("quotationFooter", draft.quotationFooter);
    if (draft.isDefault) formData.set("isDefault", "true");
    startTransition(async () => {
      const result = await saveCompanySettingsAction(formData);
      if (!result.ok) {
        setError("Перевірте поля компанії.");
        return;
      }
      setMessage(creating ? "Компанію додано." : "Зміни збережено.");
      if (result.id) setSelectedId(result.id);
      router.refresh();
    });
  }

  async function remove() {
    if (!selected) return;
    if (companies.length <= 1) {
      setError("Має лишитися хоча б одна компанія.");
      return;
    }
    const name = selected.legalName;
    const companyId = selected.id;
    const ok = await dialog.ask({
      title: `Видалити «${name}»?`,
      message: "Компанію буде прибрано з довідника.",
      confirmLabel: "Видалити",
      danger: true,
    });
    if (!ok) return;
    setError(null);
    setMessage(null);
    const formData = new FormData();
    formData.set("id", companyId);
    startTransition(async () => {
      const result = await deleteCompanySettingsAction(formData);
      if (!result.ok) {
        setError(
          result.error === "LAST_COMPANY"
            ? "Має лишитися хоча б одна компанія."
            : "Не вдалося видалити.",
        );
        return;
      }
      setSelectedId(companies.find((row) => row.id !== companyId)?.id ?? "new");
      router.refresh();
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
      {dialog.view}
      <aside className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="type-group-label">Компанії</p>
          {canEdit ? (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setSelectedId("new");
                setError(null);
                setMessage(null);
              }}
            >
              <IconPlus size={14} />
              Нова
            </Button>
          ) : null}
        </div>
        <ul className="space-y-0.5">
          {companies.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-start justify-between gap-2 rounded-[8px] px-2.5 py-2 text-left text-[13px]",
                  row.id === selectedId
                    ? "bg-[var(--color-tint-sage)]/50 font-medium"
                    : "hover:bg-[var(--color-surface-subtle)]",
                )}
                onClick={() => {
                  setSelectedId(row.id);
                  setError(null);
                  setMessage(null);
                }}
              >
                <span className="min-w-0">
                  <span className="block truncate">{row.legalName}</span>
                  {row.taxId ? (
                    <span className="type-caption block truncate">ЄДРПОУ {row.taxId}</span>
                  ) : null}
                </span>
                {row.isDefault ? (
                  <span className="type-caption shrink-0 text-[var(--color-primary-700)]">основна</span>
                ) : null}
              </button>
            </li>
          ))}
          {creating ? (
            <li className="rounded-[8px] bg-[var(--color-surface-subtle)] px-2.5 py-2 text-[13px] font-medium">
              Нова компанія
            </li>
          ) : null}
        </ul>
      </aside>

      <div className="rounded-[var(--radius-surface)] border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="space-y-4">
          <FormGroup label="Реквізити" columns={1}>
            <Input
              label="Юридична назва"
              required
              disabled={!canEdit || pending}
              value={draft.legalName}
              onChange={(event) => setDraft((prev) => ({ ...prev, legalName: event.target.value }))}
            />
            <Input
              label="Адреса"
              disabled={!canEdit || pending}
              value={draft.address}
              onChange={(event) => setDraft((prev) => ({ ...prev, address: event.target.value }))}
            />
            <Input
              label="ЄДРПОУ / ІПН"
              disabled={!canEdit || pending}
              value={draft.taxId}
              onChange={(event) => setDraft((prev) => ({ ...prev, taxId: event.target.value }))}
            />
            <Input
              label="IBAN"
              disabled={!canEdit || pending}
              value={draft.iban}
              onChange={(event) => setDraft((prev) => ({ ...prev, iban: event.target.value }))}
              placeholder="UA00 0000 0000 0000 0000 0000 000"
            />
          </FormGroup>
          <FormGroup label="Контакти в документах" columns={2}>
            <Input
              label="Телефон"
              disabled={!canEdit || pending}
              value={draft.phone}
              onChange={(event) => setDraft((prev) => ({ ...prev, phone: event.target.value }))}
            />
            <Input
              label="Email"
              type="email"
              disabled={!canEdit || pending}
              value={draft.email}
              onChange={(event) => setDraft((prev) => ({ ...prev, email: event.target.value }))}
            />
          </FormGroup>
          <FormGroup label="Комерційна пропозиція" columns={1}>
            <Textarea
              label="Текст у підвалі документа"
              disabled={!canEdit || pending}
              value={draft.quotationFooter}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, quotationFooter: event.target.value }))
              }
              placeholder="Пропозиція не є публічною офертою. Остаточні умови фіксуються договором."
            />
            <Checkbox
              label="Основна компанія"
              description="Підставляється в нове замовлення, якщо іншу не обрано."
              disabled={!canEdit || pending}
              checked={draft.isDefault}
              onChange={(event) =>
                setDraft((prev) => ({ ...prev, isDefault: event.target.checked }))
              }
            />
          </FormGroup>

          {error ? <Banner tone="danger">{error}</Banner> : null}
          {message ? <Banner tone="success">{message}</Banner> : null}
          {!canEdit ? (
            <Banner tone="info">Змінювати компанії може лише адміністратор.</Banner>
          ) : (
            <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-divider)] pt-4">
              <Button type="button" onClick={save} disabled={pending || !draft.legalName.trim()}>
                {pending ? "Збереження…" : creating ? "Додати компанію" : "Зберегти"}
              </Button>
              {!creating && companies.length > 1 ? (
                <Button type="button" variant="ghost" disabled={pending} onClick={remove}>
                  <IconTrash size={14} />
                  Видалити
                </Button>
              ) : null}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
