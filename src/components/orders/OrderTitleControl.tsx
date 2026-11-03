"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { controlClass } from "@/components/ui/Field";
import { IconEdit } from "@/components/ui/Icons";
import { Modal } from "@/components/ui/Overlay";
import { updateOrderTitleAction } from "@/server/domains/orders/actions";

export function OrderTitleControl({
  orderId,
  orderNumber,
  title,
  canEdit,
  hideName = false,
  className,
}: {
  orderId: string;
  orderNumber: string;
  title: string | null;
  canEdit: boolean;
  hideName?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const name = title?.trim() ?? "";
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function openEditor() {
    setDraft(name);
    setError(null);
    setOpen(true);
  }

  function confirm() {
    const next = draft.trim().replace(/\s+/g, " ");
    if (!next) {
      setError("Вкажіть назву");
      return;
    }
    if (next === name) {
      setOpen(false);
      return;
    }
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("title", next);
    startTransition(async () => {
      const result = await updateOrderTitleAction(formData);
      if (!result.ok) {
        setError(
          result.error === "ORDER_LOCKED"
            ? "Закрите замовлення не можна перейменувати"
            : "Не вдалося зберегти назву",
        );
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <span className={className ?? "flex min-w-0 max-w-full items-center gap-1 overflow-hidden"}>
      {!hideName && name ? (
        <span className="min-w-0 truncate" title={name}>
          {name}
        </span>
      ) : null}
      {canEdit ? (
        <button
          type="button"
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-[6px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-primary)]"
          aria-label={`Змінити назву ${orderNumber}`}
          title="Змінити назву"
          onClick={openEditor}
        >
          <IconEdit size={13} />
        </button>
      ) : null}
      <Modal
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Змінити назву замовлення?"
        description={`${orderNumber} лишається номером. Нова назва з’явиться в списку і в шапці замовлення.`}
        width="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Скасувати
            </Button>
            <Button size="sm" onClick={confirm} disabled={pending || !draft.trim()}>
              {pending ? "Збереження…" : "Зберегти"}
            </Button>
          </>
        }
      >
        <label className="block">
          <span className="type-caption mb-1 block">Назва</span>
          <input
            value={draft}
            maxLength={120}
            autoFocus
            className={`${controlClass} focus-visible:outline-none!`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                confirm();
              }
            }}
          />
        </label>
        {error ? <p className="type-caption mt-2 text-[var(--color-danger-text)]">{error}</p> : null}
      </Modal>
    </span>
  );
}
