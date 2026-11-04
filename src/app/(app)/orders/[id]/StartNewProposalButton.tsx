"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAppDialog } from "@/components/ui/ConfirmDialog";
import { IconPlus } from "@/components/ui/Icons";
import { startNewProposalAction } from "@/server/domains/orders/actions";

export function StartNewProposalButton({
  orderId,
  accent = true,
  label = "Нова пропозиція",
}: {
  orderId: string;
  accent?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const dialog = useAppDialog();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const ok = await dialog.ask({
      title: "Нова пропозиція?",
      message:
        "Замовлення повернеться на етап «Розрахунок». Можна змінити склад і знову зберегти пропозицію для погодження.",
      confirmLabel: "Створити",
    });
    if (!ok) return;
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    startTransition(async () => {
      const result = await startNewProposalAction(formData);
      if (!result.ok) {
        setError("Не вдалося відкрити нову пропозицію.");
        return;
      }
      router.push(`/orders/${orderId}?tab=configuration`);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-1">
      {dialog.view}
      <Button
        variant={accent ? "primary" : "secondary"}
        size="sm"
        loading={pending}
        disabled={pending}
        onClick={submit}
        hint="newProposal"
      >
        <IconPlus size={15} />
        {label}
      </Button>
      {error ? (
        <span className="type-caption text-[var(--color-danger-text)]">{error}</span>
      ) : null}
    </div>
  );
}
