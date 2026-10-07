"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Overlay";
import { IconCopy, IconTrash } from "@/components/ui/Icons";
import {
  cancelOrderAction,
  duplicateOrderAction,
} from "@/server/domains/orders/actions";

export function OrderDeleteIconButton({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-danger-bg)] hover:text-[var(--color-danger-text)]"
        aria-label={`В архів ${orderNumber}`}
        title="В архів"
        onClick={() => setOpen(true)}
      >
        <IconTrash size={15} />
      </button>
      <Modal
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Перемістити в архів?"
        description="Замовлення зникне зі списку «Усі» та інших фільтрів. Його можна буде знайти лише у вкладці «Архів». Історія та версії збережуться."
        width="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Скасувати
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={pending}
              onClick={() => {
                startTransition(async () => {
                  const formData = new FormData();
                  formData.set("orderId", orderId);
                  const result = await cancelOrderAction(formData);
                  if (result.ok) {
                    setOpen(false);
                    router.refresh();
                  }
                });
              }}
            >
              {pending ? "Архівування…" : "В архів"}
            </Button>
          </>
        }
      >
        <p className="type-body font-medium tabular">{orderNumber}</p>
      </Modal>
    </>
  );
}

export function OrderDuplicateIconButton({
  orderId,
  orderNumber,
}: {
  orderId: string;
  orderNumber: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirm() {
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    startTransition(async () => {
      const result = await duplicateOrderAction(formData);
      if (!result.ok) {
        setError(
          result.error === "NOT_FOUND"
            ? "Замовлення не знайдено"
            : "Не вдалося дублювати замовлення",
        );
        return;
      }
      setOpen(false);
      router.push(`/orders/${result.orderId}`);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex h-8 w-8 items-center justify-center rounded-[8px] text-[var(--color-text-tertiary)] transition-colors hover:bg-[var(--color-surface-subtle)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:opacity-40"
        aria-label={`Дублювати ${orderNumber}`}
        title="Дублювати"
        disabled={pending}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <IconCopy size={15} />
      </button>
      <Modal
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Дублювати замовлення?"
        description="Створиться нова чернетка з тими самими позиціями та складом. Пропозиції, специфікації та файли не копіюються."
        width="sm"
        footer={
          <>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} disabled={pending}>
              Скасувати
            </Button>
            <Button size="sm" onClick={confirm} disabled={pending}>
              {pending ? "Копіювання…" : "Створити копію"}
            </Button>
          </>
        }
      >
        <p className="type-body font-medium tabular">{orderNumber}</p>
        {error ? <p className="type-caption mt-2 text-[var(--color-danger-text)]">{error}</p> : null}
      </Modal>
    </>
  );
}
