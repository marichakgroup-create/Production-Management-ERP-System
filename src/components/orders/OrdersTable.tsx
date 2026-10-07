"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  CellStack,
  Table,
  TableEmpty,
  TableRowButton,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import {
  RowCheckbox,
  SelectionBar,
  SortableTH,
  sortRows,
  useRowSelection,
  useTableSort,
} from "@/components/ui/table-interactions";
import { BulkDeleteButton, OpenSelectedLink } from "@/components/ui/BulkDeleteButton";
import {
  IconAlert,
  IconChevronDown,
  IconChevronRight,
  IconGarment,
  IconInfo,
  IconOrders,
} from "@/components/ui/Icons";
import { cn, formatDateUk, formatMoneyShort, formatMoneyUah } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { bulkCancelOrdersAction } from "@/server/domains/orders/actions";

export type OrdersTableRow = {
  id: string;
  number: string;
  title: string | null;
  status: string;
  deadline: string | null;
  createdAt: string;
  updatedAt: string;
  clientName: string;
  items: Array<{
    id: string;
    nameUk: string;
    totalQuantity: number;
    amount: number | null;
  }>;
};

type SortKey = "number" | "client" | "amount" | "status" | "deadline" | "created" | "updated";

function deadlineState(deadline: string | null) {
  if (!deadline) return "none" as const;
  const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
  if (days < 0) return "overdue" as const;
  if (days <= 3) return "soon" as const;
  return "ok" as const;
}

function itemsSummary(items: OrdersTableRow["items"]) {
  const qty = items.reduce((sum, item) => sum + item.totalQuantity, 0);
  if (items.length === 0) return { title: "Без позицій", subtitle: undefined as string | undefined };
  if (items.length === 1) {
    return {
      title: items[0].nameUk,
      subtitle: qty > 0 ? `${qty} шт` : undefined,
    };
  }
  return {
    title: `${items.length} позиції`,
    subtitle: qty > 0 ? `${qty} шт разом` : undefined,
  };
}

function orderAmount(order: OrdersTableRow) {
  return order.items.reduce((sum, item) => sum + (item.amount ?? 0), 0);
}

/**
 * Orders list with expand-for-lines, sortable columns, row selection and bulk cancel.
 */
export function OrdersTable({
  orders,
  empty,
  canDelete = false,
  showAmounts = true,
}: {
  orders: OrdersTableRow[];
  empty: { title: string; description?: string; action?: React.ReactNode };
  canDelete?: boolean;
  showAmounts?: boolean;
}) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const { sort, toggle } = useTableSort<SortKey>({ key: "number", direction: "desc" });

  const colCount = (showAmounts ? 7 : 6) + 2;

  const sorted = useMemo(
    () =>
      sortRows(orders, sort, {
        number: (row) => row.number,
        client: (row) => row.clientName,
        amount: (row) => orderAmount(row),
        status: (row) => row.status,
        deadline: (row) => row.deadline,
        created: (row) => row.createdAt,
        updated: (row) => row.updatedAt,
      }),
    [orders, sort],
  );

  const ids = useMemo(() => sorted.map((order) => order.id), [sorted]);
  const selection = useRowSelection(ids);

  function toggleExpand(id: string) {
    setExpanded((prev) => ({ ...prev, [id]: !prev[id] }));
  }

  return (
    <div>
      <SelectionBar count={selection.selectedIds.length} onClear={selection.clear}>
        {selection.selectedIds.length === 1 ? (
          <OpenSelectedLink href={`/orders/${selection.selectedIds[0]}`} />
        ) : null}
        {canDelete ? (
          <BulkDeleteButton
            ids={selection.selectedIds}
            action={bulkCancelOrdersAction}
            title="Скасувати замовлення?"
            description="Обрані замовлення отримають статус «Скасовано». Історія та версії збережуться."
            onDone={selection.clear}
          />
        ) : null}
      </SelectionBar>

      <Table>
        <THead>
          <TH width="40px" align="center">
            <RowCheckbox
              checked={selection.allSelected}
              indeterminate={selection.someSelected}
              onChange={selection.toggleAll}
              label="Обрати всі"
            />
          </TH>
          <TH width="36px" />
          <SortableTH columnKey="number" sort={sort} onSort={toggle}>
            Замовлення
          </SortableTH>
          <SortableTH columnKey="client" sort={sort} onSort={toggle}>
            Клієнт / склад
          </SortableTH>
          {showAmounts ? (
            <SortableTH
              columnKey="amount"
              sort={sort}
              onSort={toggle}
              align="right"
              title="Ціна для клієнта вже з урахуванням маржі — це не собівартість"
            >
              Сума продажу
            </SortableTH>
          ) : null}
          <SortableTH columnKey="status" sort={sort} onSort={toggle}>
            Стан
          </SortableTH>
          <SortableTH columnKey="updated" sort={sort} onSort={toggle}>
            Змінено
          </SortableTH>
          <SortableTH columnKey="created" sort={sort} onSort={toggle}>
            Створено
          </SortableTH>
          <TH align="right" stickyRight width="120px">
            Дії
          </TH>
        </THead>
        <TBody>
          {sorted.length === 0 ? (
            <TableEmpty
              colSpan={colCount}
              icon={<IconGarment size={24} />}
              title={empty.title}
              description={empty.description}
              action={empty.action}
            />
          ) : (
            sorted.map((order) => {
              const isOpen = Boolean(expanded[order.id]);
              const isSelected = selection.isSelected(order.id);
              const state = deadlineState(order.deadline);
              const summary = itemsSummary(order.items);
              const totalValue = orderAmount(order);
              const hasAmount = order.items.some((item) => item.amount != null);

              return (
                <FragmentRows key={order.id}>
                  <TR
                    className={cn(
                      isSelected && "bg-[var(--color-tint-slate)] hover:bg-[var(--color-tint-slate)]",
                    )}
                  >
                    <TD align="center">
                      <RowCheckbox
                        checked={isSelected}
                        onChange={() => selection.toggleOne(order.id)}
                        label={`Обрати ${order.number}`}
                      />
                    </TD>
                    <TD align="center">
                      <button
                        type="button"
                        aria-expanded={isOpen}
                        aria-label={isOpen ? "Згорнути позиції" : "Показати позиції"}
                        onClick={() => toggleExpand(order.id)}
                        className="inline-flex h-7 w-7 items-center justify-center rounded-[6px] text-[var(--color-text-tertiary)] hover:bg-[var(--color-surface-hover)] hover:text-[var(--color-text-primary)]"
                      >
                        {isOpen ? <IconChevronDown size={16} /> : <IconChevronRight size={16} />}
                      </button>
                    </TD>
                    <TD>
                      <CellStack
                        title={<span className="tabular">{order.number}</span>}
                        subtitle={order.clientName}
                        href={`/orders/${order.id}`}
                        maxWidth="200px"
                      />
                    </TD>
                    <TD title={summary.title}>
                      <CellStack
                        title={
                          <span className="font-normal text-[var(--color-text-secondary)]">
                            {summary.title}
                          </span>
                        }
                        subtitle={summary.subtitle}
                        maxWidth="240px"
                      />
                    </TD>
                    {showAmounts ? (
                    <TD numeric className="font-medium text-[var(--color-text-primary)]">
                      {hasAmount ? (
                        formatMoneyShort(totalValue)
                      ) : (
                        <span
                          className="font-normal text-[var(--color-text-quiet)]"
                          title="Сума зʼявиться після збереження пропозиції"
                        >
                          —
                        </span>
                      )}
                    </TD>
                    ) : null}
                    <TD nowrap>
                      <div className="flex flex-col items-start gap-1">
                        <OrderStatusBadge status={order.status} />
                        <span
                          className={cn(
                            "type-caption tabular inline-flex items-center gap-1",
                            state === "overdue" && "font-medium text-[var(--color-danger-text)]",
                            state === "soon" && "font-medium text-[var(--color-warning-text)]",
                          )}
                        >
                          {state === "overdue" || state === "soon" ? <IconAlert size={12} /> : null}
                          {order.deadline ? `до ${formatDateUk(order.deadline)}` : "без дедлайну"}
                        </span>
                      </div>
                    </TD>
                    <TD nowrap className="tabular type-caption text-[var(--color-text-secondary)]">
                      {formatDateUk(order.updatedAt)}
                    </TD>
                    <TD nowrap className="tabular type-caption text-[var(--color-text-secondary)]">
                      {formatDateUk(order.createdAt)}
                    </TD>
                    <TD align="right" stickyRight nowrap>
                      <div className="inline-flex items-center gap-0.5">
                        <Link
                          href={`/orders/${order.id}`}
                          className="inline-flex h-7 items-center rounded-[6px] px-2 text-[12.5px] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-hover)]"
                        >
                          Відкрити
                        </Link>
                        <TableRowButton
                          aria-label="Деталі замовлення"
                          title="Інфо"
                          onClick={() => toggleExpand(order.id)}
                        >
                          <IconInfo size={14} />
                        </TableRowButton>
                      </div>
                    </TD>
                  </TR>

                  {isOpen ? (
                    <tr className="border-b border-[var(--color-divider)] bg-[var(--color-surface-subtle)]">
                      <td colSpan={colCount} className="px-3 py-3">
                        <div className="ml-12 overflow-hidden rounded-[8px] border border-[var(--color-border)] bg-[var(--color-surface)]">
                          <div className="flex items-center gap-2 border-b border-[var(--color-divider)] px-3 py-2">
                            <IconOrders size={14} className="text-[var(--color-text-tertiary)]" />
                            <span className="text-[12.5px] font-semibold text-[var(--color-text-secondary)]">
                              Позиції в замовленні
                            </span>
                            {order.title ? (
                              <span className="type-caption truncate">· {order.title}</span>
                            ) : null}
                          </div>
                          {order.items.length === 0 ? (
                            <p className="px-3 py-4 type-caption">Позицій ще немає</p>
                          ) : (
                            <table className="erp-table w-full text-[12.5px]">
                              <thead>
                                <tr className="border-b border-[var(--color-table-section-border)] text-left">
                                  <th className="px-3 py-1.5">Виріб</th>
                                  <th className="px-3 py-1.5 text-right">К-сть</th>
                                  {showAmounts ? (
                                    <th
                                      className="cursor-help px-3 py-1.5 text-right"
                                      title="Сума продажу клієнту вже з урахуванням маржі"
                                    >
                                      Сума продажу
                                    </th>
                                  ) : null}
                                  <th className="px-3 py-1.5 text-right" />
                                </tr>
                              </thead>
                              <tbody>
                                {order.items.map((item, index) => (
                                  <tr
                                    key={item.id}
                                    className="border-b border-[var(--color-divider)] last:border-0"
                                  >
                                    <td className="px-3 py-2">
                                      <span className="mr-2 tabular text-[var(--color-text-tertiary)]">
                                        {index + 1}.
                                      </span>
                                      <span className="font-medium text-[var(--color-text-primary)]">
                                        {item.nameUk}
                                      </span>
                                    </td>
                                    <td className="px-3 py-2 text-right tabular text-[var(--color-text-secondary)]">
                                      {item.totalQuantity} шт
                                    </td>
                                    {showAmounts ? (
                                      <td className="px-3 py-2 text-right tabular text-[var(--color-text-secondary)]">
                                        {item.amount != null ? formatMoneyUah(item.amount) : "—"}
                                      </td>
                                    ) : null}
                                    <td className="px-3 py-2 text-right">
                                      <button
                                        type="button"
                                        className="text-[12px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:underline"
                                        onClick={() =>
                                          router.push(`/orders/${order.id}?item=${item.id}`)
                                        }
                                      >
                                        До позиції
                                      </button>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </FragmentRows>
              );
            })
          )}
        </TBody>
      </Table>
    </div>
  );
}

function FragmentRows({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
