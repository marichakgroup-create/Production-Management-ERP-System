import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getSupplier } from "@/server/domains/catalog/suppliers";
import { Breadcrumbs, HeaderBlock } from "@/components/ui/ObjectHeader";
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
import { PartyPersonCards } from "@/components/contacts/PartyPersonCards";
import { SupplierCompanyForm } from "@/components/contacts/SupplierCompanyForm";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";

export default async function SupplierDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const { id } = await params;
  const supplier = await getSupplier(id);
  if (!supplier || supplier.status !== "ACTIVE") notFound();

  const canEdit = accessHas(access, "manageCatalogs");
  const primary =
    supplier.contacts.find((person) => person.isPrimary) ?? supplier.contacts[0] ?? null;

  const subtitleBits = [
    primary?.nameUk || supplier.contactPerson || null,
    supplier.phone || primary?.phone || null,
    supplier.email || primary?.email || null,
  ].filter(Boolean);

  return (
    <div className="space-y-4">
      <Breadcrumbs
        items={[
          { label: "Контакти", href: "/clients?tab=suppliers" },
          { label: supplier.nameUk },
        ]}
      />

      <div className="min-w-0">
        <h1 className="type-page-title">{supplier.nameUk}</h1>
        <p className="type-body-secondary mt-1">
          {subtitleBits.length > 0 ? subtitleBits.join(" · ") : "Контакти не заповнені"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1.55fr)_minmax(260px,0.85fr)] lg:items-start">
        <div className="min-w-0">
          <HeaderBlock title="Компанія">
            <p className="type-caption mb-3 -mt-1 text-[var(--color-text-quiet)]">
              Базові дані постачальника
            </p>
            <SupplierCompanyForm
              canEdit={canEdit}
              initial={{
                id: supplier.id,
                nameUk: supplier.nameUk,
                phone: supplier.phone,
                email: supplier.email,
                website: supplier.website,
                note: supplier.note,
                contactPerson: supplier.contactPerson,
              }}
            />
          </HeaderBlock>
        </div>

        <aside className="min-w-0">
          <PartyPersonCards
            kind="supplier"
            partyId={supplier.id}
            canEdit={canEdit}
            people={supplier.contacts.map((person) => ({
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
              <span className="type-subsection">Матеріали постачальника</span>
              <p className="type-caption mt-0.5 text-[var(--color-text-quiet)]">
                {supplier._count.materialOffers} мат. · {supplier.contacts.length} осіб
              </p>
            </div>
          }
          right={
            <span className="type-caption tabular">{supplier._count.materialOffers}</span>
          }
        />
        <Table>
          <THead>
            <TH>Матеріал</TH>
            <TH>Статус</TH>
          </THead>
          <TBody>
            {supplier.materialOffers.length === 0 ? (
              <TableEmpty
                colSpan={2}
                title="Матеріалів ще немає"
                description="Постачальник зʼявиться в картці матеріалу після додавання оферу."
              />
            ) : (
              supplier.materialOffers.map((offer) => (
                <TR key={offer.id}>
                  <TD>
                    <Link
                      href={`/settings/resources?q=${encodeURIComponent(offer.material.nameUk)}`}
                      className="font-medium text-[var(--color-text-primary)] hover:text-[var(--color-primary-700)] hover:underline"
                    >
                      {offer.material.nameUk}
                    </Link>
                  </TD>
                  <TD className="text-[var(--color-text-secondary)]">
                    {offer.material.status === "ACTIVE" ? "Активний" : "Архів"}
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
