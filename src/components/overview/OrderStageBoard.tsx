"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { IconChevronDown, IconChevronLeft, IconChevronRight } from "@/components/ui/Icons";
import { orderPipeline, orderStatusLabel } from "@/lib/order-status";
import { cn, formatDateUk, formatMoneyShort } from "@/lib/utils";

const filterType =
  "bg-transparent text-[13px]! font-medium! leading-none outline-none focus-visible:outline-none!";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Нд"];
const MONTHS = [
  "січень",
  "лютий",
  "березень",
  "квітень",
  "травень",
  "червень",
  "липень",
  "серпень",
  "вересень",
  "жовтень",
  "листопад",
  "грудень",
];

function filterDateLabel(value: string, empty: string) {
  if (!value) return empty;
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return empty;
  return `${day}.${month}.${year}`;
}

function isoFromDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function dateFromIso(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function monthCells(cursor: Date) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const startPad = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const cells: Array<{ iso: string; day: number; inMonth: boolean }> = [];
  for (let index = 0; index < startPad; index += 1) {
    const date = new Date(year, month, 1 - (startPad - index));
    cells.push({ iso: isoFromDate(date), day: date.getDate(), inMonth: false });
  }
  for (let day = 1; day <= days; day += 1) {
    cells.push({ iso: isoFromDate(new Date(year, month, day)), day, inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const previous = dateFromIso(cells[cells.length - 1].iso);
    const date = new Date(previous ?? new Date());
    date.setDate(date.getDate() + 1);
    cells.push({ iso: isoFromDate(date), day: date.getDate(), inMonth: false });
  }
  return cells;
}

function DeadlineField({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: string;
  min?: string;
  max?: string;
  onChange: (next: string) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [cursor, setCursor] = useState(() => dateFromIso(value) ?? new Date());

  useEffect(() => {
    if (!open) return;
    setCursor(dateFromIso(value) ?? new Date());
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (buttonRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, value]);

  const rect = open ? buttonRef.current?.getBoundingClientRect() : null;
  const today = isoFromDate(new Date());
  const cells = monthCells(cursor);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={label === "від" ? "Дедлайн від" : "Дедлайн до"}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className={cn(
          "inline-flex h-8 w-[12.5rem] items-center justify-between gap-3 rounded-[8px] border bg-[var(--color-surface)] px-2.5 text-[13px]! font-medium!",
          open
            ? "border-[var(--color-primary-500)] ring-2 ring-[var(--color-focus-ring)]"
            : "border-[var(--color-border)]",
        )}
      >
        <span className="text-[var(--color-text-secondary)]">{label}</span>
        <span className={value ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-disabled)]"}>
          {filterDateLabel(value, "дд.мм.рррр")}
        </span>
      </button>
      {open && rect
        ? createPortal(
            <div
              ref={panelRef}
              role="dialog"
              aria-label={label === "від" ? "Дедлайн від" : "Дедлайн до"}
              className="fixed z-[80] w-[17.5rem] rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface)] p-3 shadow-[0_12px_32px_rgba(15,23,32,0.12)]"
              style={{ top: rect.bottom + 6, left: Math.min(rect.left, window.innerWidth - 288) }}
            >
              <div className="mb-2 flex items-center justify-between">
                <button
                  type="button"
                  aria-label="Попередній місяць"
                  className="flex size-7 items-center justify-center rounded-[6px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
                >
                  <IconChevronLeft size={15} />
                </button>
                <p className="text-[13px] font-medium capitalize text-[var(--color-text-primary)]">
                  {MONTHS[cursor.getMonth()]} {cursor.getFullYear()}
                </p>
                <button
                  type="button"
                  aria-label="Наступний місяць"
                  className="flex size-7 items-center justify-center rounded-[6px] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-subtle)]"
                  onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
                >
                  <IconChevronRight size={15} />
                </button>
              </div>
              <div className="grid grid-cols-7 gap-0.5">
                {WEEKDAYS.map((day) => (
                  <span
                    key={day}
                    className="py-1 text-center text-[11px] font-medium text-[var(--color-text-tertiary)]"
                  >
                    {day}
                  </span>
                ))}
                {cells.map((cell) => {
                  const disabled = Boolean((min && cell.iso < min) || (max && cell.iso > max));
                  const selected = cell.iso === value;
                  return (
                    <button
                      key={cell.iso}
                      type="button"
                      disabled={disabled}
                      onClick={() => {
                        onChange(cell.iso);
                        setOpen(false);
                      }}
                      className={cn(
                        "h-8 rounded-[6px] text-[13px] font-medium tabular",
                        selected && "bg-[var(--color-primary-600)] text-[var(--color-on-primary)]",
                        !selected &&
                          cell.inMonth &&
                          "text-[var(--color-text-primary)] hover:bg-[var(--color-surface-subtle)]",
                        !selected && !cell.inMonth && "text-[var(--color-text-disabled)]",
                        !selected && cell.iso === today && "ring-1 ring-[var(--color-primary-300)]",
                        disabled && "pointer-events-none opacity-30",
                      )}
                    >
                      {cell.day}
                    </button>
                  );
                })}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function deadlineKey(deadline: string | null) {
  if (!deadline) return null;
  const date = new Date(deadline);
  if (Number.isNaN(date.getTime())) return null;
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * One hue, three stops: fill, mark, ink.
 * Ink on fill is at least 7:1. The mark is a non-text swatch, at least 4.5:1.
 */
const stageLook: Record<string, { fill: string; mark: string; ink: string }> = {
  DRAFT: { fill: "#F4F6F8", mark: "#5C6B7C", ink: "#243140" },
  CALCULATION: { fill: "#EAF2FB", mark: "#2C6AAD", ink: "#143E6E" },
  PENDING_APPROVAL: { fill: "#FBF4E6", mark: "#8F6114", ink: "#6B4708" },
  APPROVED: { fill: "#E8F6EE", mark: "#1C7A4C", ink: "#0A4A30" },
  HANDED_TO_PRODUCTION: { fill: "#E7F5F6", mark: "#157984", ink: "#0A4C54" },
};

export type StageBoardOrder = {
  id: string;
  number: string;
  status: string;
  deadline: string | null;
  clientName: string;
  managerName: string;
  title: string | null;
  productName: string;
  products: Array<{ name: string; qty: number }>;
  amount: number;
  overdue: boolean;
};

function daysLeft(deadline: string | null) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

function OrderMiniCard({
  order,
  showAmount,
}: {
  order: StageBoardOrder;
  showAmount: boolean;
}) {
  const [open, setOpen] = useState(false);
  const products = order.products.length
    ? order.products
    : order.productName && order.productName !== "—"
      ? [{ name: order.productName, qty: 0 }]
      : [];
  const days = daysLeft(order.deadline);
  const name = order.title?.trim() || order.productName;
  const manager = order.managerName?.split(" ")[0] || "—";
  const collapseProducts = products.length > 2;

  return (
    <article
      className={cn(
        "rounded-[8px] border bg-[var(--color-surface)] px-2.5 py-2",
        order.overdue
          ? "border-[#e7c7c3] bg-[#fdf8f7]"
          : "border-[var(--color-border)]",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/orders/${order.id}`}
          className="min-w-0 truncate text-[13px] font-semibold text-[var(--color-text-primary)] hover:text-[var(--color-primary-700)] hover:underline"
        >
          {name}
        </Link>
        {showAmount ? (
          <span className="shrink-0 text-[12.5px] font-medium tabular text-[var(--color-text-primary)]">
            {order.amount > 0 ? formatMoneyShort(order.amount) : "—"}
          </span>
        ) : null}
      </div>
      <p className="mt-0.5 truncate text-[11.5px] tabular text-[var(--color-text-tertiary)]">
        {order.number}
      </p>
      <p className="mt-1 truncate text-[12px] text-[var(--color-text-quiet)]">
        {order.clientName}
        <span className="mx-1 text-[var(--color-text-tertiary)]">·</span>
        {manager}
      </p>
      {order.deadline ? (
        <p
          className={cn(
            "mt-0.5 text-[11.5px] tabular",
            order.overdue
              ? "font-medium text-[var(--color-danger-text)]"
              : "text-[var(--color-text-tertiary)]",
          )}
        >
          до {formatDateUk(order.deadline)}
          {days != null && days < 0 ? ` · −${Math.abs(days)} дн.` : ""}
        </p>
      ) : null}
      {products.length > 0 ? (
        <div className="mt-1.5">
          {collapseProducts ? (
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
              className="flex w-full items-center gap-1 rounded-[7px] px-1 py-0.5 text-left hover:bg-[var(--color-surface-subtle)]"
            >
              <IconChevronDown
                size={13}
                className={cn(
                  "shrink-0 text-[var(--color-text-tertiary)] transition-transform duration-200",
                  open && "rotate-180",
                )}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-secondary)]">
                {open ? "Вироби" : products[0]?.name}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--color-surface-subtle)] px-1.5 text-[11px] tabular leading-4 text-[var(--color-text-tertiary)]">
                {products.length}
              </span>
            </button>
          ) : null}
          <div
            className={cn(
              "grid transition-[grid-template-rows] duration-200 ease-out",
              !collapseProducts || open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
            )}
          >
            <ul
              className={cn(
                "overflow-hidden",
                collapseProducts && open && "mt-0.5 rounded-[7px] bg-[var(--color-surface-subtle)] px-1.5 py-1",
              )}
            >
              {products.map((product, index) => (
                <li
                  key={`${index}-${product.name}`}
                  className={cn(
                    "flex items-baseline gap-2 py-px",
                    collapseProducts ? "pl-0.5" : "pl-[2px]",
                  )}
                >
                  <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--color-text-secondary)]">
                    {product.name}
                  </span>
                  {product.qty > 0 ? (
                    <span className="shrink-0 text-[11px] tabular text-[var(--color-text-tertiary)]">
                      {product.qty} шт
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function OrderStageBoard({
  orders,
  showAmounts,
  fill = false,
}: {
  orders: StageBoardOrder[];
  showAmounts: boolean;
  /** Stretch columns to the remaining window and scroll inside them. */
  fill?: boolean;
}) {
  const [client, setClient] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const filtering = Boolean(client || from || to);

  const clients = useMemo(
    () =>
      [...new Set(orders.map((order) => order.clientName).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, "uk"),
      ),
    [orders],
  );

  const visibleOrders = useMemo(
    () =>
      orders.filter((order) => {
        if (client && order.clientName !== client) return false;
        if (!from && !to) return true;
        const key = deadlineKey(order.deadline);
        if (!key) return false;
        if (from && key < from) return false;
        if (to && key > to) return false;
        return true;
      }),
    [orders, client, from, to],
  );

  const columns = orderPipeline.map((status) => {
    const columnOrders = visibleOrders
      .filter((order) => order.status === status)
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        const aDays = daysLeft(a.deadline) ?? 9999;
        const bDays = daysLeft(b.deadline) ?? 9999;
        return aDays - bDays;
      });
    return {
      status,
      label:
        status === "PENDING_APPROVAL"
          ? "Погодження"
          : (orderStatusLabel[status] ?? status),
      look: stageLook[status] ?? stageLook.DRAFT,
      amount: columnOrders.reduce((sum, order) => sum + order.amount, 0),
      overdue: columnOrders.filter((order) => order.overdue).length,
      orders: columnOrders,
    };
  });

  return (
    <section
      aria-label="Замовлення за етапами"
      className={cn(fill && "flex min-h-0 flex-1 flex-col")}
    >
      <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <label className="relative inline-flex h-8 items-center">
            <select
              aria-label="Замовник"
              value={client}
              onChange={(event) => setClient(event.target.value)}
              className={cn(
                filterType,
                "h-8 appearance-none rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)] py-0 pr-7 pl-2.5 focus:border-[var(--color-primary-500)] focus:ring-2 focus:ring-[var(--color-focus-ring)]",
                client ? "text-[var(--color-text-primary)]" : "text-[var(--color-text-secondary)]",
              )}
            >
              <option value="">Усі замовники</option>
              {clients.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <IconChevronDown
              size={14}
              className="pointer-events-none absolute right-2 text-[var(--color-text-tertiary)]"
            />
          </label>
          <DeadlineField label="від" value={from} max={to || undefined} onChange={setFrom} />
          <DeadlineField label="до" value={to} min={from || undefined} onChange={setTo} />
          <button
            type="button"
            disabled={!filtering}
            onClick={() => {
              setClient("");
              setFrom("");
              setTo("");
            }}
            className="h-8 rounded-[8px] px-2.5 text-[13px]! font-medium! text-[var(--color-text-secondary)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text-primary)] disabled:pointer-events-none disabled:text-[var(--color-text-disabled)]"
          >
            Скинути
          </button>
        </div>
        <Link
          href="/orders"
          className="type-caption shrink-0 text-[var(--color-text-quiet)] hover:text-[var(--color-primary-700)]"
        >
          Усі замовлення
        </Link>
      </div>
      <div className={cn("overflow-x-auto pb-1", fill && "min-h-0 flex-1")}>
        <div
          className={cn("grid min-w-[980px] gap-3", fill && "h-full")}
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((column) => {
            return (
            <div
              key={column.status}
              className={cn(
                "flex min-h-[12rem] flex-col overflow-hidden rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)]",
                fill && "h-full min-h-0",
              )}
            >
              <div
                className="flex shrink-0 items-center gap-2 px-2.5 py-2"
                style={{ background: column.look.fill }}
              >
                <span
                  aria-hidden
                  className="h-3.5 w-[3px] shrink-0 rounded-full"
                  style={{ background: column.look.mark }}
                />
                <h3
                  className="min-w-0 flex-1 truncate text-[13px] font-medium leading-4 tracking-[-0.011em]"
                  style={{ color: column.look.ink }}
                >
                  {column.label}
                </h3>
                {showAmounts && column.amount > 0 ? (
                  <span
                    className="shrink-0 text-[12px] font-medium tabular leading-4"
                    style={{ color: column.look.ink }}
                  >
                    {formatMoneyShort(column.amount)}
                  </span>
                ) : null}
                <span
                  className="shrink-0 text-[12px] font-medium tabular leading-4"
                  style={{ color: column.look.ink }}
                >
                  {column.orders.length}
                </span>
                {column.overdue > 0 ? (
                  <span
                    aria-label={`${column.overdue} прострочено`}
                    title={`${column.overdue} прострочено`}
                    className="size-1.5 shrink-0 rounded-full bg-[var(--color-danger-text)]"
                  />
                ) : null}
              </div>
              <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-1.5">
                {column.orders.length === 0 ? (
                  <p className="px-1.5 py-3 text-center type-caption">Немає</p>
                ) : (
                  column.orders.map((order) => (
                    <OrderMiniCard key={order.id} order={order} showAmount={showAmounts} />
                  ))
                )}
              </div>
            </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
