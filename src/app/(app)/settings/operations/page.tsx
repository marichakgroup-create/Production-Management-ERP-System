import { redirect } from "next/navigation";
import { listOperations } from "@/server/domains/catalog/operations";
import { getCatalogHealth, tipsForPage } from "@/server/domains/catalog/health";
import { PageHeader } from "@/components/ui/Page";
import { Banner } from "@/components/ui/Banner";
import { TableCard, TableToolbar } from "@/components/ui/Table";
import { SearchField, FilterChips, ResetFilters } from "@/components/ui/Filters";
import { ViewTabs } from "@/components/ui/Tabs";
import { formatMoneyUah } from "@/lib/utils";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";
import { OperationCreatePanel } from "./OperationCreateForm";
import { OperationsTable, type OperationsTableRow } from "@/components/catalog/OperationsTable";
import { CatalogHealthBanner } from "@/components/catalog/CatalogHealthBanner";
import { OPERATION_METHOD_LABELS } from "@/lib/operation-labels";
import { getDecorationFormatsCatalog } from "@/server/domains/decoration-formats/service";
import { DecorationFormatsAdminPanel } from "@/components/settings/DecorationFormatsAdminPanel";

export default async function OperationsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; method?: string; tab?: string }>;
}) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");
  if (!accessHas(access, "manageCatalogs")) redirect("/overview");

  const { q, method, tab: tabRaw } = await searchParams;
  const tab = tabRaw === "decorations" ? "decorations" : "operations";

  let operations: Awaited<ReturnType<typeof listOperations>> = [];
  let healthTips: Awaited<ReturnType<typeof getCatalogHealth>>["tips"] = [];
  let decorationFormats: Awaited<ReturnType<typeof getDecorationFormatsCatalog>> = [];
  let dbError = false;

  try {
    const [ops, health, formats] = await Promise.all([
      listOperations(),
      getCatalogHealth().catch(() => null),
      getDecorationFormatsCatalog({ includeArchived: true }),
    ]);
    operations = ops;
    decorationFormats = formats;
    if (health) healthTips = tipsForPage(health.tips, "operations");
  } catch {
    dbError = true;
  }

  const filtered = operations.filter((row) => {
    const matchesQuery = q ? row.nameUk.toLowerCase().includes(q.toLowerCase()) : true;
    const matchesMethod = method ? row.calculationMethod === method : true;
    return matchesQuery && matchesMethod;
  });

  const canCreate =
    accessHas(access, "createInlineCatalog") ||
    accessHas(access, "manageCatalogs");
  const canDelete = accessHas(access, "archiveRecords");

  const rows: OperationsTableRow[] = filtered.map((row) => {
    let unitCostValue: number | null = null;
    let unitCostLabel = "—";
    if (row.calculationMethod === "SHIFT_OUTPUT") {
      if (row.shiftCost != null && row.standardOutputPerShift != null) {
        unitCostValue = Number(row.shiftCost) / Number(row.standardOutputPerShift);
        unitCostLabel = formatMoneyUah(unitCostValue);
      }
    } else if (row.calculationMethod === "QUANTITY_TIER") {
      const tiers = row.rateTiers ?? [];
      if (tiers.length > 0) {
        unitCostValue = Number(tiers[0]!.ratePerUnit);
        unitCostLabel = `від ${formatMoneyUah(unitCostValue)}`;
      } else if (row.baseRate != null) {
        unitCostValue = Number(row.baseRate);
        unitCostLabel = formatMoneyUah(unitCostValue);
      }
    } else if (row.baseRate != null) {
      unitCostValue = Number(row.baseRate);
      unitCostLabel = formatMoneyUah(unitCostValue);
    }

    return {
      id: row.id,
      nameUk: row.nameUk,
      method: row.calculationMethod,
      baseRate: row.baseRate != null ? Number(row.baseRate) : null,
      shiftCost: row.shiftCost != null ? Number(row.shiftCost) : null,
      standardOutput:
        row.standardOutputPerShift != null ? Number(row.standardOutputPerShift) : null,
      note: row.note ?? "",
      unitCostLabel,
      unitCostValue,
      rateTiers: (row.rateTiers ?? []).map((tier) => ({
        minQuantity: tier.minQuantity,
        ratePerUnit: Number(tier.ratePerUnit),
      })),
    };
  });

  return (
    <div>
      <PageHeader
        title="Операції"
        description={
          tab === "decorations"
            ? "Розцінки нанесення за форматом і тиражем. У замовленні ставка підставляється автоматично."
            : "Спосіб розрахунку визначає, як вартість операції потрапляє в собівартість одиниці."
        }
        actions={
          tab === "operations" && canCreate && !dbError ? <OperationCreatePanel /> : null
        }
      />

      <ViewTabs
        className="mb-4"
        active={tab}
        items={[
          {
            key: "operations",
            label: "Операції",
            href: "/settings/operations",
            count: operations.length || undefined,
          },
          {
            key: "decorations",
            label: "Операції нанесення",
            href: "/settings/operations?tab=decorations",
            count: decorationFormats.filter((row) => row.status === "ACTIVE").length || undefined,
          },
        ]}
      />

      {tab === "decorations" ? (
        dbError ? (
          <Banner tone="danger" title="Не вдалося завантажити формати нанесення" className="mb-4">
            Перевірте <code>DATABASE_URL</code> і перезапустіть <code>next dev</code> після{" "}
            <code>prisma migrate</code> / <code>prisma generate</code>.
          </Banner>
        ) : (
          <DecorationFormatsAdminPanel formats={decorationFormats} />
        )
      ) : (
        <>
          {dbError ? (
            <Banner tone="danger" title="Не вдалося завантажити операції" className="mb-4">
              Перевірте <code>DATABASE_URL</code> і перезапустіть <code>next dev</code> після{" "}
              <code>prisma generate</code>.
            </Banner>
          ) : (
            <CatalogHealthBanner tips={healthTips} className="mb-4" />
          )}

          <TableCard>
            <TableToolbar
              left={
                <span className="type-caption tabular">
                  {filtered.length} з {operations.length}
                </span>
              }
              filters={
                <>
                  <SearchField placeholder="Пошук операції" className="w-56" />
                  <FilterChips
                    paramKey="method"
                    options={Object.entries(OPERATION_METHOD_LABELS).map(([value, label]) => ({
                      value,
                      label,
                      count: operations.filter((o) => o.calculationMethod === value).length,
                    }))}
                  />
                  <ResetFilters keys={["q", "method"]} />
                </>
              }
            />

            <OperationsTable
              rows={rows}
              canDelete={canDelete}
              canEdit={canCreate}
              empty={{
                title: dbError ? "Дані недоступні" : "Операцій не знайдено",
                description: dbError
                  ? undefined
                  : "Додайте операції, щоб вони брали участь у розрахунку собівартості.",
              }}
            />
          </TableCard>
        </>
      )}
    </div>
  );
}
