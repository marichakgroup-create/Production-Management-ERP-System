"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { IconPlus } from "@/components/ui/Icons";
import { startNewProposalAction } from "@/server/domains/orders/actions";

export function StartNewProposalButton({
  orderId,
  accent = true,
}: {
  orderId: string;
  accent?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function submit() {
    if (
      !window.confirm(
        "Створити нову пропозицію? Замовлення повернеться на етап Розрахунок — можна змінити склад і знову зберегти пропозицію для погодження.",
      )
    ) {
      return;
    }
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
      <Button
        variant={accent ? "primary" : "secondary"}
        size="sm"
        loading={pending}
        disabled={pending}
        onClick={submit}
        hint="newProposal"
      >
        <IconPlus size={15} />
        Нова пропозиція
      </Button>
      {error ? (
        <span className="type-caption text-[var(--color-danger-text)]">{error}</span>
      ) : null}
    </div>
  );
}
