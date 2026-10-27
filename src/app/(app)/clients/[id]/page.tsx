import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getClient } from "@/server/domains/clients/service";
import { Breadcrumbs, HeaderBlock, QuickAction, QuickActions } from "@/components/ui/ObjectHeader";
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
import { cn, formatDateUk, formatMoneyShort } from "@/lib/utils";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PartyPersonCards } from "@/components/contacts/PartyPersonCards";
import { ClientLegalDetailsEditor } from "@/components/clients/ClientLegalDetailsEditor";
import { ClientCompanyForm } from "@/components/clients/ClientCompanyForm";
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

  const coopBits = [
    `${client.orders.length} зам.`,
    activeOrders > 0 ? `${activeOrders} в роботі` : null,
    nextDeadline
      ? `дедлайн ${formatDateUk(nextDeadline)}${deadlineOverdue ? " · прострочено" : ""}`
      : null,
    lastOrder ? `останнє ${lastOrder.number}` : null,
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
        {client.email || primary?.email ? (
          <QuickAction
            icon={<IconClients size={15} />}
            href={`mailto:${client.email || primary?.email}`}
            hint="clientEmail"
          >
            Написати
          </QuickAction>
        ) : null}
      </QuickActions>

      {/* Company = primary object; people = secondary units on the right. */}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.85fr)] lg:items-start">
        <div className="min-w-0 space-y-4">
          <HeaderBlock title="Компанія">
            <p className="type-caption mb-3 -mt-1 text-[var(--color-text-quiet)]">
              Базові дані компанії
            </p>
            <ClientCompanyForm
              canEdit={canEdit}
              initial={{
                id: client.id,
                companyName: client.companyName,
                phone: client.phone,
                email: client.email,
                website: client.website,
                note: client.note,
                contactPerson: client.contactPerson,
                legalDetails: client.legalDetails,
              }}
            />
          </HeaderBlock>

          <HeaderBlock title="Реквізити">
            <ClientLegalDetailsEditor
              clientId={client.id}
              canEdit={canEdit}
              rows={client.legalEntities.map((entity) => ({
                id: entity.id,
                nameUk: entity.nameUk,
                details: entity.details,
                isPrimary: entity.isPrimary,
              }))}
            />
          </HeaderBlock>
        </div>

        <aside className="min-w-0">
          <PartyPersonCards
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
        </aside>
      </div>

      <TableCard>
        <TableToolbar
          left={
            <div className="min-w-0">
              <span className="type-subsection">Замовлення клієнта</span>
              {coopBits.length > 0 ? (
                <p
                  className={cn(
                    "type-caption mt-0.5 truncate",
                    deadlineOverdue
                      ? "text-[var(--color-danger-text)]"
                      : "text-[var(--color-text-quiet)]",
                  )}
                >
                  {coopBits.join(" · ")}
                </p>
              ) : null}
            </div>
          }
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
