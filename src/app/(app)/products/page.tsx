import { redirect } from "next/navigation";
import { auth } from "@/server/auth";
import {
  listProductsByIds,
  listProductsSummary,
  listSizes,
  listSizeChartVariantsForProduct,
} from "@/server/domains/products/service";
import { listMaterials, listUnits } from "@/server/domains/catalog/materials";
import { listDecorations, listOperations } from "@/server/domains/catalog/operations";
import { buildCalcFromProduct, getPricingDefaults } from "@/server/domains/calculation/from-entities";
import { cardCommercialPriceTiersFromProduct, resolveCommercialPricePerUnit } from "@/lib/commercial-price";
import { getCatalogHealth, tipsForPage } from "@/server/domains/catalog/health";
import { PageHeader } from "@/components/ui/Page";
import { Banner } from "@/components/ui/Banner";
import { TableCard, TableToolbar } from "@/components/ui/Table";
import { SearchField, FilterChips, ResetFilters } from "@/components/ui/Filters";
import { ProductCreatePanel } from "@/components/products/ProductCreatePanel";
import { ProductsTable, type ProductsTableRow } from "@/components/products/ProductsTable";
import { ProductsCards } from "@/components/products/ProductsCards";
import {
  ProductsViewToggle,
  type ProductsViewMode,
} from "@/components/products/ProductsViewToggle";
import { CatalogHealthBanner } from "@/components/catalog/CatalogHealthBanner";
import { accessHas, getCurrentUserAccess } from "@/server/auth/access";

const PRICE_TIERS = [50, 100, 500];

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; state?: string; view?: string }>;
}) {
  const access = await getCurrentUserAccess();
  if (!access) redirect("/login");

  const { q, state, view: viewParam } = await searchParams;
  const view: ProductsViewMode = viewParam === "cards" ? "cards" : "table";
  const canDelete = accessHas(access, "archiveRecords");
  const canCreate = accessHas(access, "createInlineCatalog");
  const showPrices = accessHas(access, "viewProductCosts");

  let summaries: Awaited<ReturnType<typeof listProductsSummary>> = [];
  let healthTips: Awaited<ReturnType<typeof getCatalogHealth>>["tips"] = [];
  let dbError = false;
  let loadError: string | null = null;

  const [pricing, sizes, sizeVariants, materials, operations, decorations, units, health] =
    await Promise.all([
    getPricingDefaults().catch(() => ({
      pricingMethod: "MARKUP" as const,
      targetRatePercent: 0,
      minimumMarginPercent: 15,
      roundingDecimals: 1,
      sizeRules: [],
    })),
    listSizes().catch(() => []),
    listSizeChartVariantsForProduct().catch(() => []),
    listMaterials().catch(() => []),
    listOperations().catch(() => []),
    listDecorations().catch(() => []),
    listUnits().catch(() => []),
    getCatalogHealth().catch(() => null),
  ]);

  if (health) {
    healthTips = tipsForPage(health.tips, "products");
  }

  const detailById = new Map<
    string,
    Awaited<ReturnType<typeof listProductsByIds>>[number]
  >();

  try {
    summaries = await listProductsSummary();
    const readyIds = summaries
      .filter((row) => row._count.materials > 0 && row._count.operations > 0)
      .map((row) => row.id);
    const details = await listProductsByIds(readyIds);
    for (const product of details) detailById.set(product.id, product);
  } catch (error) {
    dbError = true;
    loadError = error instanceof Error ? error.message : "Невідома помилка завантаження";
    console.error("[products] list failed:", error);
  }

  const isReady = (row: (typeof summaries)[number]) =>
    row._count.materials > 0 && row._count.operations > 0;

  const term = q?.toLowerCase().trim();
  const filtered = summaries.filter((product) => {
    const matchesTerm = term
      ? [product.nameUk, product.internalCode].filter(Boolean).some((value) =>
          String(value).toLowerCase().includes(term),
        )
      : true;
    const matchesState =
      state === "ready" ? isReady(product) : state === "draft" ? !isReady(product) : true;
    return matchesTerm && matchesState;
  });

  const readyCount = summaries.filter(isReady).length;
  const sizeOptions = sizes.map((size) => ({
    id: size.id,
    label: size.nameUk,
    code: size.code,
    variantId: size.variantId,
  }));
  const sizeVariantOptions = sizeVariants.map((row) => ({
    id: row.id,
    nameUk: row.nameUk,
  }));
  const unitOptions = units.map((unit) => ({
    id: unit.id,
    label: unit.nameUk,
    code: unit.code,
  }));
  const materialCatalog = materials.map((material) => ({
    id: material.id,
    label: `${material.nameUk} (${material.unitOfMeasure.code})`,
    unit: material.unitOfMeasure.code,
    price: Number(material.purchasePrice),
    defaultWaste: Number(material.defaultWastePercent),
    name: material.nameUk,
    materialType: material.type,
    composition: material.composition?.trim() || null,
    densityGsm: material.densityGsm?.trim() || null,
    availableColors: material.availableColors ?? [],
    supplierOffers: material.supplierOffers.map((offer) => ({
      supplierId: offer.supplierId,
      supplierName: offer.supplier.nameUk,
      isPrimary: offer.isPrimary,
      availableColors: offer.availableColors ?? [],
    })),
  }));
  const operationCatalog = operations.map((operation) => ({
    id: operation.id,
    label: operation.nameUk,
    method: operation.calculationMethod,
    unitRate: operation.baseRate != null ? Number(operation.baseRate) : null,
    shiftCost: operation.shiftCost != null ? Number(operation.shiftCost) : null,
    standardOutput:
      operation.standardOutputPerShift != null
        ? Number(operation.standardOutputPerShift)
        : null,
    rateTiers: (operation.rateTiers ?? []).map((tier) => ({
      minQuantity: tier.minQuantity,
      ratePerUnit: Number(tier.ratePerUnit),
    })),
  }));
  const decorationCatalog = decorations.map((decoration) => ({
    id: decoration.id,
    label: decoration.nameUk,
    setupCost: Number(decoration.setupCost),
    unitRate: Number(decoration.unitRate),
  }));

  const rows: ProductsTableRow[] = filtered.map((product) => {
    const ready = isReady(product);
    const detail = detailById.get(product.id);
    const commercialTiers =
      showPrices && detail ? cardCommercialPriceTiersFromProduct(detail) : [];
    const tierQtys =
      commercialTiers.length > 0 ? commercialTiers.map((tier) => tier.minQuantity) : PRICE_TIERS;

    const compositionSummary =
      [...new Set(
        product.materials
          .map((row) => row.material.nameUk.trim())
          .filter(Boolean),
      )]
        .slice(0, 4)
        .join(" · ") ||
      product.category?.nameUk?.trim() ||
      product.description?.trim() ||
      null;

    return {
      id: product.id,
      nameUk: product.nameUk,
      internalCode: product.internalCode,
      imageUrl: product.imageUrl,
      isBaseModel: product.isBaseModel,
      compositionSummary,
      materialsCount: product._count.materials,
      operationsCount: product._count.operations,
      decorationsCount: product._count.decorations,
      ready,
      updatedAt: product.updatedAt.toISOString(),
      priceTiers: tierQtys,
      prices: showPrices
        ? tierQtys.map((qty) => {
            if (!ready || !detail) return null;
            if (commercialTiers.length > 0) {
              return resolveCommercialPricePerUnit({ quantity: qty, tiers: commercialTiers });
            }
            return Number(
              buildCalcFromProduct(detail, qty, {
                ...pricing,
                quantityAwareMaterialPrices: true,
                sizeMode: "standard",
              }).sellingPricePerUnit,
            );
          })
        : [],
    };
  });

  const createPanel = canCreate ? (
    <ProductCreatePanel
      sizes={sizeOptions}
      sizeVariants={sizeVariantOptions}
      materialCatalog={materialCatalog}
      operationCatalog={operationCatalog}
      decorationCatalog={decorationCatalog}
      unitOptions={unitOptions}
      variant="primary"
      size="sm"
      triggerLabel="Новий виріб"
    />
  ) : undefined;

  const emptyState = {
    title: dbError
      ? "Дані недоступні"
      : term || state
        ? "Нічого не знайдено"
        : "Виробів ще немає",
    description: dbError
      ? undefined
      : term || state
        ? "Змініть запит або скиньте фільтри."
        : canCreate
          ? "Створіть виріб з фото, розмірами та комплектацією — він стане еталоном для замовлень."
          : "Каталог виробів для підбору в замовлення. Ціни та калькуляція доступні адміністратору.",
    action: !dbError ? createPanel : undefined,
  };

  return (
    <div>
      <PageHeader
        title="Вироби"
        description={
          showPrices
            ? "Комерційний прайс — фіксовані ціни за тиражем для базових моделей. Без прайсу — розрахунковий орієнтир з собівартості."
            : "Каталог виробів для комплектації замовлення. Ціни та калькуляція приховані."
        }
        actions={
          canCreate ? (
            <ProductCreatePanel
              sizes={sizeOptions}
              sizeVariants={sizeVariantOptions}
              materialCatalog={materialCatalog}
              operationCatalog={operationCatalog}
              decorationCatalog={decorationCatalog}
              unitOptions={unitOptions}
              variant="primary"
              size="md"
              triggerLabel="Новий виріб"
            />
          ) : undefined
        }
      />

      {dbError ? (
        <Banner tone="danger" title="Не вдалося завантажити вироби" className="mb-4">
          База може бути доступна, але запит списку впав. Перезапустіть{" "}
          <code>next dev</code> після міграцій Prisma.{" "}
          {loadError ? (
            <span className="mt-1 block text-[12.5px] opacity-80">{loadError}</span>
          ) : null}
        </Banner>
      ) : showPrices ? (
        <CatalogHealthBanner tips={healthTips} className="mb-4" />
      ) : null}

      <TableCard>
        <TableToolbar
          left={
            <div className="flex flex-wrap items-center gap-3">
              <ProductsViewToggle value={view} />
              <span className="type-caption tabular text-[var(--color-text-quiet)]">
                {filtered.length} з {summaries.length}
              </span>
            </div>
          }
          filters={
            <>
              <SearchField placeholder="Пошук за назвою або кодом" className="w-64" />
              <FilterChips
                paramKey="state"
                options={[
                  { value: "ready", label: "Готові до замовлення", count: readyCount },
                  {
                    value: "draft",
                    label: "Потребують комплектації",
                    count: summaries.length - readyCount,
                  },
                ]}
              />
              <ResetFilters keys={["q", "state"]} />
            </>
          }
        />

        {view === "cards" ? (
          <ProductsCards
            rows={rows}
            canDelete={canDelete}
            showPrices={showPrices}
            empty={emptyState}
          />
        ) : (
          <ProductsTable
            rows={rows}
            canDelete={canDelete}
            showPrices={showPrices}
            empty={emptyState}
          />
        )}
      </TableCard>
    </div>
  );
}
