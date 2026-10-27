"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
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
  const [pending, startTransition] = useTransition();

  function submit() {
    if (disabled) return;
    if (
      !window.confirm(
        asAdmin
          ? "Перевести замовлення в статус «Розрахунок» і продовжити калькуляцію?"
          : "Передати замовлення адміністратору на розрахунок? Після цього комплектацію зможе змінювати лише адмін.",
      )
    ) {
      return;
    }
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
        window.alert(messages[result.error] ?? "Не вдалося передати на розрахунок.");
        return;
      }
      router.refresh();
    });
  }

  return (
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
  );
}
