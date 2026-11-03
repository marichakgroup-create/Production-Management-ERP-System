"use client";

import { useState } from "react";
import Link from "next/link";
import { orderPipeline, orderStatusLabel } from "@/lib/order-status";
import { cn, formatDateUk, formatMoneyShort } from "@/lib/utils";

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
        <div className="mt-1.5 border-t border-[var(--color-divider)] pt-1.5">
          {collapseProducts ? (
            <button
              type="button"
              className="text-[12px] font-medium text-[var(--color-primary-700)] hover:underline"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              {open ? "Згорнути вироби" : `Вироби · ${products.length}`}
            </button>
          ) : null}
          {!collapseProducts || open ? (
            <ul className={cn("space-y-0.5", collapseProducts && "mt-1")}>
              {products.map((product, index) => (
                <li
                  key={`${index}-${product.name}`}
                  className="truncate text-[12px] text-[var(--color-text-secondary)]"
                >
                  {product.name}
                  {product.qty > 0 ? (
                    <span className="text-[var(--color-text-tertiary)]"> · {product.qty} шт</span>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : null}
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
  const columns = orderPipeline.map((status) => ({
    status,
    label: orderStatusLabel[status] ?? status,
    orders: orders
      .filter((order) => order.status === status)
      .sort((a, b) => {
        if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
        const aDays = daysLeft(a.deadline) ?? 9999;
        const bDays = daysLeft(b.deadline) ?? 9999;
        return aDays - bDays;
      }),
  }));

  return (
    <section
      aria-label="Замовлення за етапами"
      className={cn(fill && "flex min-h-0 flex-1 flex-col")}
    >
      <div className="mb-2 flex shrink-0 items-baseline justify-end gap-3">
        <Link
          href="/orders"
          className="type-caption text-[var(--color-text-quiet)] hover:text-[var(--color-primary-700)]"
        >
          Усі замовлення
        </Link>
      </div>
      <div className={cn("overflow-x-auto pb-1", fill && "min-h-0 flex-1")}>
        <div
          className={cn("grid min-w-[980px] gap-3", fill && "h-full")}
          style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(0, 1fr))` }}
        >
          {columns.map((column) => (
            <div
              key={column.status}
              className={cn(
                "flex min-h-[12rem] flex-col rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-subtle)]",
                fill && "h-full min-h-0",
              )}
            >
              <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[var(--color-divider)] px-2.5 py-2">
                <h3 className="truncate text-[13px] font-semibold text-[var(--color-text-primary)]">
                  {column.label}
                </h3>
                <span className="type-caption tabular">{column.orders.length}</span>
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
          ))}
        </div>
      </div>
    </section>
  );
}
