import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClient } from "@/server/domains/clients/service";
import { Breadcrumbs, HeaderBlock, QuickAction, QuickActions } from "@/components/ui/ObjectHeader";
import { DescriptionList, Stat } from "@/components/ui/DescriptionList";
import {
  Table,
  TableCard,
  TableEmpty,
  TableToolbar,
  TBody,
  TD,
  TH,
  THead,
  TR,
} from "@/components/ui/Table";
import { IconClients, IconOrders, IconPlus } from "@/components/ui/Icons";
import { formatDateUk, formatMoneyShort } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PartyPeopleEditor } from "@/components/contacts/PartyPeopleEditor";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";

function isOverdue(deadline: Date | undefined) {
  return deadline ? deadline.getTime() < Date.now() : false;
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const { id } = await params;
  const client = await getClient(id);
  if (!client) notFound();

  const canEdit = accessHas(access, "manageClients");
  const primary =
    client.contacts.find((person) => person.isPrimary) ?? client.contacts[0] ?? null;

  const activeOrders = client.orders.filter(
    (order) => !["CLOSED", "CANCELLED"].includes(order.status),
  ).length;
  const lastOrder = client.orders[0];

  const orderValue = (order: (typeof client.orders)[number]) =>
    Number(order.items[0]?.versions[0]?.totalSellingValue ?? 0);
  const totalValue = client.orders.reduce((sum, order) => sum + orderValue(order), 0);

  const nextDeadline = client.orders
    .filter((order) => order.deadline && !["CLOSED", "CANCELLED"].includes(order.status))
    .map((order) => order.deadline as Date)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  const deadlineOverdue = isOverdue(nextDeadline);

  const subtitleBits = [
    primary?.nameUk || client.contactPerson || null,
    client.phone || primary?.phone || null,
    client.email || primary?.email || null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Контакти", href: "/clients" }, { label: client.companyName }]} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="type-page-title">{client.companyName}</h1>
          <p className="type-body-secondary mt-1">
            {subtitleBits.length > 0 ? subtitleBits.join(" · ") : "Контакти не заповнені"}
          </p>
        </div>
        <Link href={`/orders/new?clientId=${client.id}`} className="btn-primary">
          <IconPlus size={16} />
          Нове замовлення
        </Link>
      </div>

      <QuickActions>
        <QuickAction
          icon={<IconOrders size={15} />}
          href={`/orders?client=${client.id}`}
          hint="clientOrders"
        >
          Усі замовлення
        </QuickAction>
        {(client.email || primary?.email) ? (
          <QuickAction
            icon={<IconClients size={15} />}
            href={`mailto:${client.email || primary?.email}`}
            hint="clientEmail"
          >
            Написати
          </QuickAction>
        ) : null}
      </QuickActions>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <HeaderBlock title="Компанія">
          <DescriptionList
            items={[
              {
                label: "Телефон",
                value: client.phone ? (
                  <a href={`tel:${client.phone}`} className="hover:text-[var(--color-primary-700)]">
                    {client.phone}
                  </a>
                ) : (
                  "—"
                ),
              },
              {
                label: "Email",
                value: client.email ? (
                  <a href={`mailto:${client.email}`} className="hover:text-[var(--color-primary-700)]">
                    {client.email}
                  </a>
                ) : (
                  "—"
                ),
              },
              {
                label: "Сайт",
                value: client.website ? (
                  <a
                    href={client.website}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-[var(--color-primary-700)]"
                  >
                    {client.website}
                  </a>
                ) : (
                  "—"
                ),
              },
              { label: "Реквізити", value: client.legalDetails || "—", multiline: true },
              { label: "Примітка", value: client.note || "—", multiline: true },
            ]}
          />
          <div className="mt-4 border-t border-[var(--color-divider)] pt-3">
            <PartyPeopleEditor
              kind="client"
              partyId={client.id}
              canEdit={canEdit}
              people={client.contacts.map((person) => ({
                id: person.id,
                nameUk: person.nameUk,
                roleUk: person.roleUk,
                phone: person.phone,
                email: person.email,
                isPrimary: person.isPrimary,
              }))}
            />
          </div>
        </HeaderBlock>

        <HeaderBlock title="Співпраця">
          <div className="grid grid-cols-2 gap-4">
            <Stat label="Усього замовлень" value={client.orders.length} />
            <Stat label="В роботі" value={activeOrders} tone={activeOrders > 0 ? "accent" : "neutral"} />
            <Stat
              label="Сума замовлень"
              value={totalValue > 0 ? formatMoneyShort(totalValue) : "—"}
              hint="за версіями"
            />
            <Stat
              label="Найближчий дедлайн"
              value={nextDeadline ? formatDateUk(nextDeadline) : "—"}
              tone={deadlineOverdue ? "danger" : "neutral"}
              hint={deadlineOverdue ? "прострочено" : undefined}
            />
          </div>
          {lastOrder ? (
            <p className="type-caption mt-3 border-t border-[var(--color-divider)] pt-2">
              Останнє замовлення{" "}
              <Link
                href={`/orders/${lastOrder.id}`}
                className="tabular font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary-700)] hover:underline"
              >
                {lastOrder.number}
              </Link>{" "}
              від {formatDateUk(lastOrder.createdAt)}
            </p>
          ) : null}
        </HeaderBlock>
      </div>

      <TableCard>
        <TableToolbar
          left={<span className="type-subsection">Замовлення клієнта</span>}
          right={<span className="type-caption tabular">{client.orders.length}</span>}
        />
        <Table>
          <THead>
            <TH width="140px">Номер</TH>
            <TH>Виріб</TH>
            <TH>Контакт</TH>
            <TH>Статус</TH>
            <TH align="right">К-сть</TH>
            <TH
              align="right"
              title="Ціна для клієнта вже з урахуванням маржі — це не собівартість"
            >
              Сума продажу
            </TH>
            <TH align="right">Дедлайн</TH>
          </THead>
          <TBody>
            {client.orders.length === 0 ? (
              <TableEmpty
                colSpan={7}
                title="Замовлень ще немає"
                description="Створіть перше замовлення для цього клієнта."
              />
            ) : (
              client.orders.map((order) => (
                <TR key={order.id}>
                  <TD nowrap>
                    <Link
                      href={`/orders/${order.id}`}
                      className="tabular font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary-700)] hover:underline"
                    >
                      {order.number}
                    </Link>
                  </TD>
                  <TD title={order.items[0]?.nameUk ?? undefined}>
                    <div className="max-w-[240px] truncate text-[var(--color-text-secondary)]">
                      {order.items[0]?.nameUk || order.title || "—"}
                    </div>
                  </TD>
                  <TD>
                    {order.clientContact?.nameUk ? (
                      <div className="min-w-0">
                        <p className="truncate text-[13px] text-[var(--color-text-secondary)]">
                          {order.clientContact.nameUk}
                        </p>
                        {order.clientContact.roleUk?.trim() ? (
                          <p className="type-caption mt-0.5 truncate text-[var(--color-text-quiet)]">
                            {order.clientContact.roleUk.trim()}
                          </p>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-[var(--color-text-tertiary)]">—</span>
                    )}
                  </TD>
                  <TD nowrap>
                    <OrderStatusBadge status={order.status} dot />
                  </TD>
                  <TD numeric>{order.items[0]?.totalQuantity ?? "—"}</TD>
                  <TD numeric>
                    {orderValue(order) > 0 ? (
                      formatMoneyShort(orderValue(order))
                    ) : (
                      <span className="text-[var(--color-text-tertiary)]">—</span>
                    )}
                  </TD>
                  <TD numeric className="text-[var(--color-text-secondary)]">
                    {formatDateUk(order.deadline)}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableCard>
    </div>
  );
}
