import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import { listOrders } from "@/server/domains/orders/service";
import { PageHeader } from "@/components/ui/Page";
import { TableCard, TableToolbar } from "@/components/ui/Table";
import { SearchField, FilterChips, ResetFilters } from "@/components/ui/Filters";
import { IconPlus } from "@/components/ui/Icons";
import { OrdersTable, type OrdersTableRow } from "@/components/orders/OrdersTable";
import { accessHas, canViewOrderCosts, getCurrentUserAccess } from "@/server/auth/access";

const activeStatuses = ["DRAFT", "CALCULATION", "PENDING_APPROVAL", "APPROVED"];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; client?: string }>;
}) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const { q, status, client } = await searchParams;
  const canDelete = accessHas(access, "manageOrders");
  const showAmounts = canViewOrderCosts(access);

  let orders: Awaited<ReturnType<typeof listOrders>> = [];
  try {
    orders = await listOrders();
  } catch {
    orders = [];
  }

  const term = q?.toLowerCase().trim();
  const filtered = orders.filter((order) => {
    const itemNames = order.items.map((item) => item.nameUk);
    const matchesTerm = term
      ? [order.number, order.title, order.client.companyName, ...itemNames]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      : true;
    const matchesStatus =
      status === "active"
        ? activeStatuses.includes(order.status)
        : status
          ? order.status === status
          : true;
    const matchesClient = client ? order.clientId === client : true;
    return matchesTerm && matchesStatus && matchesClient;
  });

  const countByStatus = (value: string) => orders.filter((order) => order.status === value).length;

  const rows: OrdersTableRow[] = filtered.map((order) => ({
    id: order.id,
    number: order.number,
    title: order.title,
    status: order.status,
    deadline: order.deadline ? order.deadline.toISOString() : null,
    createdAt: order.createdAt.toISOString(),
    updatedAt: order.updatedAt.toISOString(),
    clientName: order.client.companyName,
    items: order.items.map((item) => {
      const version = item.versions[0];
      return {
        id: item.id,
        nameUk: item.nameUk,
        totalQuantity: item.totalQuantity,
        amount: version ? Number(version.totalSellingValue) : null,
      };
    }),
  }));

  return (
    <div>
      <PageHeader
        title="Замовлення"
        description="Кожне замовлення проходить шлях: комплектація → калькуляція → погоджена версія → передача у виробництво."
        actions={
          <Link href="/orders/new" className="btn-primary">
            <IconPlus size={16} />
            Нове замовлення
          </Link>
        }
      />

      <TableCard>
        <TableToolbar
          left={
            <span className="type-caption tabular">
              {filtered.length} з {orders.length}
            </span>
          }
          filters={
            <>
              <SearchField placeholder="Номер, клієнт або виріб" className="w-64" />
              <FilterChips
                paramKey="status"
                options={[
                  {
                    value: "active",
                    label: "В роботі",
                    count: orders.filter((order) => activeStatuses.includes(order.status)).length,
                  },
                  {
                    value: "PENDING_APPROVAL",
                    label: "На погодженні",
                    count: countByStatus("PENDING_APPROVAL"),
                  },
                  { value: "APPROVED", label: "Погоджено", count: countByStatus("APPROVED") },
                  {
                    value: "HANDED_TO_PRODUCTION",
                    label: "У виробництві",
                    count: countByStatus("HANDED_TO_PRODUCTION"),
                  },
                  { value: "CLOSED", label: "Закриті", count: countByStatus("CLOSED") },
                ]}
              />
              <ResetFilters keys={["q", "status", "client"]} />
            </>
          }
        />

        <OrdersTable
          orders={rows}
          canDelete={canDelete}
          showAmounts={showAmounts}
          empty={{
            title: term || status ? "Замовлень не знайдено" : "Замовлень ще немає",
            description: term || status
              ? "Змініть запит або скиньте фільтри."
              : "Створіть перше замовлення — клієнта й виріб можна додати прямо у формі.",
            action: (
              <Link href="/orders/new" className="btn-primary btn-primary-sm">
                <IconPlus size={15} />
                Нове замовлення
              </Link>
            ),
          }}
        />
      </TableCard>
    </div>
  );
}
