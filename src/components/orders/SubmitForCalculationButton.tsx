"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { useAppDialog } from "@/components/ui/ConfirmDialog";
import { submitOrderForCalculationAction } from "@/server/domains/orders/actions";

export function SubmitForCalculationButton({
  orderId,
  disabled,
  disabledReason,
  asAdmin = false,
}: {
  orderId: string;
  disabled?: boolean;
  disabledReason?: string;
  /** Admin already does calc — wording is «start calculation», not «send to admin». */
  asAdmin?: boolean;
}) {
  const router = useRouter();
  const dialog = useAppDialog();
  const [pending, startTransition] = useTransition();

  async function submit() {
    if (disabled) return;
    const ok = await dialog.ask({
      title: asAdmin ? "Перевести на розрахунок?" : "Передати на розрахунок?",
      message: asAdmin
        ? "Замовлення перейде в статус «Розрахунок», і можна буде продовжити калькуляцію."
        : "Замовлення піде адміністратору на розрахунок. Після цього комплектацію зможе змінювати лише адмін.",
      confirmLabel: asAdmin ? "До розрахунку" : "Передати",
    });
    if (!ok) return;
    const formData = new FormData();
    formData.set("orderId", orderId);
    startTransition(async () => {
      const result = await submitOrderForCalculationAction(formData);
      if (!result.ok) {
        const messages: Record<string, string> = {
          INCOMPLETE: "Заповніть кількості, матеріали та операції по всіх позиціях.",
          NO_ITEMS: "Додайте хоча б одну позицію.",
          NOT_DRAFT: "Замовлення вже не в статусі чернетки.",
          NOT_FOUND: "Замовлення не знайдено.",
          VALIDATION: "Некоректний запит.",
        };
        await dialog.notice({
          title: "Не вдалося передати",
          message: messages[result.error] ?? "Не вдалося передати на розрахунок.",
        });
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {dialog.view}
      <Button
        type="button"
        onClick={submit}
        disabled={disabled || pending}
        title={disabled ? disabledReason : undefined}
      >
        {pending
          ? asAdmin
            ? "Перехід…"
            : "Передача…"
          : asAdmin
            ? "До розрахунку"
            : "На розрахунок адміну"}
      </Button>
    </>
  );
}
