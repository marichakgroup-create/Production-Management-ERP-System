"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/Input";
import { updateOrderDeadlineAndPaymentAction } from "@/server/domains/orders/actions";

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function OrderDeadlinePaymentFields({
  orderId,
  deadline,
  paymentMethod,
  canEdit,
}: {
  orderId: string;
  deadline: Date | string | null;
  paymentMethod?: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [deadlineValue, setDeadlineValue] = useState(() => toDateInputValue(deadline));
  const [paymentValue, setPaymentValue] = useState(paymentMethod ?? "");

  useEffect(() => {
    setDeadlineValue(toDateInputValue(deadline));
  }, [deadline]);
  useEffect(() => {
    setPaymentValue(paymentMethod ?? "");
  }, [paymentMethod]);

  function save(patch: { deadline?: string; paymentMethod?: string }) {
    const formData = new FormData();
    formData.set("orderId", orderId);
    if (patch.deadline !== undefined) formData.set("deadline", patch.deadline);
    if (patch.paymentMethod !== undefined) formData.set("paymentMethod", patch.paymentMethod);
    startTransition(async () => {
      await updateOrderDeadlineAndPaymentAction(formData);
      router.refresh();
    });
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Input
        label="Дедлайн"
        type="date"
        optional
        disabled={!canEdit || pending}
        value={deadlineValue}
        onChange={(event) => setDeadlineValue(event.target.value)}
        onBlur={() => {
          if (!canEdit) return;
          if (deadlineValue === toDateInputValue(deadline)) return;
          save({ deadline: deadlineValue });
        }}
        inputClassName="h-9 text-[13px] font-semibold"
      />
      <Input
        label="Спосіб оплати"
        optional
        placeholder="Наприклад: 50% передоплата, решта по готовності"
        disabled={!canEdit || pending}
        value={paymentValue}
        onChange={(event) => setPaymentValue(event.target.value)}
        onBlur={() => {
          if (!canEdit) return;
          if (paymentValue.trim() === (paymentMethod ?? "").trim()) return;
          save({ paymentMethod: paymentValue });
        }}
        inputClassName="h-9 text-[13px] font-semibold"
      />
    </div>
  );
}
