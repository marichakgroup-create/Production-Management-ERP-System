"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Modal } from "@/components/ui/Overlay";
import { Banner } from "@/components/ui/Banner";
import { Checkbox } from "@/components/ui/Field";
import { IconAlert, IconCheckCircle, IconHandover } from "@/components/ui/Icons";
import { handOverAction } from "@/server/domains/orders/actions";
import { formatMoneyUah } from "@/lib/utils";

function toDateInputValue(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export type ReadinessCheck = { key: string; label: string; done: boolean; hint?: string };

const acknowledgements = [
  { key: "composition", label: "Комплектацію перевірено", hint: "Матеріали, норми та операції відповідають виробу" },
  { key: "quantity", label: "Кількість підтверджено", hint: "Розміри та загальна кількість узгоджені з клієнтом" },
  { key: "price", label: "Пропозицію погоджено з клієнтом", hint: "Ціни всіх позицій відповідають надісланому КП" },
];

/**
 * Final check before production handover (ref5): the specification becomes
 * immutable, so every blocking condition is shown explicitly before confirming.
 */
export function HandoverDialog({
  orderId,
  orderNumber,
  productName,
  totalQuantity,
  totalValue,
  checks,
  deadline,
  paymentMethod,
  disabled,
}: {
  orderId: string;
  orderNumber: string;
  productName: string;
  totalQuantity: number;
  totalValue: number;
  checks: ReadinessCheck[];
  deadline?: Date | string | null;
  paymentMethod?: string | null;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [deadlineValue, setDeadlineValue] = useState(() => toDateInputValue(deadline));
  const [paymentValue, setPaymentValue] = useState(paymentMethod ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!open) return;
    setDeadlineValue(toDateInputValue(deadline));
    setPaymentValue(paymentMethod ?? "");
  }, [open, deadline, paymentMethod]);

  const blocking = checks.filter((check) => !check.done);
  const ready = blocking.length === 0;
  const acknowledgedCount = acknowledgements.filter((item) => confirmed[item.key]).length;
  const allAcknowledged = acknowledgedCount === acknowledgements.length;
  const canSubmit = ready && allAcknowledged;
  const blockedReason =
    !ready
      ? "Виконайте умови передачі"
      : !allAcknowledged
        ? "Підтвердіть усі пункти"
        : null;

  function submit() {
    setError(null);
    const formData = new FormData();
    formData.set("orderId", orderId);
    formData.set("deadline", deadlineValue);
    formData.set("paymentMethod", paymentValue);
    startTransition(async () => {
      const result = await handOverAction(formData);
      if (!result.ok) {
        setError(
          result.error === "NO_APPROVED_VERSION"
            ? "Спочатку погодьте пропозицію для клієнта."
            : result.error === "NO_QUANTITY"
              ? "Кількість у замовленні дорівнює нулю."
              : result.error === "NO_ARTWORK"
                ? "Додайте макет нанесення у вкладці «Документи» для кожної позиції з нанесенням."
                : result.error === "SIZES_REQUIRED"
                  ? "Розкладіть тираж по розмірах у Комплектації перед передачею в цех."
                  : result.error === "NO_ITEM"
                    ? "Замовлення порожнє — додайте хоча б одну позицію."
                    : "Не вдалося передати замовлення у виробництво.",
        );
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        variant={ready ? "primary" : "secondary"}
        onClick={() => setOpen(true)}
        disabled={disabled}
        hint={ready ? "handOver" : "handOverNotReady"}
      >
        <IconHandover size={16} />
        Передати у виробництво
      </Button>

      <Modal
        open={open}
        onClose={() => (pending ? undefined : setOpen(false))}
        title="Передача у виробництво"
        description="Фінальна перевірка перед фіксацією специфікації"
        width="lg"
        footer={
          <>
            {blockedReason ? <span className="type-caption mr-auto">{blockedReason}</span> : null}
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Скасувати
            </Button>
            <Button
              variant={canSubmit ? "primary" : "secondary"}
              onClick={submit}
              disabled={!canSubmit || pending}
            >
              {pending ? "Передача…" : "Підтвердити передачу"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[var(--color-divider)] pb-4">
            <div>
              <p className="type-object-title">{orderNumber}</p>
              <p className="type-body-secondary mt-0.5">{productName}</p>
            </div>
            <div className="text-right">
              <p className="type-caption">Загальна сума</p>
              <p className="tabular text-[17px] font-semibold text-[var(--color-primary-700)]">
                {formatMoneyUah(totalValue)}
              </p>
              <p className="type-caption tabular">{totalQuantity} шт</p>
            </div>
          </div>

          <section>
            <h3 className="type-group-label mb-2">Умови замовлення</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Дедлайн"
                type="date"
                optional
                value={deadlineValue}
                onChange={(event) => setDeadlineValue(event.target.value)}
                hint={deadlineValue ? "Можна змінити або залишити порожнім" : "Можна додати зараз або пізніше"}
              />
              <Input
                label="Спосіб оплати"
                optional
                placeholder="Наприклад: 50% передоплата"
                value={paymentValue}
                onChange={(event) => setPaymentValue(event.target.value)}
                hint="Короткий коментар для шапки замовлення"
              />
            </div>
          </section>

          <section>
            <h3 className="type-group-label mb-2 flex items-center justify-between gap-3">
              <span>Умови передачі</span>
              <span
                className={
                  blocking.length === 0
                    ? "text-[var(--color-success-text)]"
                    : "text-[var(--color-danger-text)]"
                }
              >
                {checks.length - blocking.length} / {checks.length}
              </span>
            </h3>
            <ul className="grid gap-1.5 sm:grid-cols-2">
              {checks.map((check) => (
                <li key={check.key} className="flex items-start gap-2 text-[13.5px]">
                  {check.done ? (
                    <IconCheckCircle size={16} className="mt-0.5 text-[var(--color-success-text)]" />
                  ) : (
                    <IconAlert size={16} className="mt-0.5 text-[var(--color-danger-text)]" />
                  )}
                  <span className="min-w-0">
                    <span
                      className={
                        check.done ? "text-[var(--color-text-primary)]" : "text-[var(--color-danger-text)]"
                      }
                    >
                      {check.label}
                    </span>
                    {check.hint ? <span className="type-caption block">{check.hint}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          </section>

          <section>
            <h3 className="type-group-label mb-1 flex items-center justify-between gap-3">
              <span>Підтвердження менеджера</span>
              <span className={allAcknowledged ? "text-[var(--color-success-text)]" : undefined}>
                {acknowledgedCount} / {acknowledgements.length}
              </span>
            </h3>
            <div className="grid gap-0.5 sm:grid-cols-2">
              {acknowledgements.map((item) => (
                <Checkbox
                  key={item.key}
                  label={item.label}
                  description={item.hint}
                  checked={Boolean(confirmed[item.key])}
                  onChange={(event) =>
                    setConfirmed((prev) => ({ ...prev, [item.key]: event.target.checked }))
                  }
                />
              ))}
            </div>
          </section>

          {blocking.length > 0 ? (
            <Banner tone="danger" title="Передача заблокована">
              Спочатку виконайте: {blocking.map((check) => check.label.toLowerCase()).join(", ")}.
            </Banner>
          ) : (
            <Banner tone="warning" title="Після підтвердження специфікація стає незмінною">
              Подальші зміни комплектації або ціни потребуватимуть нової пропозиції та повторного погодження.
            </Banner>
          )}

          {error ? <Banner tone="danger">{error}</Banner> : null}
        </div>
      </Modal>
    </>
  );
}
