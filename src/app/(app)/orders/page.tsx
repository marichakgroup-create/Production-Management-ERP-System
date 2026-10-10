import Link from "next/link";
import { redirect } from "next/navigation";
import { listOrders } from "@/server/domains/orders/service";
import { PageHeader } from "@/components/ui/Page";
import { Banner } from "@/components/ui/Banner";
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
  const canManage = accessHas(access, "manageOrders");
  const showAmounts = canViewOrderCosts(access);
  const archiveView = status === "archive" || status === "CANCELLED";

  let orders: Awaited<ReturnType<typeof listOrders>> = [];
  let dbError = false;
  try {
    orders = await listOrders();
  } catch (error) {
    dbError = true;
    console.error("[orders] listOrders failed:", error);
    orders = [];
  }

  const liveOrders = orders.filter((order) => order.status !== "CANCELLED");
  const archivedOrders = orders.filter((order) => order.status === "CANCELLED");
  const scopeOrders = archiveView ? archivedOrders : liveOrders;

  const term = q?.toLowerCase().trim();
  const filtered = scopeOrders.filter((order) => {
    const itemNames = order.items.map((item) => item.nameUk);
    const matchesTerm = term
      ? [order.number, order.title, order.client.companyName, ...itemNames]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(term))
      : true;
    const matchesStatus = archiveView
      ? true
      : status === "active"
        ? activeStatuses.includes(order.status)
        : status
          ? order.status === status
          : true;
    const matchesClient = client ? order.clientId === client : true;
    return matchesTerm && matchesStatus && matchesClient;
  });

  const countByStatus = (value: string) =>
    liveOrders.filter((order) => order.status === value).length;

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

      {dbError ? (
        <Banner tone="danger" title="Не вдалося завантажити замовлення" className="mb-4">
          Перевірте зʼєднання з БД і перезапустіть <code>next dev</code> після{" "}
          <code>prisma generate</code>. У базі замовлення можуть бути — це помилка читання, не
          порожній каталог.
        </Banner>
      ) : null}

      <TableCard>
        <TableToolbar
          left={
            <span className="type-caption tabular">
              {filtered.length} з {scopeOrders.length}
              {archiveView ? " · архів" : ""}
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
                    count: liveOrders.filter((order) => activeStatuses.includes(order.status))
                      .length,
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
                  {
                    value: "archive",
                    label: "Архів",
                    count: archivedOrders.length > 0 ? archivedOrders.length : undefined,
                  },
                ]}
              />
              <ResetFilters keys={["q", "status", "client"]} />
            </>
          }
        />

        <OrdersTable
          orders={rows}
          canManage={canManage}
          showAmounts={showAmounts}
          archiveView={archiveView}
          empty={{
            title: dbError
              ? "Дані недоступні"
              : archiveView
                ? term
                  ? "В архіві нічого не знайдено"
                  : "Архів порожній"
                : term || status
                  ? "Замовлень не знайдено"
                  : "Замовлень ще немає",
            description: dbError
              ? "Перезапустіть сервер розробки й оновіть сторінку."
              : archiveView
                ? term
                  ? "Змініть запит або скиньте фільтри."
                  : "Видалені замовлення зʼявляться тут."
                : term || status
                  ? "Змініть запит або скиньте фільтри."
                  : "Створіть перше замовлення — клієнта й виріб можна додати прямо у формі.",
            action:
              archiveView || dbError ? undefined : (
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
