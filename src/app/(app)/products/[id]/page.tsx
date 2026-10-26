import Link from "next/link";
import { notFound } from "next/navigation";
import { getProduct, listSizes, listSizeChartVariantsForProduct } from "@/server/domains/products/service";
import { listMaterials } from "@/server/domains/catalog/materials";
import { listUnits } from "@/server/domains/catalog/materials";
import { listDecorations, listOperations } from "@/server/domains/catalog/operations";
import { StatusBadge } from "@/components/ui/Page";
import { Banner } from "@/components/ui/Banner";
import { Breadcrumbs, HeaderBlock, QuickAction, QuickActions } from "@/components/ui/ObjectHeader";
import { ProductDetailPreviewShell } from "@/components/products/ProductPreviewQtyContext";
import { ProductImagePicker } from "@/components/products/ProductImagePicker";
import { ProductIdentityEditor } from "@/components/products/ProductIdentityEditor";
import { ProductSizesEditor } from "@/components/products/ProductSizesEditor";
import { DuplicateProductButton } from "@/components/products/DuplicateProductButton";
import { IconCheckCircle, IconCircle, IconOrders, IconSizes } from "@/components/ui/Icons";
import { buildCalcFromProduct, getPricingDefaults, productFabricDeliveryAmount } from "@/server/domains/calculation/from-entities";
import { resolveBomMaterialPurchasePrice } from "@/lib/order-material-terms";
import { fixedCostOptionsFromDb } from "@/server/domains/fixed-costs/service";
import {
  calcWithClientPrice,
  resolveSewingPerUnitFromOperations,
} from "@/lib/product-selling";
import { ProductDetailTabs, type ProductDetailTab } from "@/components/products/ProductDetailTabs";
import { prisma } from "@/server/db/client";
import { getCurrentUserAccess, accessHas } from "@/server/auth/access";
import {
  sizeCodesFromScopes,
  sizeConsumptionFromNorms,
  sizeWasteFromNorms,
} from "@/lib/size-bom";
import { operationMethodLabel } from "@/lib/operation-labels";
import { materialSupplierNames } from "@/lib/material-catalog-options";
import { isCutOperationName, resolveCutUnitRateForProduct, summarizeCutOperationDisplay } from "@/lib/cut-rate";
import {
  isDeliveryOperationName,
  pickOperationQuantityTiers,
  resolveQuantityTierRate,
} from "@/lib/quantity-tiers";
import {
  computeFixedCostMetrics,
  fixedCostPerUnitFromSewing,
  isFixedCostOperationName,
} from "@/lib/fixed-costs";
import { SHARED_PRODUCT_TIRAGE_QTYS, isSewOperationName } from "@/lib/sewing-markup";

/** Fixed ops use catalog preview qty; cut is shown separately from tier block. */
const TIER_PREVIEW_QTY = 100;
const CUT_PREVIEW_QTY = 100;

type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

function operationFallbackRate(row: ProductDetail["operations"][number]) {
  return row.rateOverride != null
    ? Number(row.rateOverride)
    : Number(row.operation.baseRate ?? 0);
}

function operationUnitCost(row: ProductDetail["operations"][number]) {
  if (isCutOperationName(row.operation.nameUk)) return 0;
  if (isFixedCostOperationName(row.operation.nameUk)) return 0;
  if (row.operation.calculationMethod === "SHIFT_OUTPUT") {
    const output =
      row.standardOverride != null
        ? Number(row.standardOverride)
        : Number(row.operation.standardOutputPerShift ?? 0);
    if (!output) return 0;
    return Number(row.operation.shiftCost ?? 0) / output;
  }
  const fallback = operationFallbackRate(row);
  if (row.operation.calculationMethod === "QUANTITY_TIER") {
    return resolveQuantityTierRate({
      quantity: TIER_PREVIEW_QTY,
      tiers: pickOperationQuantityTiers(row.rateTiers, row.operation.rateTiers),
      fallbackRate: fallback,
    });
  }
  return fallback;
}

function mapOperationRow(
  row: ProductDetail["operations"][number],
  product: ProductDetail,
): {
  id: string;
  name: string;
  method: string;
  methodCode: string;
  unitCost: number;
  catalogRate: number;
  rateOverride: number | null;
  sizeCodes: string[] | null;
  rateTiers: Array<{ minQuantity: number; ratePerUnit: number }>;
  isCut: boolean;
  cutDisplay: ReturnType<typeof summarizeCutOperationDisplay> | null;
  cutFallbackRate?: number;
} {
  const sizeCodes = sizeCodesFromScopes(row.sizeScopes);
  const rateTiers = pickOperationQuantityTiers(row.rateTiers, row.operation.rateTiers);
  const catalogRate = Number(row.operation.baseRate ?? 0);
  const rateOverride = row.rateOverride != null ? Number(row.rateOverride) : null;

  if (isCutOperationName(row.operation.nameUk)) {
    const fallbackRate = operationFallbackRate(row);
    const cutDisplay = summarizeCutOperationDisplay({
      optimalQty: product.optimalQty,
      tiers: (product.cutRateTiers ?? []).map((tier) => ({
        minQuantity: tier.minQuantity,
        ratePerUnit: Number(tier.ratePerUnit),
      })),
      fallbackRate,
      previewQty: CUT_PREVIEW_QTY,
    });
    return {
      id: row.id,
      name: row.operation.nameUk,
      method: cutDisplay.methodLabel,
      methodCode: row.operation.calculationMethod,
      unitCost: 0,
      catalogRate,
      rateOverride,
      sizeCodes,
      rateTiers,
      isCut: true,
      cutDisplay,
      cutFallbackRate: fallbackRate,
    };
  }

  const isDelivery = isDeliveryOperationName(row.operation.nameUk);
  const method = isDelivery
    ? "₴/од. × тираж"
    : row.operation.calculationMethod === "QUANTITY_TIER"
      ? `${operationMethodLabel(row.operation.calculationMethod)} · приклад ${TIER_PREVIEW_QTY} шт`
      : operationMethodLabel(row.operation.calculationMethod);

  return {
    id: row.id,
    name: row.operation.nameUk,
    method,
    methodCode: row.operation.calculationMethod,
    unitCost: operationUnitCost(row),
    catalogRate,
    rateOverride,
    sizeCodes,
    rateTiers,
    isCut: false,
    cutDisplay: null,
  };
}

/** Default batch size for economics preview on product card. */
const ECONOMICS_PREVIEW_QTY = 100;

export default async function ProductDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
  const activeTab: ProductDetailTab =
    tab === "cut" ? "cut" : tab === "price" || tab === "pricing" ? "price" : "composition";
  const product = await getProduct(id);
  if (!product) notFound();

  const [
    materials,
    units,
    operations,
    decorations,
    pricing,
    usedIn,
    access,
    sizeCatalog,
    sizeVariants,
    fixedCosts,
  ] = await Promise.all([
      listMaterials(),
      listUnits(),
      listOperations(),
      listDecorations(),
      getPricingDefaults(),
      prisma.orderItem.findMany({
        where: { productId: id },
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          totalQuantity: true,
          order: {
            select: {
              id: true,
              number: true,
              status: true,
              client: { select: { companyName: true } },
            },
          },
        },
      }),
      getCurrentUserAccess(),
      listSizes(),
      listSizeChartVariantsForProduct(),
      fixedCostOptionsFromDb(),
    ]);
  const pricingWithFixed = { ...pricing, fixedCosts };
  const canDuplicate = accessHas(access, "saveAsStandardProduct");
  const canEditSizes = accessHas(access, "createInlineCatalog");
  const canViewCosts = accessHas(access, "viewProductCosts");
  const canEditBom = accessHas(access, "createInlineCatalog");
  const resolvedTab: ProductDetailTab =
    canViewCosts && (activeTab === "cut" || activeTab === "price")
      ? activeTab
      : "composition";

  const sewRow =
    product.operations.find((row) => isSewOperationName(row.operation.nameUk)) ??
    product.operations
      .filter((row) => !isCutOperationName(row.operation.nameUk))
      .sort((a, b) => operationFallbackRate(b) - operationFallbackRate(a))[0] ??
    null;
  const cutRow = product.operations.find((row) => isCutOperationName(row.operation.nameUk));
  const priceQtySet = new Set<number>([
    ...SHARED_PRODUCT_TIRAGE_QTYS,
    ...(product.cutRateTiers ?? []).map((tier) => tier.minQuantity),
    ...(product.commercialPriceTiers ?? []).map((tier) => tier.minQuantity),
  ]);
  const priceQtys = [...priceQtySet].filter((qty) => qty > 0).sort((a, b) => a - b);
  const otherLineNames = product.operations
    .filter((row) => {
      const name = row.operation.nameUk;
      return (
        !isCutOperationName(name) &&
        !isSewOperationName(name) &&
        !isDeliveryOperationName(name) &&
        !isFixedCostOperationName(name)
      );
    })
    .map((row) => row.operation.nameUk);
  const otherHasExtraAdditional = product.additionalCosts.some((row) => Number(row.amount) > 0);
  const tirageCostHints = canViewCosts
    ? priceQtys.map((qty) => {
        const calc = buildCalcFromProduct(product, qty, {
          ...pricingWithFixed,
          quantityAwareMaterialPrices: true,
          sizeMode: "standard",
        });
        let sewingPerUnit = 0;
        if (sewRow) {
          const fallback = operationFallbackRate(sewRow);
          if (sewRow.operation.calculationMethod === "QUANTITY_TIER") {
            sewingPerUnit = resolveQuantityTierRate({
              quantity: qty,
              tiers: pickOperationQuantityTiers(sewRow.rateTiers, sewRow.operation.rateTiers),
              fallbackRate: fallback,
            });
          } else if (sewRow.operation.calculationMethod === "SHIFT_OUTPUT") {
            sewingPerUnit = operationUnitCost(sewRow);
          } else {
            sewingPerUnit = fallback;
          }
        }
        const cutPerUnit = cutRow
          ? resolveCutUnitRateForProduct(product, qty, operationFallbackRate(cutRow))
          : 0;
        const deliveryRow = product.operations.find(
          (op) =>
            op.operation.calculationMethod === "QUANTITY_TIER" &&
            isDeliveryOperationName(op.operation.nameUk),
        );
        const opDeliveryPerUnit = deliveryRow
          ? resolveQuantityTierRate({
              quantity: qty,
              tiers: pickOperationQuantityTiers(deliveryRow.rateTiers, deliveryRow.operation.rateTiers),
              fallbackRate: operationFallbackRate(deliveryRow),
            })
          : 0;
        const fabricDeliveryTotal = productFabricDeliveryAmount(product, qty, {
          ...pricingWithFixed,
          sizeMode: "standard",
        });
        const materialDeliveryPerUnit = qty > 0 ? fabricDeliveryTotal / qty : 0;
        const deliveryPerUnit = opDeliveryPerUnit + materialDeliveryPerUnit;
        const operationsPerUnit = qty > 0 ? Number(calc.operationsSubtotal) / qty : 0;
        const extraAdditionalTotal = product.additionalCosts.reduce((sum, row) => {
          const amount = Number(row.amount);
          if (!Number.isFinite(amount)) return sum;
          return sum + (row.isPerUnit ? amount * qty : amount);
        }, 0);
        // PV = additionalCosts − product extras − fabric delivery (fabric goes to «Достав.»).
        const pvTotal = Math.max(
          0,
          Number(calc.additionalCostsSubtotal) - extraAdditionalTotal - fabricDeliveryTotal,
        );
        const extraAdditionalPerUnit = qty > 0 ? extraAdditionalTotal / qty : 0;
        // Пакування = операції комплектації крім крою/пошиву/доставки + additionalCosts виробу.
        const otherOpsPerUnit =
          operationsPerUnit - cutPerUnit - sewingPerUnit - opDeliveryPerUnit + extraAdditionalPerUnit;
        return {
          minQuantity: qty,
          costPerUnit: Number(calc.costPerUnit),
          sewingPerUnit,
          cutPerUnit,
          deliveryPerUnit,
          materialDeliveryPerUnit,
          otherOpsPerUnit,
          otherLineNames,
          otherHasExtraAdditional,
          materialsPerUnit: qty > 0 ? Number(calc.materialsSubtotal) / qty : 0,
          operationsPerUnit,
          additionalPerUnit: qty > 0 ? pvTotal / qty : 0,
          decorationsPerUnit: qty > 0 ? Number(calc.decorationsSubtotal) / qty : 0,
        };
      })
    : [];

  // Product card = base norms, no size markups (those apply only in orders).
  const costCalc = buildCalcFromProduct(product, ECONOMICS_PREVIEW_QTY, {
    ...pricingWithFixed,
    quantityAwareMaterialPrices: true,
    sizeMode: "standard",
  });
  const economicsSewing = resolveSewingPerUnitFromOperations(
    product.operations.map((row) => ({
      nameUk: row.operation.nameUk,
      rateOverride: row.rateOverride != null ? Number(row.rateOverride) : null,
      baseRate: row.operation.baseRate != null ? Number(row.operation.baseRate) : null,
      unitRate:
        row.rateOverride != null
          ? Number(row.rateOverride)
          : row.operation.baseRate != null
            ? Number(row.operation.baseRate)
            : null,
    })),
  );
  const { calc } = calcWithClientPrice({
    costCalc,
    quantity: ECONOMICS_PREVIEW_QTY,
    product,
    sewingPerUnit: economicsSewing,
  });
  const operationRows = product.operations
    .map((row) => mapOperationRow(row, product))
    .filter((row) => !isFixedCostOperationName(row.name));
  const hasCutOperation = operationRows.some((row) => row.isCut);
  const operationsSubtotalFixed = operationRows
    .filter(
      (row) =>
        !row.isCut &&
        !isDeliveryOperationName(row.name) &&
        !isFixedCostOperationName(row.name),
    )
    .reduce((sum, row) => sum + row.unitCost, 0);

  let fixedCostPreview: {
    perUnit: number;
    coefficient: number;
    sewingPerUnit: number;
    sewerCount: number;
  } | null = null;
  if (canViewCosts && fixedCosts && economicsSewing > 0) {
    const metrics = computeFixedCostMetrics({
      workingDaysPerMonth: fixedCosts.workingDaysPerMonth,
      sewerCount: fixedCosts.companySewerCount,
      dailySewerPay: fixedCosts.dailySewerPay,
      monthlyTotal: fixedCosts.monthlyTotal,
    });
    if (metrics) {
      fixedCostPreview = {
        perUnit: fixedCostPerUnitFromSewing(economicsSewing, metrics.coefficient),
        coefficient: metrics.coefficient,
        sewingPerUnit: economicsSewing,
        sewerCount: fixedCosts.companySewerCount,
      };
    }
  }

  const readiness = [
    { label: "Матеріали", done: product.materials.length > 0, count: product.materials.length },
    { label: "Операції", done: product.operations.length > 0, count: product.operations.length },
    { label: "Розміри", done: product.sizes.length > 0, count: product.sizes.length },
  ];
  const readyCount = readiness.filter((row) => row.done).length;
  const isReady = readyCount === readiness.length;
  const isArchived = product.status === "ARCHIVED";
  const compositionCount =
    product.materials.length + product.operations.length;

  return (
    <div className="space-y-4">
      <Breadcrumbs items={[{ label: "Вироби", href: "/products" }, { label: product.nameUk }]} />

      {isArchived ? (
        <Banner tone="warning" title="Виріб в архіві">
          Його не можна додати в нове замовлення. Існуючі замовлення та збережені пропозиції не змінюються.
        </Banner>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <ProductImagePicker
            productId={product.id}
            imageUrl={product.imageUrl}
            disabled={isArchived}
          />
          <ProductIdentityEditor
            productId={product.id}
            nameUk={product.nameUk}
            internalCode={product.internalCode}
            description={product.description}
            disabled={isArchived || !canEditSizes}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {product.isBaseModel ? (
            <StatusBadge tone="info">Базова модель</StatusBadge>
          ) : null}
          <StatusBadge tone={isReady ? "success" : "warning"}>
            {isArchived ? "Архів" : isReady ? "Готовий до замовлення" : `Комплектація ${readyCount}/${readiness.length}`}
          </StatusBadge>
        </div>
      </div>

      <QuickActions>
        {!isArchived ? (
          <QuickAction
            icon={<IconOrders size={15} />}
            href={`/orders/new?productId=${product.id}`}
            hint="productNewOrder"
          >
            Створити замовлення
          </QuickAction>
        ) : null}
        {canDuplicate ? (
          <DuplicateProductButton productId={product.id} productNameUk={product.nameUk} />
        ) : null}
      </QuickActions>

      <div className="grid gap-4 md:grid-cols-3">
        <HeaderBlock title="Розміри" icon={<IconSizes size={16} />}>
          {canEditSizes && !isArchived ? (
            <ProductSizesEditor
              key={`${product.sizeChartVariantId ?? ""}|${product.sizes.map((row) => row.sizeId).join("|")}`}
              productId={product.id}
              selectedSizeIds={product.sizes.map((row) => row.sizeId)}
              selectedVariantId={product.sizeChartVariantId}
              variants={sizeVariants}
              catalog={sizeCatalog.map((size) => ({
                id: size.id,
                code: size.code,
                nameUk: size.nameUk,
                variantId: size.variantId,
                descriptionUk: size.descriptionUk,
              }))}
            />
          ) : product.sizes.length === 0 ? (
            <p className="type-body-secondary">
              Розміри не задані — контрольний розрахунок ведеться на єдиний розмір.
            </p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {product.sizes.map((row) => (
                <span
                  key={row.id}
                  className="rounded-[var(--radius-badge)] bg-[var(--color-surface-subtle)] px-2 py-1 text-[12.5px] font-medium text-[var(--color-text-secondary)]"
                >
                  {row.size.nameUk}
                </span>
              ))}
            </div>
          )}
        </HeaderBlock>

        <HeaderBlock title="Готовність">
          <ul className="space-y-1.5">
            {readiness.map((row) => (
              <li key={row.label} className="flex items-center gap-2 text-[13.5px]">
                {row.done ? (
                  <IconCheckCircle size={16} className="text-[var(--color-success-text)]" />
                ) : (
                  <IconCircle size={16} className="text-[var(--color-text-tertiary)]" />
                )}
                <span className={row.done ? "" : "text-[var(--color-text-secondary)]"}>{row.label}</span>
                <span className="tabular ml-auto text-[var(--color-text-tertiary)]">{row.count}</span>
              </li>
            ))}
          </ul>
        </HeaderBlock>

        <HeaderBlock title="Де використовується" icon={<IconOrders size={16} />}>
          {usedIn.length === 0 ? (
            <p className="type-body-secondary">
              Виріб ще не потрапляв у замовлення. Створіть перше — комплектація скопіюється як є.
            </p>
          ) : (
            <ul className="space-y-2">
              {usedIn.map((row) => (
                <li key={row.id} className="flex items-start justify-between gap-2 text-[13px]">
                  <div className="min-w-0">
                    <Link
                      href={`/orders/${row.order.id}`}
                      className="tabular block truncate font-medium hover:text-[var(--color-primary-700)] hover:underline"
                    >
                      {row.order.number}
                    </Link>
                    <span className="type-caption block truncate">{row.order.client.companyName}</span>
                  </div>
                  <span className="tabular shrink-0 whitespace-nowrap text-[var(--color-text-secondary)]">
                    {row.totalQuantity} шт
                  </span>
                </li>
              ))}
            </ul>
          )}
        </HeaderBlock>
      </div>

      <ProductDetailPreviewShell
        productId={product.id}
        initialCalc={calc}
        initialQuantity={ECONOMICS_PREVIEW_QTY}
        minimumMarginPercent={pricing.minimumMarginPercent}
        showEconomics={false}
      >
          <ProductDetailTabs
            productId={product.id}
            activeTab={resolvedTab}
            compositionCount={compositionCount}
            showPricing={canViewCosts}
            bom={{
              productId: product.id,
              hideCosts: !canViewCosts,
              readOnly: !canEditBom || isArchived,
              sizeRules: pricing.sizeRules ?? [],
              sizes: product.sizes.map((row) => ({
                id: row.sizeId,
                code: row.size.code,
                nameUk: row.size.nameUk,
              })),
              materials: product.materials.map((row) => ({
                id: row.id,
                name: row.material.nameUk,
                unit: row.material.unitOfMeasure.code,
                consumption: Number(row.consumptionPerUnit),
                waste: Number(row.wastePercent ?? row.material.defaultWastePercent),
                price: canViewCosts
                  ? resolveBomMaterialPurchasePrice({
                      material: row.material,
                      offers: row.material.supplierOffers ?? [],
                      supplierId: row.supplierId,
                      companyCostMode: pricing.materialCostVatMode ?? "NET",
                      metersNeeded: null,
                    })
                  : 0,
                sizeCodes: sizeCodesFromScopes(row.sizeScopes),
                sizeConsumption: sizeConsumptionFromNorms(row.sizeNorms),
                sizeWaste: sizeWasteFromNorms(row.sizeNorms),
                composition: row.material.composition?.trim() || null,
                densityGsm: row.material.densityGsm?.trim() || null,
                supplierId: row.supplierId,
                deliveryType: row.deliveryType,
                colorSnapshot: row.colorSnapshot,
                materialAvailableColors: row.material.availableColors ?? [],
                supplierOffers: (row.material.supplierOffers ?? []).map((offer) => {
                  return {
                    supplierId: offer.supplierId,
                    supplierName: offer.supplier.nameUk,
                    isPrimary: offer.isPrimary,
                    availableColors: offer.availableColors ?? [],
                    preferredDeliveryType: offer.deliveryType,
                    deliveryOptions: [
                      offer.cargoUsdPerKg != null
                        ? {
                            type: "CARGO" as const,
                            label: "CARGO",
                            rateLabel: `${Number(offer.cargoUsdPerKg)} $/кг`,
                          }
                        : null,
                      offer.npStandardUsdPerKg != null
                        ? {
                            type: "NP_STANDARD" as const,
                            label: "НП стандарт",
                            rateLabel: `${Number(offer.npStandardUsdPerKg)} $/кг`,
                          }
                        : null,
                      offer.npVolumeUsdPerKg != null
                        ? {
                            type: "NP_VOLUME" as const,
                            label: "НП обʼємні",
                            rateLabel: `${Number(offer.npVolumeUsdPerKg)} $/кг`,
                          }
                        : null,
                    ].filter(Boolean) as Array<{
                      type: "CARGO" | "NP_STANDARD" | "NP_VOLUME";
                      label: string;
                      rateLabel: string;
                    }>,
                  };
                }),
              })),
              operations: operationRows.map((row) =>
                canViewCosts
                  ? row
                  : {
                      ...row,
                      unitCost: 0,
                      rateTiers: [],
                      cutDisplay: null,
                    },
              ),
              decorations: product.decorations.map((row) => ({
                id: row.id,
                name: row.decorationMethod.nameUk,
                setupCost: canViewCosts
                  ? row.setupCostOverride != null
                    ? Number(row.setupCostOverride)
                    : Number(row.decorationMethod.setupCost)
                  : 0,
                unitRate: canViewCosts ? Number(row.decorationMethod.unitRate) : 0,
              })),
              materialsSubtotal: canViewCosts
                ? Number(calc.materialsSubtotal) / ECONOMICS_PREVIEW_QTY
                : 0,
              operationsSubtotal: canViewCosts ? operationsSubtotalFixed : 0,
              hasCutOperation,
              decorationSetupTotal: canViewCosts
                ? product.decorations.reduce(
                    (sum, row) =>
                      sum +
                      (row.setupCostOverride != null
                        ? Number(row.setupCostOverride)
                        : Number(row.decorationMethod.setupCost)),
                    0,
                  )
                : 0,
              decorationUnitRateTotal: canViewCosts
                ? product.decorations.reduce(
                    (sum, row) => sum + Number(row.decorationMethod.unitRate),
                    0,
                  )
                : 0,
              materialOptions: materials.map((m) => ({
                id: m.id,
                label: `${m.nameUk} (${m.unitOfMeasure.code})`,
                unit: m.unitOfMeasure.code,
                composition: m.composition?.trim() || null,
                densityGsm: m.densityGsm?.trim() || null,
                supplierNames: materialSupplierNames(m),
              })),
              operationOptions: operations.map((o) => ({ id: o.id, label: o.nameUk })),
              decorationOptions: decorations.map((d) => ({ id: d.id, label: d.nameUk })),
              unitOptions: units.map((u) => ({ id: u.id, label: u.nameUk, code: u.code })),
              cutRateContext: {
                optimalQty: product.optimalQty,
                tiers: (product.cutRateTiers ?? []).map((tier) => ({
                  minQuantity: tier.minQuantity,
                  ratePerUnit: Number(tier.ratePerUnit),
                })),
              },
              fixedCostPreview,
            }}
            cut={{
              productId: product.id,
              optimalQty: product.optimalQty,
              tiers: (product.cutRateTiers ?? []).map((tier) => ({
                minQuantity: tier.minQuantity,
                ratePerUnit: Number(tier.ratePerUnit),
              })),
            }}
            deliveryOp={(() => {
              const row = product.operations.find(
                (op) =>
                  op.operation.calculationMethod === "QUANTITY_TIER" &&
                  isDeliveryOperationName(op.operation.nameUk),
              );
              if (!row) return null;
              return {
                productOperationId: row.id,
                name: row.operation.nameUk,
                tiers: pickOperationQuantityTiers(row.rateTiers, row.operation.rateTiers),
              };
            })()}
            price={{
              productId: product.id,
              isBaseModel: product.isBaseModel,
              tiers: (product.commercialPriceTiers ?? []).map((tier) => ({
                minQuantity: tier.minQuantity,
                pricePerUnit: Number(tier.pricePerUnit),
                showOnCard: Boolean((tier as { showOnCard?: boolean }).showOnCard),
                sewingMultiplier:
                  (tier as { sewingMultiplier?: unknown }).sewingMultiplier != null
                    ? Number((tier as { sewingMultiplier?: unknown }).sewingMultiplier)
                    : null,
              })),
              costHints: tirageCostHints,
              showDeliveryColumn:
                tirageCostHints.some(
                  (h) => (h.materialDeliveryPerUnit ?? 0) > 0 || (h.deliveryPerUnit ?? 0) > 0,
                ) ||
                product.materials.some(
                  (row) =>
                    row.material.type === "FABRIC" &&
                    row.material.metersPerKg != null &&
                    Number(row.material.metersPerKg) > 0,
                ),
            }}
          />
      </ProductDetailPreviewShell>
    </div>
  );
}
