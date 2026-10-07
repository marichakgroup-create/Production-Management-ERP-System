export type OrderStatus =
  | "DRAFT"
  | "CALCULATION"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "HANDED_TO_PRODUCTION"
  | "CLOSED"
  | "CANCELLED";

export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger" | "info";

export const orderStatusLabel: Record<string, string> = {
  DRAFT: "Чернетка",
  CALCULATION: "Розрахунок",
  PENDING_APPROVAL: "На погодженні",
  APPROVED: "Погоджено",
  HANDED_TO_PRODUCTION: "У виробництві",
  CLOSED: "Закрито",
  CANCELLED: "Архів",
};

export const orderStatusTone: Record<string, BadgeTone> = {
  DRAFT: "neutral",
  CALCULATION: "info",
  PENDING_APPROVAL: "warning",
  APPROVED: "success",
  HANDED_TO_PRODUCTION: "accent",
  CLOSED: "neutral",
  CANCELLED: "danger",
};

/** Hover hint: what the status means and the typical next step. */
export const orderStatusHint: Record<string, string> = {
  DRAFT:
    "Менеджер збирає замовлення: вироби, матеріали, орієнтовний тираж. Далі — передати на розрахунок адміністратору.",
  CALCULATION:
    "Адмін рахує собівартість і зберігає пропозицію. КП можна друкувати для базових розмірів XS–XXL. Розкладка розмірів — перед цехом.",
  PENDING_APPROVAL:
    "Пропозиція очікує погодження. Після «Погодити» — розкладка розмірів і передача у виробництво.",
  APPROVED:
    "Ціну погоджено. Перед цехом розкладіть тираж по реальних розмірах (якщо ще орієнтовний).",
  HANDED_TO_PRODUCTION:
    "Замовлення у виробництві. Склад і ціна зафіксовані; доступна специфікація.",
  CLOSED:
    "Замовлення завершено. Дані збережені для історії; редагування комплектації недоступне.",
  CANCELLED:
    "Замовлення скасовано і виключено з активного пайплайну. Подальша робота по ньому не ведеться.",
};

export function orderStatusHintFor(status: string): string {
  return orderStatusHint[status] ?? "Статус замовлення в системі.";
}

/** Ordered pipeline used by the order stepper. */
export const orderPipeline: OrderStatus[] = [
  "DRAFT",
  "CALCULATION",
  "PENDING_APPROVAL",
  "APPROVED",
  "HANDED_TO_PRODUCTION",
];

