import { redirect } from "next/navigation";
import { listClients } from "@/server/domains/clients/service";
import { listSuppliers } from "@/server/domains/catalog/suppliers";
import { EmptyState, PageHeader } from "@/components/ui/Page";
import { ViewTabs } from "@/components/ui/Tabs";
import { SearchField, ResetFilters } from "@/components/ui/Filters";
import { ClientCreatePanel } from "@/components/clients/ClientCreateForm";
import { ClientContactCards } from "@/components/contacts/ClientContactCards";
import { SupplierContactCards } from "@/components/contacts/SupplierContactCards";
import { SupplierCreatePanel } from "@/components/contacts/SupplierCreatePanel";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";

export default async function ContactsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tab?: string }>;
}) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const { q, tab: tabRaw } = await searchParams;
  const tab = tabRaw === "suppliers" ? "suppliers" : "clients";
  const canEditClients = accessHas(access, "manageClients");
  const canEditSuppliers = accessHas(access, "manageCatalogs");

  const term = q?.toLowerCase().trim();

  const [clients, suppliers] = await Promise.all([
    listClients().catch(() => []),
    listSuppliers().catch(() => []),
  ]);

  const filteredClients = clients.filter((client) => {
    if (!term) return true;
    const personHits = client.contacts.flatMap((person) => [
      person.nameUk,
      person.roleUk,
      person.phone,
      person.email,
    ]);
    return [client.companyName, client.contactPerson, client.phone, client.email, ...personHits]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const filteredSuppliers = suppliers.filter((supplier) => {
    if (!term) return true;
    const personHits = supplier.contacts.flatMap((person) => [
      person.nameUk,
      person.roleUk,
      person.phone,
      person.email,
    ]);
    return [
      supplier.nameUk,
      supplier.contactPerson,
      supplier.phone,
      supplier.email,
      supplier.note,
      ...personHits,
    ]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const tabQuery = (key: "clients" | "suppliers") => {
    const params = new URLSearchParams();
    if (key === "suppliers") params.set("tab", "suppliers");
    if (q?.trim()) params.set("q", q.trim());
    const qs = params.toString();
    return qs ? `/clients?${qs}` : "/clients";
  };

  return (
    <div className="space-y-4">
      <PageHeader
        title="Контакти"
        description="Клієнти та постачальники."
        actions={
          tab === "suppliers" ? (
            canEditSuppliers ? <SupplierCreatePanel /> : null
          ) : canEditClients ? (
            <ClientCreatePanel />
          ) : null
        }
      />

      <ViewTabs
        active={tab}
        items={[
          { key: "clients", label: "Клієнти", href: tabQuery("clients"), count: clients.length },
          {
            key: "suppliers",
            label: "Постачальники",
            href: tabQuery("suppliers"),
            count: suppliers.length,
          },
        ]}
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchField
          placeholder={tab === "suppliers" ? "Пошук постачальника" : "Пошук клієнта"}
          className="w-64"
        />
        <ResetFilters keys={["q"]} />
        <span className="type-caption tabular text-[var(--color-text-quiet)]">
          {tab === "suppliers"
            ? `${filteredSuppliers.length} з ${suppliers.length}`
            : `${filteredClients.length} з ${clients.length}`}
        </span>
      </div>

      {tab === "suppliers" ? (
        filteredSuppliers.length === 0 ? (
          <EmptyState
            size="sm"
            title={term ? "Постачальників не знайдено" : "Постачальників ще немає"}
            description={
              term
                ? "Спробуйте інший запит."
                : "Додайте постачальника або створіть його в картці матеріалу."
            }
            action={!term && canEditSuppliers ? <SupplierCreatePanel /> : undefined}
          />
        ) : (
          <SupplierContactCards
            rows={filteredSuppliers.map((row) => ({
              id: row.id,
              nameUk: row.nameUk,
              contactPerson: row.contactPerson,
              phone: row.phone,
              email: row.email,
              materialsCount: row._count.materialOffers,
              contacts: row.contacts.map((person) => ({
                id: person.id,
                nameUk: person.nameUk,
                roleUk: person.roleUk,
                phone: person.phone,
                email: person.email,
                isPrimary: person.isPrimary,
              })),
            }))}
          />
        )
      ) : filteredClients.length === 0 ? (
        <EmptyState
          size="sm"
          title={term ? "Клієнтів не знайдено" : "Клієнтів ще немає"}
          description={
            term ? "Спробуйте інший запит." : "Створіть клієнта, щоб оформити замовлення."
          }
          action={!term && canEditClients ? <ClientCreatePanel /> : undefined}
        />
      ) : (
        <ClientContactCards
          rows={filteredClients.map((row) => ({
            id: row.id,
            companyName: row.companyName,
            contactPerson: row.contactPerson,
            phone: row.phone,
            email: row.email,
            ordersCount: row._count.orders,
            contacts: row.contacts.map((person) => ({
              id: person.id,
              nameUk: person.nameUk,
              roleUk: person.roleUk,
              phone: person.phone,
              email: person.email,
              isPrimary: person.isPrimary,
            })),
            legalEntitiesCount: row.legalEntities.length,
          }))}
        />
      )}
    </div>
  );
}
