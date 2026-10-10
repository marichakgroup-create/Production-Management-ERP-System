import { prisma } from "@/server/db/client";
import { getProduct, assertProductOrderable } from "@/server/domains/products/service";
import { recordActivity } from "@/server/domains/activity/service";
import type { OrderStatus, Prisma } from "@prisma/client";
import { orderStatusLabel } from "@/lib/order-status";
import {
  expandMaterialsForSizes,
  expandOperationsForSizes,
  sizeCodesFromScopes,
  sizeConsumptionFromNorms,
  sizeWasteFromNorms,
} from "@/lib/size-bom";
import {
  effectiveOversizeConsumption,
  isOversizeCode,
  materialCoeffsBySize,
  resolveSizeCoeffs,
  type SizeCoeffRule,
} from "@/lib/size-coeffs";
import {
  buildCalcFromOrderItem,
  calcOptionsFromProduct,
  getPricingDefaults,
  getPricingForOrder,
  quantityTiersByOperationIdFromProduct,
  resolveFixedCostAllocationForOrderItem,
} from "@/server/domains/calculation/from-entities";
import { fixedCostOptionsFromDb } from "@/server/domains/fixed-costs/service";
import { commercialPriceForOrderItem, draftLineFromItem, mergeCommercialAndCost } from "@/lib/order-item-commercial";
import { isCutOperationName, resolveCutUnitRateForProduct } from "@/lib/cut-rate";
import { isScreenPrintDecorationName } from "@/lib/screen-print-pricing";
import {
  decorationFormatLineName,
  mapDecorationFormatTiers,
  resolveDecorationFormatRate,
} from "@/lib/decoration-format-pricing";
import {
  pickOperationQuantityTiers,
  resolveQuantityTierRate,
} from "@/lib/quantity-tiers";
import { computeFabricDeliveryLine } from "@/lib/fabric-delivery";
import {
  packsToOrder,
  trimPackSpend,
  hasTrimPackQuote,
  deriveTrimUnitPriceFromSupplier,
  trimConfiguredDeliveryOptions,
} from "@/lib/trim-pack-pricing";
import {
  configuredSupplierDeliveryOptions,
  resolveSupplierDeliveryRate,
} from "@/lib/supplier-delivery-rates";
import {
  fabricFieldsForOrderLine,
  materialToSnapshot,
  offerToSnapshot,
  pickSupplierOffer,
  resolveBomMaterialPurchasePrice,
} from "@/lib/order-material-terms";
import {
  fabricMetersNeeded,
  fabricPricingModeLabel,
  resolveMaterialLinePurchasePrice,
  resolveCostMode,
  resolveMinWholesaleMeters,
  type MaterialCostVatMode,
} from "@/lib/fabric-pricing";
import { getFabricPricingGlobals } from "@/server/domains/catalog/materials";
import {
  deliveryRateUsdPerKg,
  isFabricDeliveryType,
  normalizeFabricDeliveryType,
  type FabricDeliveryTypeCode,
} from "@/lib/fabric-delivery-types";
import {
  additionalCostCreateFromSnapshot,
  decorationCreateFromSnapshot,
  materialCreateFromSnapshot,
  operationCreateFromSnapshot,
  parseProposalItemSnapshot,
  proposalSnapshotRestorable,
} from "@/lib/proposal-snapshot";

function deliveryTypeOrNull(value: unknown): FabricDeliveryTypeCode | null {
  return isFabricDeliveryType(value) ? value : null;
}
import {
  itemNeedsSizeBreakdown,
  itemSizeBreakdownReady,
  isRealSizeCode,
  sizesQuantitySum,
  type OrderSizeLine,
} from "@/lib/order-item-sizes";
import { orderArtworkReady } from "@/lib/order-files";

type FabricMaterialFields = {
  type?: string | null;
  purchasePrice: { toString(): string } | number;
  metersPerKg?: { toString(): string } | number | null;
  priceKgUsd?: { toString(): string } | number | null;
  priceKgUsdCargo?: { toString(): string } | number | null;
  priceMeterUahNoVat?: { toString(): string } | number | null;
  priceMeterUahVat?: { toString(): string } | number | null;
  priceMeterUahCutVat?: { toString(): string } | number | null;
  metersPerRoll?: { toString(): string } | number | null;
  minWholesaleMeters?: { toString(): string } | number | null;
  costVatOverride?: MaterialCostVatMode | null;
  deliveryType?: FabricDeliveryTypeCode | string | null;
};

function numField(value: { toString(): string } | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function purchasePriceForOrderMaterial(
  material: FabricMaterialFields,
  companyCostMode: MaterialCostVatMode,
  metersNeeded: number | null,
  minWholesaleMetersOverride?: number | null,
) {
  return resolveMaterialLinePurchasePrice({
    type: material.type,
    purchasePrice: Number(material.purchasePrice),
    priceMeterUahNoVat: numField(material.priceMeterUahNoVat),
    priceMeterUahVat: numField(material.priceMeterUahVat),
    priceMeterUahCutVat: numField(material.priceMeterUahCutVat),
    metersPerRoll: numField(material.metersPerRoll),
    minWholesaleMeters:
      minWholesaleMetersOverride != null && minWholesaleMetersOverride > 0
        ? minWholesaleMetersOverride
        : numField(material.minWholesaleMeters),
    costVatOverride: material.costVatOverride,
    companyCostMode,
    metersNeeded,
  }).purchasePrice;
}

async function supplierOfferForLine(
  materialId: string | null | undefined,
  supplierId: string | null | undefined,
  tx: Prisma.TransactionClient = prisma,
) {
  if (!materialId || !supplierId) return null;
  return tx.materialSupplier.findUnique({
    where: { materialId_supplierId: { materialId, supplierId } },
    include: { supplier: true },
  });
}

function orderLineFabricFields(
  row: { costVatOverride?: MaterialCostVatMode | null },
  material: FabricMaterialFields & { costVatOverride?: MaterialCostVatMode | null },
  offer?: Awaited<ReturnType<typeof supplierOfferForLine>>,
) {
  const merged = fabricFieldsForOrderLine(
    materialToSnapshot(material),
    offer ? offerToSnapshot(offer) : null,
  );
  const costVatOverride = row.costVatOverride ?? material.costVatOverride ?? null;
  return { ...merged, costVatOverride };
}

function previewFabricLineTerms(input: {
  row: {
    consumptionPerUnit: { toString(): string } | number;
    wastePercent: { toString(): string } | number;
    sizeCode: string | null;
    deliveryType?: string | null;
    cargoUsdPerKg?: { toString(): string } | number | null;
    usdUahRate?: { toString(): string } | number | null;
    costVatOverride?: MaterialCostVatMode | null;
    minWholesaleMetersOverride?: { toString(): string } | number | null;
  };
  material: FabricMaterialFields & {
    type?: string | null;
    purchasePrice: { toString(): string } | number;
    priceMeterUahCutVat?: { toString(): string } | number | null;
    costVatOverride?: MaterialCostVatMode | null;
  };
  offer?: Awaited<ReturnType<typeof supplierOfferForLine>>;
  quantitiesBySize: Record<string, number>;
  globals: Awaited<ReturnType<typeof getFabricPricingGlobals>>;
  sizeRules?: SizeCoeffRule[] | null;
  costVatOverride?: MaterialCostVatMode | null;
  cargoOverride?: number | null;
  usdUahRateOverride?: number | null;
  minWholesaleMetersOverride?: number | null;
}) {
  const sizeMaterialCoeffs = materialCoeffsBySize(
    Object.keys(input.quantitiesBySize),
    input.sizeRules,
  );
  const metersNeeded = fabricMetersNeeded({
    consumptionPerUnit: Number(input.row.consumptionPerUnit),
    wastePercent: Number(input.row.wastePercent),
    quantitiesBySize: input.quantitiesBySize,
    sizeCode: input.row.sizeCode,
    sizeMaterialCoeffs,
  });
  const vatOverride =
    input.costVatOverride ?? input.row.costVatOverride ?? input.material.costVatOverride ?? null;
  const fields = orderLineFabricFields({ costVatOverride: vatOverride }, input.material, input.offer);
  const override =
    input.minWholesaleMetersOverride != null
      ? input.minWholesaleMetersOverride
      : numField(input.row.minWholesaleMetersOverride);
  const catalogMinWholesale = resolveMinWholesaleMeters({
    minWholesaleMeters: fields.minWholesaleMeters,
    metersPerRoll: fields.metersPerRoll,
  });
  const effectiveMinWholesale =
    override != null && override > 0 ? override : catalogMinWholesale;

  const resolved = resolveMaterialLinePurchasePrice({
    type: input.material.type,
    purchasePrice: Number(input.material.purchasePrice),
    priceMeterUahNoVat: fields.priceMeterUahNoVat,
    priceMeterUahVat: fields.priceMeterUahVat,
    priceMeterUahCutVat: fields.priceMeterUahCutVat ?? numField(input.material.priceMeterUahCutVat),
    metersPerRoll: fields.metersPerRoll,
    minWholesaleMeters: effectiveMinWholesale,
    costVatOverride: fields.costVatOverride,
    companyCostMode: input.globals.materialCostVatMode,
    metersNeeded,
  });
  const resolvedNet = resolveMaterialLinePurchasePrice({
    type: input.material.type,
    purchasePrice: Number(input.material.purchasePrice),
    priceMeterUahNoVat: fields.priceMeterUahNoVat,
    priceMeterUahVat: fields.priceMeterUahVat,
    priceMeterUahCutVat: fields.priceMeterUahCutVat ?? numField(input.material.priceMeterUahCutVat),
    metersPerRoll: fields.metersPerRoll,
    minWholesaleMeters: effectiveMinWholesale,
    costVatOverride: "NET",
    companyCostMode: "NET",
    metersNeeded,
  });
  const resolvedGross = resolveMaterialLinePurchasePrice({
    type: input.material.type,
    purchasePrice: Number(input.material.purchasePrice),
    priceMeterUahNoVat: fields.priceMeterUahNoVat,
    priceMeterUahVat: fields.priceMeterUahVat,
    priceMeterUahCutVat: fields.priceMeterUahCutVat ?? numField(input.material.priceMeterUahCutVat),
    metersPerRoll: fields.metersPerRoll,
    minWholesaleMeters: effectiveMinWholesale,
    costVatOverride: "GROSS",
    companyCostMode: "GROSS",
    metersNeeded,
  });
  const cargoUsdPerKg =
    input.cargoOverride ??
    numField(input.row.cargoUsdPerKg) ??
    (input.offer
      ? resolveSupplierDeliveryRate(
          {
            deliveryType:
              input.row.deliveryType ??
              (input.offer as { deliveryType?: string | null }).deliveryType,
            cargoUsdPerKg: numField(input.offer.cargoUsdPerKg),
            npStandardUsdPerKg: numField(
              (input.offer as { npStandardUsdPerKg?: { toString(): string } | number | null })
                .npStandardUsdPerKg,
            ),
            npVolumeUsdPerKg: numField(
              (input.offer as { npVolumeUsdPerKg?: { toString(): string } | number | null })
                .npVolumeUsdPerKg,
            ),
          },
          input.globals,
        ).rateUsdPerKg
      : null) ??
    deliveryRateUsdPerKg(
      input.row.deliveryType ?? input.material.deliveryType,
      input.globals,
    );
  const usdUahRate =
    input.usdUahRateOverride ??
    numField(input.row.usdUahRate) ??
    input.globals.usdUahRate;
  const deliveryAmount = computeFabricDeliveryLine(
    {
      type: "FABRIC",
      metersPerKg: fields.metersPerKg,
      priceKgUsd: fields.priceKgUsd,
      priceKgUsdCargo: fields.priceKgUsdCargo,
      cargoUsdPerKg,
      deliveryType: input.row.deliveryType ?? input.material.deliveryType,
      usdUahRate,
      consumptionPerUnit: Number(input.row.consumptionPerUnit),
      wastePercent: Number(input.row.wastePercent),
      sizeCode: input.row.sizeCode,
    },
    input.quantitiesBySize,
    input.globals,
    input.sizeRules,
  );
  const metersPerKg = fields.metersPerKg;
  const kgNeeded =
    metersPerKg != null && metersPerKg > 0 && metersNeeded > 0
      ? Math.round((metersNeeded / metersPerKg) * 10) / 10
      : null;

  const cutPurchasePrice =
    numField(fields.priceMeterUahCutVat) ?? numField(input.material.priceMeterUahCutVat);
  const hasCutPrice = cutPurchasePrice != null && cutPurchasePrice > 0;
  // Межа роздробу — окремо; роздріб (cut) дає вищу ₴/м нижче межі.
  const minWholesaleMeters =
    override != null && override > 0 ? override : catalogMinWholesale;

  return {
    purchasePricePerMeter: resolved.purchasePrice,
    purchasePriceNet: resolvedNet.purchasePrice,
    purchasePriceGross: resolvedGross.purchasePrice,
    wholesalePurchasePrice: resolved.wholesalePurchasePrice,
    wholesalePurchasePriceNet: resolvedNet.wholesalePurchasePrice,
    wholesalePurchasePriceGross: resolvedGross.wholesalePurchasePrice,
    pricingMode: resolved.pricingMode,
    pricingModeLabel: fabricPricingModeLabel(resolved.pricingMode),
    cutPurchasePrice: resolved.cutPurchasePrice,
    hasCutPrice,
    hasWholesalePrice: resolved.wholesalePurchasePrice > 0,
    minWholesaleMeters,
    catalogMinWholesaleMeters: catalogMinWholesale,
    minWholesaleMetersOverride: override != null && override > 0 ? override : null,
    priceMeterUahNoVat: fields.priceMeterUahNoVat,
    priceMeterUahVat: fields.priceMeterUahVat,
    priceKgUsd: fields.priceKgUsd,
    metersPerKg,
    cargoUsdPerKg,
    usdUahRate,
    metersNeeded: Math.round(metersNeeded * 100) / 100,
    kgNeeded,
    materialPartyCost: Math.round(resolved.purchasePrice * metersNeeded * 100) / 100,
    deliveryAmount,
    costVatMode: resolveCostMode(input.globals.materialCostVatMode, vatOverride),
  };
}

function fabricDeliverySourceForLine(input: {
  row: {
    consumptionPerUnit: { toString(): string } | number;
    wastePercent: { toString(): string } | number;
    sizeCode: string | null;
    deliveryType?: string | null;
    cargoUsdPerKg?: { toString(): string } | number | null;
    usdUahRate?: { toString(): string } | number | null;
  };
  material: FabricMaterialFields & { type?: string | null };
  offer?: Awaited<ReturnType<typeof supplierOfferForLine>>;
}) {
  const merged = orderLineFabricFields(
    { costVatOverride: null },
    input.material,
    input.offer,
  );
  const lineDeliveryType =
    input.row.deliveryType ??
    (input.offer as { deliveryType?: string | null } | undefined)?.deliveryType ??
    input.material.deliveryType ??
    null;
  const offerRateForType = (type: string | null | undefined): number | null => {
    if (!input.offer || !type) return null;
    const offer = input.offer as {
      cargoUsdPerKg?: { toString(): string } | number | null;
      npStandardUsdPerKg?: { toString(): string } | number | null;
      npVolumeUsdPerKg?: { toString(): string } | number | null;
    };
    if (type === "NP_STANDARD") return numField(offer.npStandardUsdPerKg);
    if (type === "NP_VOLUME") return numField(offer.npVolumeUsdPerKg);
    return numField(offer.cargoUsdPerKg);
  };
  const cargoOverride =
    numField(input.row.cargoUsdPerKg) ?? offerRateForType(lineDeliveryType);
  const usdUahRateOverride = numField(input.row.usdUahRate);
  return {
    type: merged.type ?? input.material.type,
    metersPerKg: merged.metersPerKg,
    priceKgUsd: merged.priceKgUsd,
    priceKgUsdCargo: merged.priceKgUsdCargo,
    cargoUsdPerKg: cargoOverride,
    deliveryType: lineDeliveryType,
    usdUahRate: usdUahRateOverride,
    consumptionPerUnit: Number(input.row.consumptionPerUnit),
    wastePercent: Number(input.row.wastePercent),
    sizeCode: input.row.sizeCode,
  };
}

export async function listOrders(filters?: {
  search?: string;
  status?: OrderStatus;
}) {
  const search = filters?.search?.trim();
  return prisma.order.findMany({
    where: {
      ...(filters?.status ? { status: filters.status } : {}),
      ...(search
        ? {
            OR: [
              { number: { contains: search, mode: "insensitive" } },
              { title: { contains: search, mode: "insensitive" } },
              { client: { companyName: { contains: search, mode: "insensitive" } } },
              { items: { some: { nameUk: { contains: search, mode: "insensitive" } } } },
            ],
          }
        : {}),
    },
    include: {
      client: true,
      manager: { select: { id: true, name: true } },
      items: {
        where: { superseded: false },
        orderBy: { createdAt: "asc" },
        include: {
          versions: {
            orderBy: [{ isApproved: "desc" }, { versionNumber: "desc" }],
            take: 1,
            select: {
              versionNumber: true,
              isApproved: true,
              totalSellingValue: true,
              marginPercent: true,
            },
          },
          _count: { select: { materials: true, operations: true } },
        },
      },
      _count: { select: { items: { where: { superseded: false } } } },
    },
    orderBy: { createdAt: "desc" },
  });
}

export async function getOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      client: true,
      manager: { select: { id: true, name: true, email: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          product: {
            select: {
              imageUrl: true,
              optimalQty: true,
              isBaseModel: true,
              cutRateTiers: { orderBy: { minQuantity: "asc" } },
              commercialPriceTiers: { orderBy: { minQuantity: "asc" } },
              _count: { select: { sizes: true } },
              sizes: {
                orderBy: { size: { sortOrder: "asc" } },
                select: {
                  size: { select: { code: true, nameUk: true } },
                },
              },
              operations: {
                select: {
                  operationId: true,
                  rateTiers: { orderBy: { minQuantity: "asc" } },
                  operation: {
                    select: {
                      calculationMethod: true,
                      baseRate: true,
                      rateTiers: { orderBy: { minQuantity: "asc" } },
                    },
                  },
                },
              },
            },
          },
          sizes: true,
          materials: {
            orderBy: { sortOrder: "asc" },
            include: {
              material: {
                include: {
                  supplierOffers: {
                    include: {
                      supplier: { select: { id: true, nameUk: true } },
                    },
                    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
                  },
                },
              },
            },
          },
          operations: { orderBy: { sortOrder: "asc" } },
          decorations: { orderBy: { sortOrder: "asc" } },
          additionalCosts: true,
          versions: {
            orderBy: { versionNumber: "desc" },
            include: { author: { select: { name: true } } },
          },
          specification: true,
        },
      },
      files: true,
    },
  });
}

async function nextOrderNumber() {
  const year = new Date().getFullYear();
  const prefix = `ЗМ-${year}-`;
  const latest = await prisma.order.findFirst({
    where: { number: { startsWith: prefix } },
    orderBy: { number: "desc" },
    select: { number: true },
  });
  const seq = latest ? Number(latest.number.slice(prefix.length)) + 1 : 1;
  return `${prefix}${String(seq).padStart(4, "0")}`;
}

type CatalogProduct = NonNullable<Awaited<ReturnType<typeof getProduct>>>;

function bomFromProduct(
  product: CatalogProduct,
  orderedSizeCodes: string[],
  totalQuantity: number,
  quantitiesBySize: Record<string, number>,
  companyCostMode: MaterialCostVatMode,
  sizeRules?: Array<{ sizeCode: string; materialCoeff: number; operationCoeff: number }>,
) {
  const expandedMaterials = expandMaterialsForSizes(
    product.materials.map((row) => ({
      materialId: row.materialId,
      consumption: Number(row.consumptionPerUnit),
      waste: Number(row.wastePercent ?? row.material.defaultWastePercent),
      sizeCodes: sizeCodesFromScopes(row.sizeScopes),
      sizeConsumption: sizeConsumptionFromNorms(row.sizeNorms),
      sizeWaste: sizeWasteFromNorms(row.sizeNorms),
    })),
    orderedSizeCodes,
  );
  const materialById = new Map(product.materials.map((row) => [row.materialId, row]));
  const bakeOversizeConsumption = (
    consumption: number,
    sizeCode: string | null,
    sizeConsumption: Record<string, number>,
  ) => {
    if (!sizeCode || !isOversizeCode(sizeCode)) return consumption;
    if (sizeConsumption[sizeCode] != null) return consumption;
    const { materialCoeff } = resolveSizeCoeffs(sizeCode, sizeRules);
    return effectiveOversizeConsumption(consumption, materialCoeff);
  };
  const expandedOperations = expandOperationsForSizes(
    product.operations.map((row) => ({
      operationId: row.operationId,
      sizeCodes: sizeCodesFromScopes(row.sizeScopes),
    })),
    orderedSizeCodes,
  );
  const operationById = new Map(product.operations.map((row) => [row.operationId, row]));

  return {
    materials: {
      create: expandedMaterials.map((row, index) => {
        const source = materialById.get(row.materialId)!;
        const sizeConsumption = sizeConsumptionFromNorms(source.sizeNorms);
        const waste = Number(
          row.waste ?? source.wastePercent ?? source.material.defaultWastePercent,
        );
        const consumption = bakeOversizeConsumption(
          row.consumption,
          row.sizeCode,
          sizeConsumption,
        );
        const metersNeeded = fabricMetersNeeded({
          consumptionPerUnit: consumption,
          wastePercent: waste,
          quantitiesBySize,
          sizeCode: row.sizeCode,
          sizeConsumption,
          sizeMaterialCoeffs: materialCoeffsBySize(
            Object.keys(quantitiesBySize),
            sizeRules,
          ),
        });
        const offers = source.material.supplierOffers ?? [];
        const offer = pickSupplierOffer(offers, source.supplierId);
        const supplierId = offer?.supplierId ?? source.supplierId ?? null;
        const supplierNameSnapshot =
          (source.supplierId && source.supplierId === supplierId
            ? source.supplier?.nameUk
            : null) ??
          offer?.supplier?.nameUk ??
          null;
        const deliveryType = deliveryTypeOrNull(
          source.deliveryType ?? offer?.deliveryType ?? null,
        );
        return {
          materialId: source.materialId,
          nameSnapshot: source.material.nameUk,
          unitCodeSnapshot: source.material.unitOfMeasure.code,
          consumptionPerUnit: consumption,
          wastePercent: waste,
          purchasePrice: resolveBomMaterialPurchasePrice({
            material: source.material,
            offers,
            supplierId,
            companyCostMode,
            metersNeeded,
          }),
          supplierId,
          supplierNameSnapshot,
          colorSnapshot: source.colorSnapshot ?? null,
          deliveryType,
          sortOrder: index,
          sizeCode: row.sizeCode,
        };
      }),
    },
    operations: {
      create: expandedOperations.map((row, index) => {
        const source = operationById.get(row.operationId)!;
        const fallbackRate =
          source.rateOverride != null
            ? Number(source.rateOverride)
            : source.operation.baseRate != null
              ? Number(source.operation.baseRate)
              : 0;
        let unitRate = fallbackRate;
        if (isCutOperationName(source.operation.nameUk)) {
          unitRate = resolveCutUnitRateForProduct(product, totalQuantity, fallbackRate);
        } else if (source.operation.calculationMethod === "QUANTITY_TIER") {
          unitRate = resolveQuantityTierRate({
            quantity: totalQuantity,
            tiers: pickOperationQuantityTiers(source.rateTiers, source.operation.rateTiers),
            fallbackRate,
          });
        }
        return {
          operationId: source.operationId,
          nameSnapshot: source.operation.nameUk,
          calculationMethod: source.operation.calculationMethod,
          unitRate,
          shiftCost: source.operation.shiftCost,
          standardOutput: source.standardOverride ?? source.operation.standardOutputPerShift,
          sortOrder: index,
          sizeCode: row.sizeCode,
        };
      }),
    },
    decorations: {
      // Branding is added only on the order (шовкотрафарет / інші методи), not from product BOM.
      create: [],
    },
    additionalCosts: {
      create: product.additionalCosts.map((row) => ({
        nameUk: row.nameUk,
        amount: row.amount,
        isPerUnit: row.isPerUnit,
      })),
    },
  };
}

function assertOrderEditable(status: OrderStatus) {
  if (status === "HANDED_TO_PRODUCTION" || status === "CLOSED" || status === "CANCELLED") {
    throw new Error("ORDER_LOCKED");
  }
}

async function assertOrderItemEditable(orderItemId: string) {
  const item = await prisma.orderItem.findUnique({
    where: { id: orderItemId },
    select: { order: { select: { status: true } } },
  });
  if (!item) throw new Error("NOT_FOUND");
  assertOrderEditable(item.order.status);
}

async function assertOrderEditableById(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  assertOrderEditable(order.status);
}

async function assertOrderItemMaterialEditable(materialRowId: string) {
  const row = await prisma.orderItemMaterial.findUnique({
    where: { id: materialRowId },
    select: { orderItem: { select: { order: { select: { status: true } } } } },
  });
  if (!row) throw new Error("NOT_FOUND");
  assertOrderEditable(row.orderItem.order.status);
}

async function assertOrderItemOperationEditable(operationRowId: string) {
  const row = await prisma.orderItemOperation.findUnique({
    where: { id: operationRowId },
    select: { orderItem: { select: { order: { select: { status: true } } } } },
  });
  if (!row) throw new Error("NOT_FOUND");
  assertOrderEditable(row.orderItem.order.status);
}

async function assertOrderItemDecorationEditable(decorationRowId: string) {
  const row = await prisma.orderItemDecoration.findUnique({
    where: { id: decorationRowId },
    select: { orderItem: { select: { order: { select: { status: true } } } } },
  });
  if (!row) throw new Error("NOT_FOUND");
  assertOrderEditable(row.orderItem.order.status);
}

export async function createOrderWithProduct(input: {
  clientId: string;
  managerId: string;
  productId: string;
  title?: string | null;
  deadline?: Date | null;
  sizeQuantities: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
  comment?: string | null;
}) {
  return createOrderWithProducts({
    clientId: input.clientId,
    managerId: input.managerId,
    title: input.title,
    deadline: input.deadline,
    items: [
      {
        productId: input.productId,
        sizeQuantities: input.sizeQuantities,
        comment: input.comment,
      },
    ],
  });
}

export async function createOrderWithProducts(input: {
  clientId: string;
  managerId: string;
  title?: string | null;
  deadline?: Date | null;
  targetMarginPercent?: number | null;
  items: Array<{
    productId: string;
    sizeQuantities: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
    comment?: string | null;
    composition?: {
      materials: Array<{
        materialId: string;
        consumptionPerUnit: number;
        wastePercent?: number | null;
        sizeCode?: string | null;
        sizeCodes?: string[] | null;
        sizeConsumption?: Record<string, number>;
        sizeWaste?: Record<string, number>;
        purchasePrice?: number | null;
        supplierId?: string | null;
        deliveryType?: "CARGO" | "NP_STANDARD" | "NP_VOLUME" | null;
        colorSnapshot?: string | null;
        cargoUsdPerKg?: number | null;
        usdUahRate?: number | null;
        fabricDeliveryManual?: boolean;
        fabricDeliveryAmount?: number | null;
      }>;
      operations: Array<{
        operationId: string;
        sizeCode?: string | null;
        sizeCodes?: string[] | null;
      }>;
      decorations: Array<{
        decorationMethodId: string;
        setupCost?: number | null;
        unitRate?: number | null;
      }>;
    };
  }>;
}) {
  if (input.items.length === 0) throw new Error("ITEMS_REQUIRED");

  const products = await Promise.all(input.items.map((item) => getProduct(item.productId)));
  if (products.some((product) => !product)) throw new Error("PRODUCT_NOT_FOUND");
  for (const product of products) {
    assertProductOrderable(product);
  }

  const [fabricGlobals, pricingDefaults] = await Promise.all([
    getFabricPricingGlobals(),
    getPricingDefaults(),
  ]);
  const companyCostMode = fabricGlobals.materialCostVatMode;
  const sizeRules = pricingDefaults.sizeRules;

  const number = await nextOrderNumber();
  const primaryName = products[0]!.nameUk;

  const result = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        number,
        clientId: input.clientId,
        managerId: input.managerId,
        title: input.title || primaryName,
        status: "DRAFT",
        deadline: input.deadline ?? null,
        comment: input.items[0]?.comment || null,
        targetMarginPercent:
          input.targetMarginPercent != null && Number.isFinite(input.targetMarginPercent)
            ? input.targetMarginPercent
            : null,
      },
    });

    const createdItems = [];
    for (let i = 0; i < input.items.length; i++) {
      const line = input.items[i];
      const product = products[i]!;
      const totalQuantity = line.sizeQuantities.reduce((s, x) => s + x.quantity, 0);
      const override = line.composition;

      let materialsCreate;
      let operationsCreate;
      let decorationsCreate;

      const orderedSizeCodes = line.sizeQuantities
        .filter((row) => row.quantity > 0)
        .map((row) => row.sizeCode);
      const quantitiesBySize = Object.fromEntries(
        line.sizeQuantities.map((row) => [row.sizeCode, row.quantity]),
      );

      if (override) {
        const materialIds = override.materials.map((row) => row.materialId);
        const operationIds = override.operations.map((row) => row.operationId);
        const decorationIds = override.decorations.map((row) => row.decorationMethodId);

        const [materials, operations, decorations] = await Promise.all([
          materialIds.length
            ? tx.material.findMany({
                where: { id: { in: materialIds } },
                include: {
                  unitOfMeasure: true,
                  supplierOffers: {
                    include: { supplier: true },
                    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
                  },
                },
              })
            : Promise.resolve([]),
          operationIds.length
            ? tx.operation.findMany({
                where: { id: { in: operationIds } },
                include: { rateTiers: { orderBy: { minQuantity: "asc" } } },
              })
            : Promise.resolve([]),
          decorationIds.length
            ? tx.decorationMethod.findMany({ where: { id: { in: decorationIds } } })
            : Promise.resolve([]),
        ]);

        const materialById = new Map(materials.map((row) => [row.id, row]));
        const operationById = new Map(operations.map((row) => [row.id, row]));
        const decorationById = new Map(decorations.map((row) => [row.id, row]));
        const productMaterialById = new Map(
          product.materials.map((row) => [row.materialId, row]),
        );
        const supplierIds = [
          ...new Set(
            [
              ...override.materials.map((row) => row.supplierId),
              ...product.materials.map((row) => row.supplierId),
            ].filter((id): id is string => Boolean(id)),
          ),
        ];
        const supplierNameById = new Map(
          supplierIds.length
            ? (
                await tx.supplier.findMany({
                  where: { id: { in: supplierIds } },
                  select: { id: true, nameUk: true },
                })
              ).map((row) => [row.id, row.nameUk] as const)
            : [],
        );

        const expandedMaterials = expandMaterialsForSizes(
          override.materials.map((row) => ({
            materialId: row.materialId,
            consumption: row.consumptionPerUnit,
            waste: row.wastePercent,
            sizeCodes: row.sizeCode ? [row.sizeCode] : row.sizeCodes,
            sizeConsumption: row.sizeConsumption,
            sizeWaste: row.sizeWaste,
          })),
          orderedSizeCodes,
        );

        materialsCreate = expandedMaterials
          .map((row, index) => {
            const material = materialById.get(row.materialId);
            if (!material) return null;
            const waste = row.waste ?? Number(material.defaultWastePercent);
            const draftSource = override.materials.find((m) => m.materialId === row.materialId);
            const productMat = productMaterialById.get(row.materialId);
            const offers = material.supplierOffers ?? [];
            const preferredSupplierId =
              draftSource?.supplierId ?? productMat?.supplierId ?? null;
            const offer = pickSupplierOffer(offers, preferredSupplierId);
            const supplierId = offer?.supplierId ?? preferredSupplierId ?? null;
            const deliveryType = deliveryTypeOrNull(
              draftSource?.deliveryType ??
                productMat?.deliveryType ??
                offer?.deliveryType ??
                null,
            );
            const colorSnapshot =
              draftSource?.colorSnapshot?.trim() ||
              productMat?.colorSnapshot?.trim() ||
              null;
            const supplierNameSnapshot = supplierId
              ? supplierNameById.get(supplierId) ??
                offer?.supplier?.nameUk ??
                (productMat?.supplierId === supplierId
                  ? productMat.supplier?.nameUk ?? null
                  : null)
              : null;
            const sizeConsumption = draftSource?.sizeConsumption ?? {};
            const consumption =
              row.sizeCode && isOversizeCode(row.sizeCode) && sizeConsumption[row.sizeCode] == null
                ? effectiveOversizeConsumption(
                    row.consumption,
                    resolveSizeCoeffs(row.sizeCode, sizeRules).materialCoeff,
                  )
                : row.consumption;
            const metersNeeded = fabricMetersNeeded({
              consumptionPerUnit: consumption,
              wastePercent: waste,
              quantitiesBySize,
              sizeCode: row.sizeCode,
              sizeConsumption,
              sizeMaterialCoeffs: materialCoeffsBySize(
                Object.keys(quantitiesBySize),
                sizeRules,
              ),
            });
            const draftPrice = draftSource?.purchasePrice;
            const purchasePrice =
              draftPrice != null && Number.isFinite(Number(draftPrice))
                ? Number(draftPrice)
                : resolveBomMaterialPurchasePrice({
                    material,
                    offers,
                    supplierId,
                    companyCostMode,
                    metersNeeded,
                  });
            return {
              materialId: material.id,
              nameSnapshot: material.nameUk,
              unitCodeSnapshot: material.unitOfMeasure.code,
              consumptionPerUnit: consumption,
              wastePercent: waste,
              purchasePrice,
              supplierId,
              supplierNameSnapshot,
              deliveryType,
              colorSnapshot,
              cargoUsdPerKg:
                draftSource?.cargoUsdPerKg != null && Number.isFinite(Number(draftSource.cargoUsdPerKg))
                  ? Number(draftSource.cargoUsdPerKg)
                  : null,
              usdUahRate:
                draftSource?.usdUahRate != null && Number.isFinite(Number(draftSource.usdUahRate))
                  ? Number(draftSource.usdUahRate)
                  : null,
              fabricDeliveryManual: Boolean(draftSource?.fabricDeliveryManual),
              fabricDeliveryAmount:
                draftSource?.fabricDeliveryManual &&
                draftSource.fabricDeliveryAmount != null &&
                Number.isFinite(Number(draftSource.fabricDeliveryAmount))
                  ? Number(draftSource.fabricDeliveryAmount)
                  : 0,
              fabricDeliveryComputed: 0,
              sortOrder: index,
              sizeCode: row.sizeCode,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row));

        const expandedOperations = expandOperationsForSizes(
          override.operations.map((row) => ({
            operationId: row.operationId,
            sizeCodes: row.sizeCode ? [row.sizeCode] : row.sizeCodes,
          })),
          orderedSizeCodes,
        );

        operationsCreate = expandedOperations
          .map((row, index) => {
            const operation = operationById.get(row.operationId);
            if (!operation) return null;
            const productOp = product.operations.find((line) => line.operationId === row.operationId);
            const fallbackRate =
              productOp?.rateOverride != null
                ? Number(productOp.rateOverride)
                : operation.baseRate != null
                  ? Number(operation.baseRate)
                  : 0;
            let unitRate = fallbackRate;
            if (isCutOperationName(operation.nameUk)) {
              unitRate = resolveCutUnitRateForProduct(product, totalQuantity, fallbackRate);
            } else if (operation.calculationMethod === "QUANTITY_TIER") {
              unitRate = resolveQuantityTierRate({
                quantity: totalQuantity,
                tiers: pickOperationQuantityTiers(
                  productOp?.rateTiers,
                  operation.rateTiers,
                ),
                fallbackRate,
              });
            }
            return {
              operationId: operation.id,
              nameSnapshot: operation.nameUk,
              calculationMethod: operation.calculationMethod,
              unitRate,
              shiftCost: operation.shiftCost,
              standardOutput: operation.standardOutputPerShift,
              sortOrder: index,
              sizeCode: row.sizeCode,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row));

        decorationsCreate = override.decorations
          .map((row, index) => {
            const decoration = decorationById.get(row.decorationMethodId);
            if (!decoration) return null;
            const setup =
              row.setupCost != null && Number.isFinite(Number(row.setupCost))
                ? Number(row.setupCost)
                : Number(decoration.setupCost);
            const unit =
              row.unitRate != null && Number.isFinite(Number(row.unitRate))
                ? Number(row.unitRate)
                : Number(decoration.unitRate);
            return {
              decorationMethodId: decoration.id,
              nameSnapshot: decoration.nameUk,
              setupCost: setup,
              unitRate: unit,
              sortOrder: index,
            };
          })
          .filter((row): row is NonNullable<typeof row> => Boolean(row));
      } else {
        const bom = bomFromProduct(
          product,
          orderedSizeCodes,
          totalQuantity,
          quantitiesBySize,
          companyCostMode,
          sizeRules,
        );
        materialsCreate = bom.materials.create;
        operationsCreate = bom.operations.create;
        decorationsCreate = bom.decorations.create;
      }

      const item = await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          sourceProductId: product.id,
          nameUk: product.nameUk,
          totalQuantity,
          comment: line.comment || null,
          sizes: {
            create: line.sizeQuantities
              .filter((s) => s.quantity > 0)
              .map((s) => ({
                sizeCode: s.sizeCode,
                sizeNameUk: s.sizeNameUk,
                quantity: s.quantity,
              })),
          },
          materials: { create: materialsCreate },
          operations: { create: operationsCreate },
          decorations: { create: decorationsCreate },
          additionalCosts: {
            create: product.additionalCosts.map((row) => ({
              nameUk: row.nameUk,
              amount: row.amount,
              isPerUnit: row.isPerUnit,
            })),
          },
        },
      });
      createdItems.push(item);
      await syncOrderItemFabricPricing(item.id, tx);
    }

    return { order, item: createdItems[0], items: createdItems };
  });

  await recordActivity({
    entityType: "order",
    entityId: result.order.id,
    action: "created",
    userId: input.managerId,
    payload: {
      number: result.order.number,
      clientId: input.clientId,
      itemCount: result.items.length,
    },
  });

  return result;
}

export async function addOrderItemFromProduct(input: {
  orderId: string;
  productId: string;
  sizeQuantities: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
  userId?: string;
}) {
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    select: { id: true, status: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  assertOrderEditable(order.status);

  const product = await getProduct(input.productId);
  assertProductOrderable(product);

  const sizeQuantities = input.sizeQuantities.filter((row) => row.quantity > 0);
  const totalQuantity = sizeQuantities.reduce((sum, row) => sum + row.quantity, 0);
  if (totalQuantity <= 0) throw new Error("QUANTITY_REQUIRED");

  const [fabricGlobals, pricingDefaults] = await Promise.all([
    getFabricPricingGlobals(),
    getPricingDefaults(),
  ]);
  const companyCostMode = fabricGlobals.materialCostVatMode;

  const reopen = order.status === "APPROVED" || order.status === "PENDING_APPROVAL";
  const quantitiesBySize = Object.fromEntries(
    sizeQuantities.map((row) => [row.sizeCode, row.quantity]),
  );
  const bom = bomFromProduct(
    product,
    sizeQuantities.map((row) => row.sizeCode),
    totalQuantity,
    quantitiesBySize,
    companyCostMode,
    pricingDefaults.sizeRules,
  );

  const item = await prisma.$transaction(async (tx) => {
    const created = await tx.orderItem.create({
      data: {
        orderId: order.id,
        productId: product.id,
        sourceProductId: product.id,
        nameUk: product.nameUk,
        totalQuantity,
        sizes: {
          create: sizeQuantities.map((row) => ({
            sizeCode: row.sizeCode,
            sizeNameUk: row.sizeNameUk,
            quantity: row.quantity,
          })),
        },
        ...bom,
      },
    });

    if (reopen) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "CALCULATION", approvedDate: null },
      });
    }

    return created;
  });

  await recordActivity({
    entityType: "order",
    entityId: order.id,
    action: "updated",
    userId: input.userId ?? null,
    payload: { addedItem: product.nameUk, itemId: item.id },
  });

  if (reopen) {
    await recordActivity({
      entityType: "order",
      entityId: order.id,
      action: "status_changed",
      userId: input.userId ?? null,
      payload: {
        from: order.status,
        to: "CALCULATION",
        fromLabel: orderStatusLabel[order.status] ?? order.status,
        toLabel: orderStatusLabel.CALCULATION,
      },
    });
  }

  return item;
}

const STAGES_ALLOWING_EMPTY: OrderStatus[] = ["DRAFT", "CALCULATION"];

export async function removeOrderItem(input: { orderItemId: string; userId?: string }) {
  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: {
      id: true,
      nameUk: true,
      orderId: true,
      superseded: true,
      _count: { select: { versions: true } },
      order: {
        select: {
          status: true,
          items: { where: { superseded: false }, select: { id: true } },
        },
      },
    },
  });
  if (!item || item.superseded) throw new Error("NOT_FOUND");
  assertOrderEditable(item.order.status);
  const workingCount = item.order.items.length;
  // Empty order is allowed only on draft / calculation.
  if (workingCount <= 1 && !STAGES_ALLOWING_EMPTY.includes(item.order.status)) {
    throw new Error("EMPTY_ORDER_NOT_ALLOWED");
  }

  await prisma.$transaction(async (tx) => {
    if (item._count.versions > 0) {
      // Keep the row for proposal history; hide from the working composition.
      await tx.orderItem.update({
        where: { id: item.id },
        data: { superseded: true },
      });
      return;
    }
    await tx.quotation.deleteMany({
      where: { calculationVersion: { orderItemId: item.id } },
    });
    await tx.productionSpecification.deleteMany({ where: { orderItemId: item.id } });
    await tx.orderItem.delete({ where: { id: item.id } });
  });

  await recordActivity({
    entityType: "order",
    entityId: item.orderId,
    action: "updated",
    userId: input.userId ?? null,
    payload: { removedItem: item.nameUk, itemId: item.id },
  });

  return { orderId: item.orderId };
}

async function syncCutRatesForOrderItem(
  orderItemId: string,
  totalQuantity: number,
  tx: Prisma.TransactionClient = prisma,
) {
  const item = await tx.orderItem.findUnique({
    where: { id: orderItemId },
    include: {
      operations: true,
      product: {
        select: {
          optimalQty: true,
          cutRateTiers: { orderBy: { minQuantity: "asc" } },
          operations: {
            select: {
              operationId: true,
              rateTiers: { orderBy: { minQuantity: "asc" } },
              operation: {
                select: {
                  calculationMethod: true,
                  rateTiers: { orderBy: { minQuantity: "asc" } },
                },
              },
            },
          },
        },
      },
    },
  });
  if (!item?.product) return;

  const quantityTiers = quantityTiersByOperationIdFromProduct(item.product);

  for (const operation of item.operations) {
    if (isCutOperationName(operation.nameSnapshot) && item.product.cutRateTiers.length) {
      const rate = resolveCutUnitRateForProduct(
        item.product,
        totalQuantity,
        Number(operation.unitRate ?? 0),
      );
      if (Math.abs(Number(operation.unitRate ?? 0) - rate) > 0.0001) {
        await tx.orderItemOperation.update({
          where: { id: operation.id },
          data: { unitRate: rate },
        });
      }
      continue;
    }

    if (
      operation.calculationMethod === "QUANTITY_TIER" &&
      operation.operationId &&
      quantityTiers[operation.operationId]?.length
    ) {
      const rate = resolveQuantityTierRate({
        quantity: totalQuantity,
        tiers: quantityTiers[operation.operationId]!,
        fallbackRate: Number(operation.unitRate ?? 0),
      });
      if (Math.abs(Number(operation.unitRate ?? 0) - rate) > 0.0001) {
        await tx.orderItemOperation.update({
          where: { id: operation.id },
          data: { unitRate: rate },
        });
      }
    }
  }
}

/** Refresh format-matrix decoration unitRates when order-item tirage changes. */
async function syncDecorationFormatRatesForOrderItem(
  orderItemId: string,
  totalQuantity: number,
  tx: Prisma.TransactionClient = prisma,
) {
  const decorations = await tx.orderItemDecoration.findMany({
    where: {
      orderItemId,
      decorationFormatId: { not: null },
    },
    include: {
      decorationFormat: {
        include: { tiers: { orderBy: { minQuantity: "asc" } } },
      },
    },
  });

  for (const row of decorations) {
    const format = row.decorationFormat;
    if (!format) continue;
    const tiers = mapDecorationFormatTiers(format.tiers);
    if (tiers.length === 0) continue;
    const unitRate = resolveDecorationFormatRate({
      quantity: totalQuantity,
      tiers,
      fallbackRate: Number(row.unitRate ?? 0),
    });
    const nameSnapshot = decorationFormatLineName(format.nameUk);
    const rateChanged = Math.abs(Number(row.unitRate ?? 0) - unitRate) > 0.0001;
    const nameChanged = row.nameSnapshot !== nameSnapshot;
    if (!rateChanged && !nameChanged) continue;
    await tx.orderItemDecoration.update({
      where: { id: row.id },
      data: {
        unitRate,
        ...(nameChanged ? { nameSnapshot } : {}),
      },
    });
  }
}

async function syncOrderItemFabricPrices(
  orderItemId: string,
  tx: Prisma.TransactionClient = prisma,
  sizeRules?: SizeCoeffRule[] | null,
) {
  const [item, fabricGlobals, pricing] = await Promise.all([
    tx.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        sizes: true,
        materials: {
          include: {
            material: true,
          },
        },
      },
    }),
    getFabricPricingGlobals(),
    sizeRules == null ? getPricingDefaults() : Promise.resolve(null),
  ]);
  if (!item) return;

  const rules = sizeRules ?? pricing?.sizeRules ?? null;
  const quantitiesBySize = Object.fromEntries(
    item.sizes.map((row) => [row.sizeCode, row.quantity]),
  );
  const sizeMaterialCoeffs = materialCoeffsBySize(Object.keys(quantitiesBySize), rules);

  for (const row of item.materials) {
    if (!row.material || row.material.type !== "FABRIC") continue;
    const offer = await supplierOfferForLine(row.materialId, row.supplierId, tx);
    const metersNeeded = fabricMetersNeeded({
      consumptionPerUnit: Number(row.consumptionPerUnit),
      wastePercent: Number(row.wastePercent),
      quantitiesBySize,
      sizeCode: row.sizeCode,
      sizeMaterialCoeffs,
    });
    const fields = orderLineFabricFields(row, row.material, offer);
    const nextPrice = purchasePriceForOrderMaterial(
      fields,
      fabricGlobals.materialCostVatMode,
      metersNeeded,
      numField(row.minWholesaleMetersOverride),
    );
    if (Number(row.purchasePrice) === nextPrice) continue;
    await tx.orderItemMaterial.update({
      where: { id: row.id },
      data: { purchasePrice: nextPrice },
    });
  }
}

async function syncOrderItemFabricDelivery(
  orderItemId: string,
  tx: Prisma.TransactionClient = prisma,
  sizeRules?: SizeCoeffRule[] | null,
) {
  const [item, fabricGlobals, pricing] = await Promise.all([
    tx.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        sizes: true,
        materials: { include: { material: true } },
      },
    }),
    getFabricPricingGlobals(),
    sizeRules == null ? getPricingDefaults() : Promise.resolve(null),
  ]);
  if (!item) return;

  const rules = sizeRules ?? pricing?.sizeRules ?? null;
  const quantitiesBySize = Object.fromEntries(
    item.sizes.map((row) => [row.sizeCode, row.quantity]),
  );

  let totalComputed = 0;
  let totalAmount = 0;

  for (const row of item.materials) {
    if (!row.material || row.material.type !== "FABRIC") continue;
    const offer = await supplierOfferForLine(row.materialId, row.supplierId, tx);
    const source = fabricDeliverySourceForLine({ row, material: row.material, offer });
    const computed = computeFabricDeliveryLine(
      source,
      quantitiesBySize,
      fabricGlobals,
      rules,
    );
    const amount = row.fabricDeliveryManual
      ? Number(row.fabricDeliveryAmount)
      : computed;
    totalComputed += computed;
    totalAmount += amount;

    if (
      Number(row.fabricDeliveryComputed ?? -1) === computed &&
      Number(row.fabricDeliveryAmount) === amount
    ) {
      continue;
    }

    await tx.orderItemMaterial.update({
      where: { id: row.id },
      data: {
        fabricDeliveryComputed: computed,
        fabricDeliveryAmount: amount,
      },
    });
  }

  totalComputed = Math.round(totalComputed * 10) / 10;
  totalAmount = Math.round(totalAmount * 10) / 10;

  const itemAmount = item.fabricDeliveryManual
    ? Number(item.fabricDeliveryAmount)
    : totalAmount;

  if (
    Number(item.fabricDeliveryComputed ?? -1) === totalComputed &&
    Number(item.fabricDeliveryAmount) === itemAmount
  ) {
    return;
  }

  await tx.orderItem.update({
    where: { id: orderItemId },
    data: {
      fabricDeliveryComputed: totalComputed,
      fabricDeliveryAmount: itemAmount,
    },
  });
}

export async function updateOrderItemFabricDelivery(
  orderItemId: string,
  input: { amount: number; manual: boolean },
) {
  await assertOrderItemEditable(orderItemId);
  await prisma.orderItem.update({
    where: { id: orderItemId },
    data: {
      fabricDeliveryAmount: Math.max(0, input.amount),
      fabricDeliveryManual: input.manual,
    },
  });
  if (!input.manual) {
    await syncOrderItemFabricDelivery(orderItemId);
  }
}

/** Override company sewer count for PV coefficient on this order line only. Null = company default. */
export async function updateOrderItemSewerCountOverride(
  orderItemId: string,
  sewerCountOverride: number | null,
) {
  await assertOrderItemEditable(orderItemId);
  if (sewerCountOverride != null && (!(sewerCountOverride > 0) || !Number.isFinite(sewerCountOverride))) {
    throw new Error("VALIDATION");
  }
  await prisma.orderItem.update({
    where: { id: orderItemId },
    data: {
      sewerCountOverride:
        sewerCountOverride == null ? null : Math.floor(sewerCountOverride),
    },
  });
}

export async function getOrderItemMaterialDetail(orderItemMaterialId: string) {
  const row = await prisma.orderItemMaterial.findUnique({
    where: { id: orderItemMaterialId },
    include: {
      material: true,
      orderItem: { include: { sizes: true } },
    },
  });
  if (!row) return null;

  if (!row.material || row.material.type !== "FABRIC") {
    const quantitiesBySize = Object.fromEntries(
      row.orderItem.sizes.map((size) => [size.sizeCode, size.quantity]),
    );
    const totalQuantity = row.orderItem.sizes.reduce((sum, size) => sum + size.quantity, 0);
    const supplierRows = row.materialId
      ? await prisma.materialSupplier.findMany({
          where: { materialId: row.materialId },
          include: { supplier: true },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
        })
      : [];
    const consumption = Number(row.consumptionPerUnit);
    const waste = Number(row.wastePercent);
    const unitsNeeded =
      Math.round(consumption * (1 + waste / 100) * totalQuantity * 10000) / 10000;
    const unitsPerPack = row.material?.unitsPerPack ?? null;
    const selectedOffer =
      row.supplierId
        ? supplierRows.find((offer) => offer.supplierId === row.supplierId) ?? null
        : supplierRows.find((offer) => offer.isPrimary) ?? null;
    // Offer wins: if supplier quote is «each» (no pack price), do not fall back to
    // material.purchasePackPrice — that wrongly treats м/шт quotes as pack=0.
    const offerHasPack =
      selectedOffer != null && selectedOffer.purchasePackPrice != null;
    const purchasePackPrice = offerHasPack
      ? Number(selectedOffer.purchasePackPrice)
      : selectedOffer == null && row.material?.purchasePackPrice != null
        ? Number(row.material.purchasePackPrice)
        : null;
    const packDeliveryCostUah = offerHasPack
      ? selectedOffer.packDeliveryCostUah != null
        ? Number(selectedOffer.packDeliveryCostUah)
        : null
      : selectedOffer == null && row.material?.packDeliveryCostUah != null
        ? Number(row.material.packDeliveryCostUah)
        : null;
    const purchasePrice = deriveTrimUnitPriceFromSupplier({
      unitsPerPack,
      purchasePackPrice,
      packDeliveryCostUah,
      fallbackUnitPrice:
        selectedOffer?.priceMeterUahNoVat != null
          ? Number(selectedOffer.priceMeterUahNoVat)
          : Number(row.purchasePrice),
    });
    const packs = packsToOrder(unitsNeeded, unitsPerPack);
    const packSpend = hasTrimPackQuote({
      unitsPerPack,
      purchasePackPrice,
      packDeliveryCostUah,
    })
      ? trimPackSpend({ packs, purchasePackPrice, packDeliveryCostUah })
      : null;
    const materialPartyCost =
      Math.round(purchasePrice * consumption * (1 + waste / 100) * totalQuantity * 100) / 100;

    return {
      id: row.id,
      orderId: row.orderItem.orderId,
      orderItemId: row.orderItemId,
      name: row.nameSnapshot,
      unit: row.unitCodeSnapshot,
      consumption,
      waste,
      sizeCode: row.sizeCode,
      totalQuantity,
      quantitiesBySize,
      isFabric: false,
      materialId: row.materialId,
      purchasePrice,
      colorSnapshot: row.colorSnapshot,
      supplierId: row.supplierId,
      materialAvailableColors: row.material?.availableColors ?? [],
      deliveryType: row.deliveryType ?? selectedOffer?.deliveryType ?? null,
      offers: supplierRows.map((offer) => {
        const rates = {
          deliveryType: offer.deliveryType,
          cargoUsdPerKg:
            offer.cargoUsdPerKg != null ? Number(offer.cargoUsdPerKg) : null,
          npStandardUsdPerKg:
            offer.npStandardUsdPerKg != null ? Number(offer.npStandardUsdPerKg) : null,
          npVolumeUsdPerKg:
            offer.npVolumeUsdPerKg != null ? Number(offer.npVolumeUsdPerKg) : null,
        };
        const deliveryOptions = trimConfiguredDeliveryOptions(rates);
        return {
          offerId: offer.id,
          supplierId: offer.supplierId,
          supplierName: offer.supplier.nameUk,
          isPrimary: offer.isPrimary,
          availableColors: offer.availableColors ?? [],
          deliveryType: offer.deliveryType,
          deliveryOptions,
          purchasePackPrice:
            offer.purchasePackPrice != null ? Number(offer.purchasePackPrice) : null,
          packDeliveryCostUah:
            offer.packDeliveryCostUah != null ? Number(offer.packDeliveryCostUah) : null,
          purchasePricePerUnit: deriveTrimUnitPriceFromSupplier({
            unitsPerPack,
            purchasePackPrice:
              offer.purchasePackPrice != null ? Number(offer.purchasePackPrice) : null,
            packDeliveryCostUah:
              offer.packDeliveryCostUah != null ? Number(offer.packDeliveryCostUah) : null,
            fallbackUnitPrice:
              offer.priceMeterUahNoVat != null ? Number(offer.priceMeterUahNoVat) : 0,
          }),
        };
      }),
      materialPartyCost,
      unitsNeeded,
      unitsPerPack,
      purchasePackPrice,
      packDeliveryCostUah,
      packsToOrder: packs,
      packGoodsCost: packSpend?.goods ?? null,
      packDeliveryCost: packSpend?.delivery ?? null,
      packOrderTotal: packSpend?.total ?? null,
    };
  }

  const [globals, pricing] = await Promise.all([
    getFabricPricingGlobals(),
    getPricingDefaults(),
  ]);
  const quantitiesBySize = Object.fromEntries(
    row.orderItem.sizes.map((size) => [size.sizeCode, size.quantity]),
  );
  const totalQuantity = row.orderItem.sizes.reduce((sum, size) => sum + size.quantity, 0);
  const isFabric = row.material.type === "FABRIC";
  const costVatOverride = row.costVatOverride ?? row.material.costVatOverride ?? null;
  const sizeRules = pricing.sizeRules;

  const supplierRows =
    row.materialId && isFabric
      ? await prisma.materialSupplier.findMany({
          where: { materialId: row.materialId },
          include: { supplier: true },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
        })
      : [];

  const offers = supplierRows.map((offer) => {
    const preview = previewFabricLineTerms({
      row,
      material: row.material!,
      offer,
      quantitiesBySize,
      globals,
      sizeRules,
      costVatOverride,
    });
    const deliveryOptions = configuredSupplierDeliveryOptions({
      deliveryType: offer.deliveryType,
      cargoUsdPerKg: numField(offer.cargoUsdPerKg),
      npStandardUsdPerKg: numField(offer.npStandardUsdPerKg),
      npVolumeUsdPerKg: numField(offer.npVolumeUsdPerKg),
    });
    return {
      offerId: offer.id,
      supplierId: offer.supplierId,
      supplierName: offer.supplier.nameUk,
      isPrimary: offer.isPrimary,
      availableColors: offer.availableColors ?? [],
      deliveryType: offer.deliveryType,
      deliveryOptions,
      ...preview,
    };
  });

  const catalogPreview =
    isFabric
      ? previewFabricLineTerms({
          row,
          material: row.material,
          offer: null,
          quantitiesBySize,
          globals,
          sizeRules,
          costVatOverride,
          cargoOverride: numField(row.cargoUsdPerKg),
          usdUahRateOverride: numField(row.usdUahRate),
        })
      : null;

  const selectedOffer =
    row.supplierId && row.materialId
      ? supplierRows.find((offer) => offer.supplierId === row.supplierId) ?? null
      : supplierRows.find((offer) => offer.isPrimary) ?? null;

  const activePreview =
    isFabric
      ? previewFabricLineTerms({
          row,
          material: row.material,
          offer: selectedOffer,
          quantitiesBySize,
          globals,
          sizeRules,
          costVatOverride,
          cargoOverride: numField(row.cargoUsdPerKg),
          usdUahRateOverride: numField(row.usdUahRate),
        })
      : null;

  return {
    id: row.id,
    orderId: row.orderItem.orderId,
    orderItemId: row.orderItemId,
    name: row.nameSnapshot,
    unit: row.unitCodeSnapshot,
    consumption: Number(row.consumptionPerUnit),
    waste: Number(row.wastePercent),
    sizeCode: row.sizeCode,
    totalQuantity,
    quantitiesBySize,
    isFabric,
    materialId: row.materialId,
    supplierId: row.supplierId,
    colorSnapshot: row.colorSnapshot,
    materialAvailableColors: row.material.availableColors ?? [],
    supplierName:
      row.supplierNameSnapshot ??
      (selectedOffer ? selectedOffer.supplier.nameUk : row.material.supplierCode ?? null),
    costVatOverride,
    companyCostVatMode: globals.materialCostVatMode,
    purchasePrice: Number(row.purchasePrice),
    purchasePricePerMeter: activePreview?.purchasePricePerMeter ?? Number(row.purchasePrice),
    pricingMode: activePreview?.pricingMode ?? "standard",
    pricingModeLabel: activePreview?.pricingModeLabel ?? "",
    priceMeterUahNoVat: activePreview?.priceMeterUahNoVat ?? null,
    priceMeterUahVat: activePreview?.priceMeterUahVat ?? null,
    materialPartyCost: activePreview?.materialPartyCost ?? 0,
    cargoUsdPerKg:
      numField(row.cargoUsdPerKg) ??
      activePreview?.cargoUsdPerKg ??
      deliveryRateUsdPerKg(row.material.deliveryType, globals),
    deliveryType:
      row.deliveryType ??
      selectedOffer?.deliveryType ??
      row.material.deliveryType ??
      null,
    deliveryOptions:
      (offers.find((o) => o.supplierId === (row.supplierId ?? selectedOffer?.supplierId))
        ?.deliveryOptions as
        | Array<{ type: string; rateUsdPerKg: number; label: string }>
        | undefined) ??
      (selectedOffer
        ? configuredSupplierDeliveryOptions({
            deliveryType: selectedOffer.deliveryType,
            cargoUsdPerKg: numField(selectedOffer.cargoUsdPerKg),
            npStandardUsdPerKg: numField(selectedOffer.npStandardUsdPerKg),
            npVolumeUsdPerKg: numField(selectedOffer.npVolumeUsdPerKg),
          })
        : []),
    fabricDeliveryAmount: Number(row.fabricDeliveryAmount),
    fabricDeliveryComputed: Number(
      row.fabricDeliveryComputed ?? activePreview?.deliveryAmount ?? 0,
    ),
    fabricDeliveryManual: row.fabricDeliveryManual,
    metersNeeded: activePreview?.metersNeeded ?? 0,
    kgNeeded: activePreview?.kgNeeded ?? null,
    metersPerKg: activePreview?.metersPerKg ?? numField(row.material.metersPerKg),
    hasCutPrice: Boolean(activePreview?.hasCutPrice),
    hasWholesalePrice: Boolean(activePreview?.hasWholesalePrice),
    minWholesaleMeters: activePreview?.minWholesaleMeters ?? null,
    catalogMinWholesaleMeters: activePreview?.catalogMinWholesaleMeters ?? null,
    minWholesaleMetersOverride: activePreview?.minWholesaleMetersOverride ?? null,
    wholesaleNote:
      (selectedOffer?.wholesaleNote as string | null | undefined) ??
      row.material.wholesaleNote ??
      null,
    priceKgUsd: activePreview?.priceKgUsd ?? numField(row.material.priceKgUsd),
    usdUahRate:
      numField(row.usdUahRate) ??
      activePreview?.usdUahRate ??
      globals.usdUahRate,
    defaultUsdUahRate: globals.usdUahRate,
    defaultCargoUsdPerKg: deliveryRateUsdPerKg(row.material.deliveryType, globals),
    offers,
    catalogPreview,
  };
}

export async function updateOrderItemMaterialTerms(input: {
  id: string;
  supplierId?: string | null;
  colorSnapshot?: string | null;
  deliveryType?: string | null;
  cargoUsdPerKg?: number | null;
  usdUahRate?: number | null;
  costVatOverride?: MaterialCostVatMode | null;
  consumptionPerUnit?: number;
  wastePercent?: number;
  fabricDeliveryAmount?: number;
  fabricDeliveryManual?: boolean;
  minWholesaleMetersOverride?: number | null;
}) {
  await assertOrderItemMaterialEditable(input.id);
  const row = await prisma.orderItemMaterial.findUniqueOrThrow({
    where: { id: input.id },
    include: { material: true, orderItem: { include: { sizes: true } } },
  });

  const supplierId =
    input.supplierId !== undefined ? input.supplierId : row.supplierId;
  const offer =
    supplierId && row.materialId
      ? await supplierOfferForLine(row.materialId, supplierId)
      : null;

  const supplierNameSnapshot =
    input.supplierId === null
      ? null
      : offer?.supplier.nameUk ?? row.supplierNameSnapshot;

  let colorSnapshot =
    input.colorSnapshot !== undefined ? input.colorSnapshot : row.colorSnapshot;
  if (input.supplierId !== undefined || input.colorSnapshot !== undefined) {
    const { reconcileColorForSupplier } = await import("@/lib/supplier-colors");
    const offerRows =
      row.materialId
        ? await prisma.materialSupplier.findMany({
            where: { materialId: row.materialId },
            orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          })
        : [];
    colorSnapshot = reconcileColorForSupplier({
      color: colorSnapshot,
      supplierId,
      offers: offerRows.map((item) => ({
        supplierId: item.supplierId,
        isPrimary: item.isPrimary,
        availableColors: item.availableColors,
      })),
      materialFallback: row.material?.availableColors ?? [],
    });
  }

  const costVatOverride =
    input.costVatOverride !== undefined ? input.costVatOverride : row.costVatOverride;

  const cargoUsdPerKg =
    input.cargoUsdPerKg !== undefined
      ? input.cargoUsdPerKg
      : input.deliveryType !== undefined
        ? null
        : numField(row.cargoUsdPerKg);

  const deliveryType =
    input.deliveryType !== undefined
      ? input.deliveryType
        ? normalizeFabricDeliveryType(input.deliveryType)
        : null
      : row.deliveryType;

  const usdUahRate =
    input.usdUahRate !== undefined ? input.usdUahRate : numField(row.usdUahRate);

  const consumptionPerUnit =
    input.consumptionPerUnit !== undefined
      ? input.consumptionPerUnit
      : Number(row.consumptionPerUnit);
  const wastePercent =
    input.wastePercent !== undefined ? input.wastePercent : Number(row.wastePercent);

  const minWholesaleMetersOverride =
    input.minWholesaleMetersOverride !== undefined
      ? input.minWholesaleMetersOverride
      : numField(row.minWholesaleMetersOverride);

  const [globals, pricing] = await Promise.all([
    getFabricPricingGlobals(),
    getPricingDefaults(),
  ]);
  const quantitiesBySize = Object.fromEntries(
    row.orderItem.sizes.map((size) => [size.sizeCode, size.quantity]),
  );

  const previewRow = {
    ...row,
    consumptionPerUnit,
    wastePercent,
    costVatOverride,
    deliveryType,
    cargoUsdPerKg,
    usdUahRate,
    minWholesaleMetersOverride,
  };

  const preview =
    row.material?.type === "FABRIC"
      ? previewFabricLineTerms({
          row: previewRow,
          material: row.material,
          offer,
          quantitiesBySize,
          globals,
          sizeRules: pricing.sizeRules,
          costVatOverride,
          cargoOverride: cargoUsdPerKg,
          usdUahRateOverride: usdUahRate,
          minWholesaleMetersOverride,
        })
      : null;

  const trimPurchasePrice =
    row.material && row.material.type !== "FABRIC" && offer
      ? deriveTrimUnitPriceFromSupplier({
          unitsPerPack: row.material.unitsPerPack,
          purchasePackPrice: numField(offer.purchasePackPrice),
          deliveryRates: {
            deliveryType: deliveryType ?? offer.deliveryType,
            cargoUsdPerKg: numField(offer.cargoUsdPerKg),
            npStandardUsdPerKg: numField(offer.npStandardUsdPerKg),
            npVolumeUsdPerKg: numField(offer.npVolumeUsdPerKg),
          },
          packDeliveryCostUah: numField(offer.packDeliveryCostUah),
          fallbackUnitPrice:
            numField(offer.priceMeterUahNoVat) ?? Number(row.purchasePrice),
        })
      : null;

  const fabricDeliveryManual = input.fabricDeliveryManual ?? row.fabricDeliveryManual;
  const fabricDeliveryAmount = fabricDeliveryManual
    ? Math.max(0, input.fabricDeliveryAmount ?? Number(row.fabricDeliveryAmount))
    : preview?.deliveryAmount ?? 0;

  await prisma.orderItemMaterial.update({
    where: { id: row.id },
    data: {
      supplierId,
      supplierNameSnapshot,
      colorSnapshot,
      deliveryType,
      cargoUsdPerKg,
      usdUahRate,
      costVatOverride,
      consumptionPerUnit,
      wastePercent,
      minWholesaleMetersOverride,
      purchasePrice:
        preview?.purchasePricePerMeter ??
        trimPurchasePrice ??
        (offer?.priceMeterUahNoVat != null
          ? Number(offer.priceMeterUahNoVat)
          : Number(row.purchasePrice)),
      fabricDeliveryComputed: preview?.deliveryAmount ?? 0,
      fabricDeliveryAmount,
      fabricDeliveryManual,
    },
  });

  await prisma.orderItem.update({
    where: { id: row.orderItemId },
    data: { fabricDeliveryManual: false },
  });

  await syncOrderItemFabricPricing(row.orderItemId);
}

async function syncOrderItemFabricPricing(
  orderItemId: string,
  tx: Prisma.TransactionClient = prisma,
) {
  const pricing = await getPricingDefaults();
  await syncOrderItemFabricPrices(orderItemId, tx, pricing.sizeRules);
  await syncOrderItemFabricDelivery(orderItemId, tx, pricing.sizeRules);
}

/** Recompute fabric prices and per-line delivery (e.g. after schema migration). */
export async function refreshOrderItemFabricPricing(orderItemId: string) {
  await syncOrderItemFabricPricing(orderItemId);
}

export async function updateOrderItemSizes(
  orderItemId: string,
  sizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>,
) {
  await assertOrderItemEditable(orderItemId);
  const totalQuantity = sizes.reduce((s, x) => s + x.quantity, 0);
  await prisma.$transaction(async (tx) => {
    await tx.orderItemSize.deleteMany({ where: { orderItemId } });
    await tx.orderItemSize.createMany({
      data: sizes
        .filter((s) => s.quantity > 0)
        .map((s) => ({
          orderItemId,
          sizeCode: s.sizeCode,
          sizeNameUk: s.sizeNameUk,
          quantity: s.quantity,
        })),
    });
    await tx.orderItem.update({
      where: { id: orderItemId },
      data: { totalQuantity },
    });
    await syncCutRatesForOrderItem(orderItemId, totalQuantity, tx);
    await syncDecorationFormatRatesForOrderItem(orderItemId, totalQuantity, tx);
    await syncOrderItemFabricPricing(orderItemId, tx);
  });
}

export type OrderItemSizeReadiness = {
  orderItemId: string;
  nameUk: string;
  needsBreakdown: boolean;
  ready: boolean;
  targetTirage: number;
  brokenDownQty: number;
};

/** Load size-breakdown readiness for every line on the order. */
export async function getOrderSizeBreakdownStatus(
  orderId: string,
): Promise<OrderItemSizeReadiness[]> {
  const items = await prisma.orderItem.findMany({
    where: { orderId, superseded: false },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      nameUk: true,
      totalQuantity: true,
      sizes: { select: { sizeCode: true, sizeNameUk: true, quantity: true } },
      product: { select: { _count: { select: { sizes: true } } } },
    },
  });

  return items.map((item) => {
    const catalogHasSizes = (item.product?._count.sizes ?? 0) > 0;
    const sizes: OrderSizeLine[] = item.sizes;
    const needsBreakdown = itemNeedsSizeBreakdown(sizes, { catalogHasSizes });
    const brokenDownQty = sizes
      .filter((row) => isRealSizeCode(row.sizeCode))
      .reduce((sum, row) => sum + row.quantity, 0);
    return {
      orderItemId: item.id,
      nameUk: item.nameUk,
      needsBreakdown,
      ready: itemSizeBreakdownReady(sizes, item.totalQuantity, { catalogHasSizes }),
      targetTirage: item.totalQuantity,
      brokenDownQty,
    };
  });
}

/** Throws SIZES_REQUIRED when any line still needs a size breakdown before production. */
export async function assertOrderSizesReady(orderId: string) {
  const status = await getOrderSizeBreakdownStatus(orderId);
  const blocked = status.filter((row) => !row.ready);
  if (blocked.length > 0) {
    throw new Error("SIZES_REQUIRED");
  }
}

/**
 * Replace orientative ONE tirage with a real size grid.
 * Sum of quantities must equal the current OrderItem.totalQuantity.
 */
export async function applyOrderItemSizeBreakdown(
  orderItemId: string,
  sizes: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>,
) {
  await assertOrderItemEditable(orderItemId);
  const item = await prisma.orderItem.findUniqueOrThrow({
    where: { id: orderItemId },
    select: {
      id: true,
      totalQuantity: true,
      product: { select: { _count: { select: { sizes: true } } } },
    },
  });

  const targetTirage = item.totalQuantity;
  const cleaned = sizes
    .map((row) => ({
      sizeCode: row.sizeCode.trim(),
      sizeNameUk: (row.sizeNameUk || row.sizeCode).trim(),
      quantity: Number.isFinite(row.quantity) ? Math.max(0, Math.floor(row.quantity)) : 0,
    }))
    .filter((row) => row.quantity > 0 && isRealSizeCode(row.sizeCode));

  // Deduplicate by sizeCode (mix of charts → one row per code).
  const byCode = new Map<string, { sizeCode: string; sizeNameUk: string; quantity: number }>();
  for (const row of cleaned) {
    const prev = byCode.get(row.sizeCode);
    if (prev) {
      prev.quantity += row.quantity;
    } else {
      byCode.set(row.sizeCode, { ...row });
    }
  }
  const nextSizes = [...byCode.values()];
  const sum = sizesQuantitySum(nextSizes);

  if (nextSizes.length === 0) {
    throw new Error("SIZES_EMPTY");
  }
  if (sum !== targetTirage) {
    throw new Error("SIZES_SUM_MISMATCH");
  }

  await prisma.$transaction(async (tx) => {
    await tx.orderItemSize.deleteMany({ where: { orderItemId } });
    await tx.orderItemSize.createMany({
      data: nextSizes.map((row) => ({
        orderItemId,
        sizeCode: row.sizeCode,
        sizeNameUk: row.sizeNameUk,
        quantity: row.quantity,
      })),
    });
    await tx.orderItem.update({
      where: { id: orderItemId },
      data: { totalQuantity: targetTirage },
    });
    await syncCutRatesForOrderItem(orderItemId, targetTirage, tx);
    await syncDecorationFormatRatesForOrderItem(orderItemId, targetTirage, tx);
    await syncOrderItemFabricPricing(orderItemId, tx);
  });

  return { targetTirage, sizes: nextSizes };
}

export async function setOrderItemMaterialActualPrice(input: {
  id: string;
  actualPurchasePrice: number | null;
}) {
  await assertOrderItemMaterialEditable(input.id);
  return prisma.orderItemMaterial.update({
    where: { id: input.id },
    data: {
      actualPurchasePrice:
        input.actualPurchasePrice == null || !Number.isFinite(input.actualPurchasePrice)
          ? null
          : Math.max(0, input.actualPurchasePrice),
    },
  });
}

export async function addOrderItemMaterial(input: {
  orderItemId: string;
  materialId: string;
  consumptionPerUnit: number;
  wastePercent?: number | null;
  sizeCode?: string | null;
}) {
  await assertOrderItemEditable(input.orderItemId);
  const [material, item, fabricGlobals] = await Promise.all([
    prisma.material.findUniqueOrThrow({
      where: { id: input.materialId },
      include: {
        unitOfMeasure: true,
        supplierOffers: {
          include: { supplier: true },
          orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
        },
      },
    }),
    prisma.orderItem.findUniqueOrThrow({
      where: { id: input.orderItemId },
      include: { sizes: true },
    }),
    getFabricPricingGlobals(),
  ]);
  const maxSort = await prisma.orderItemMaterial.aggregate({
    where: { orderItemId: input.orderItemId },
    _max: { sortOrder: true },
  });

  const quantitiesBySize = Object.fromEntries(
    item.sizes.map((row) => [row.sizeCode, row.quantity]),
  );
  const waste = Number(input.wastePercent ?? material.defaultWastePercent);
  const pricingDefaults = await getPricingDefaults();
  const metersNeeded = fabricMetersNeeded({
    consumptionPerUnit: input.consumptionPerUnit,
    wastePercent: waste,
    quantitiesBySize,
    sizeCode: input.sizeCode || null,
    sizeMaterialCoeffs: materialCoeffsBySize(
      Object.keys(quantitiesBySize),
      pricingDefaults.sizeRules,
    ),
  });
  const offers = material.supplierOffers ?? [];
  const offer = pickSupplierOffer(offers, null);
  const supplierId = offer?.supplierId ?? null;

  const created = await prisma.orderItemMaterial.create({
    data: {
      orderItemId: input.orderItemId,
      materialId: material.id,
      nameSnapshot: material.nameUk,
      unitCodeSnapshot: material.unitOfMeasure.code,
      consumptionPerUnit: input.consumptionPerUnit,
      wastePercent: waste,
      purchasePrice: resolveBomMaterialPurchasePrice({
        material,
        offers,
        supplierId,
        companyCostMode: fabricGlobals.materialCostVatMode,
        metersNeeded,
      }),
      supplierId,
      supplierNameSnapshot: offer?.supplier?.nameUk ?? null,
      deliveryType: deliveryTypeOrNull(
        offer?.deliveryType ?? material.deliveryType ?? null,
      ),
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      sizeCode: input.sizeCode || null,
    },
  });
  await syncOrderItemFabricPricing(input.orderItemId);
  return created;
}

export async function setOrderItemMaterialConsumption(input: {
  id: string;
  consumptionPerUnit: number;
  sizeCode?: string | null;
}) {
  await assertOrderItemMaterialEditable(input.id);
  const row = await prisma.orderItemMaterial.findUniqueOrThrow({
    where: { id: input.id },
    include: { orderItem: { include: { sizes: true } } },
  });

  if (!input.sizeCode || row.sizeCode === input.sizeCode) {
    await prisma.orderItemMaterial.update({
      where: { id: row.id },
      data: { consumptionPerUnit: input.consumptionPerUnit },
    });
    await syncOrderItemFabricPricing(row.orderItemId);
    return;
  }

  if (row.sizeCode == null) {
    const sizes = row.orderItem.sizes.filter((size) => size.quantity > 0);
    const others = sizes.filter((size) => size.sizeCode !== input.sizeCode);
    await prisma.$transaction([
      prisma.orderItemMaterial.update({
        where: { id: row.id },
        data: { sizeCode: input.sizeCode, consumptionPerUnit: input.consumptionPerUnit },
      }),
      ...others.map((size, index) =>
        prisma.orderItemMaterial.create({
          data: {
            orderItemId: row.orderItemId,
            materialId: row.materialId,
            nameSnapshot: row.nameSnapshot,
            unitCodeSnapshot: row.unitCodeSnapshot,
            consumptionPerUnit: row.consumptionPerUnit,
            wastePercent: row.wastePercent,
            purchasePrice: row.purchasePrice,
            supplierId: row.supplierId,
            supplierNameSnapshot: row.supplierNameSnapshot,
            colorSnapshot: row.colorSnapshot,
            deliveryType: row.deliveryType,
            sortOrder: row.sortOrder + index + 1,
            sizeCode: size.sizeCode,
          },
        }),
      ),
    ]);
    await syncOrderItemFabricPricing(row.orderItemId);
    return;
  }

  await prisma.orderItemMaterial.update({
    where: { id: row.id },
    data: { consumptionPerUnit: input.consumptionPerUnit },
  });
  await syncOrderItemFabricPricing(row.orderItemId);
}

export async function removeOrderItemMaterial(id: string, sizeCode?: string | null) {
  await assertOrderItemMaterialEditable(id);
  const row = await prisma.orderItemMaterial.findUnique({
    where: { id },
    include: { orderItem: { include: { sizes: true } } },
  });
  if (!row) return;

  const orderItemId = row.orderItemId;

  if (!sizeCode || row.sizeCode === sizeCode) {
    await prisma.orderItemMaterial.delete({ where: { id: row.id } });
    await syncOrderItemFabricPricing(orderItemId);
    return;
  }

  if (row.sizeCode == null) {
    const sizes = row.orderItem.sizes.filter((size) => size.quantity > 0);
    const keep = sizes.filter((size) => size.sizeCode !== sizeCode);
    if (keep.length === 0) {
      await prisma.orderItemMaterial.delete({ where: { id: row.id } });
      await syncOrderItemFabricPricing(orderItemId);
      return;
    }
    await prisma.$transaction([
      prisma.orderItemMaterial.delete({ where: { id: row.id } }),
      ...keep.map((size, index) =>
        prisma.orderItemMaterial.create({
          data: {
            orderItemId: row.orderItemId,
            materialId: row.materialId,
            nameSnapshot: row.nameSnapshot,
            unitCodeSnapshot: row.unitCodeSnapshot,
            consumptionPerUnit: row.consumptionPerUnit,
            wastePercent: row.wastePercent,
            purchasePrice: row.purchasePrice,
            supplierId: row.supplierId,
            supplierNameSnapshot: row.supplierNameSnapshot,
            colorSnapshot: row.colorSnapshot,
            deliveryType: row.deliveryType,
            sortOrder: row.sortOrder + index,
            sizeCode: size.sizeCode,
          },
        }),
      ),
    ]);
    await syncOrderItemFabricPricing(orderItemId);
    return;
  }

  await prisma.orderItemMaterial.delete({ where: { id: row.id } });
  await syncOrderItemFabricPricing(orderItemId);
}

export async function addOrderItemOperation(input: {
  orderItemId: string;
  operationId: string;
  sizeCode?: string | null;
}) {
  await assertOrderItemEditable(input.orderItemId);
  const [operation, item, maxSort] = await Promise.all([
    prisma.operation.findUniqueOrThrow({
      where: { id: input.operationId },
      include: { rateTiers: { orderBy: { minQuantity: "asc" } } },
    }),
    prisma.orderItem.findUniqueOrThrow({
      where: { id: input.orderItemId },
      select: {
        totalQuantity: true,
        product: {
          select: {
            optimalQty: true,
            cutRateTiers: { orderBy: { minQuantity: "asc" } },
            operations: {
              where: { operationId: input.operationId },
              select: {
                operationId: true,
                rateTiers: { orderBy: { minQuantity: "asc" } },
                operation: {
                  select: {
                    calculationMethod: true,
                    rateTiers: { orderBy: { minQuantity: "asc" } },
                  },
                },
              },
            },
          },
        },
      },
    }),
    prisma.orderItemOperation.aggregate({
      where: { orderItemId: input.orderItemId },
      _max: { sortOrder: true },
    }),
  ]);

  const fallbackRate = operation.baseRate != null ? Number(operation.baseRate) : 0;
  let unitRate = fallbackRate;
  if (item.product && isCutOperationName(operation.nameUk)) {
    unitRate = resolveCutUnitRateForProduct(item.product, item.totalQuantity, fallbackRate);
  } else if (operation.calculationMethod === "QUANTITY_TIER") {
    const productOp = item.product?.operations[0];
    unitRate = resolveQuantityTierRate({
      quantity: item.totalQuantity,
      tiers: pickOperationQuantityTiers(productOp?.rateTiers, operation.rateTiers),
      fallbackRate,
    });
  }

  return prisma.orderItemOperation.create({
    data: {
      orderItemId: input.orderItemId,
      operationId: operation.id,
      nameSnapshot: operation.nameUk,
      calculationMethod: operation.calculationMethod,
      unitRate,
      shiftCost: operation.shiftCost,
      standardOutput: operation.standardOutputPerShift,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
      sizeCode: input.sizeCode || null,
    },
  });
}

export async function removeOrderItemOperation(id: string, sizeCode?: string | null) {
  await assertOrderItemOperationEditable(id);
  const row = await prisma.orderItemOperation.findUnique({
    where: { id },
    include: { orderItem: { include: { sizes: true } } },
  });
  if (!row) return;
  if (!sizeCode || row.sizeCode === sizeCode) {
    return prisma.orderItemOperation.delete({ where: { id: row.id } });
  }
  if (row.sizeCode == null) {
    const keep = row.orderItem.sizes.filter((size) => size.quantity > 0 && size.sizeCode !== sizeCode);
    if (keep.length === 0) {
      return prisma.orderItemOperation.delete({ where: { id: row.id } });
    }
    await prisma.$transaction([
      prisma.orderItemOperation.delete({ where: { id: row.id } }),
      ...keep.map((size, index) =>
        prisma.orderItemOperation.create({
          data: {
            orderItemId: row.orderItemId,
            operationId: row.operationId,
            nameSnapshot: row.nameSnapshot,
            calculationMethod: row.calculationMethod,
            unitRate: row.unitRate,
            shiftCost: row.shiftCost,
            standardOutput: row.standardOutput,
            sortOrder: row.sortOrder + index,
            sizeCode: size.sizeCode,
          },
        }),
      ),
    ]);
    return;
  }
  return prisma.orderItemOperation.delete({ where: { id: row.id } });
}

export async function copyOrderItemSizeSpec(input: {
  orderItemId: string;
  fromSizeCode: string;
  toSizeCodes: string[];
}) {
  await assertOrderItemEditable(input.orderItemId);
  const item = await prisma.orderItem.findUniqueOrThrow({
    where: { id: input.orderItemId },
    include: { materials: true, operations: true, sizes: true },
  });
  const targets = input.toSizeCodes.filter((code) => code !== input.fromSizeCode);
  if (targets.length === 0) return;

  const materialApplies = (row: (typeof item.materials)[number], sizeCode: string) =>
    row.sizeCode == null || row.sizeCode === sizeCode;
  const operationApplies = (row: (typeof item.operations)[number], sizeCode: string) =>
    row.sizeCode == null || row.sizeCode === sizeCode;

  await prisma.$transaction(async (tx) => {
    for (const material of item.materials) {
      if (!materialApplies(material, input.fromSizeCode)) continue;
      const specific = item.materials.find(
        (row) =>
          (row.materialId ?? row.nameSnapshot) === (material.materialId ?? material.nameSnapshot) &&
          row.sizeCode === input.fromSizeCode,
      );
      const source = specific ?? material;
      for (const sizeCode of targets) {
        const existing = item.materials.find(
          (row) =>
            (row.materialId ?? row.nameSnapshot) === (source.materialId ?? source.nameSnapshot) &&
            row.sizeCode === sizeCode,
        );
        if (existing) {
          await tx.orderItemMaterial.update({
            where: { id: existing.id },
            data: { consumptionPerUnit: source.consumptionPerUnit },
          });
          continue;
        }
        if (source.sizeCode == null) {
          continue;
        }
        await tx.orderItemMaterial.create({
          data: {
            orderItemId: item.id,
            materialId: source.materialId,
            nameSnapshot: source.nameSnapshot,
            unitCodeSnapshot: source.unitCodeSnapshot,
            consumptionPerUnit: source.consumptionPerUnit,
            wastePercent: source.wastePercent,
            purchasePrice: source.purchasePrice,
            supplierId: source.supplierId,
            supplierNameSnapshot: source.supplierNameSnapshot,
            colorSnapshot: source.colorSnapshot,
            deliveryType: source.deliveryType,
            sortOrder: source.sortOrder,
            sizeCode,
          },
        });
      }
    }

    for (const operation of item.operations) {
      if (!operationApplies(operation, input.fromSizeCode) || operation.sizeCode == null) continue;
      for (const sizeCode of targets) {
        const existing = item.operations.find(
          (row) =>
            (row.operationId ?? row.nameSnapshot) === (operation.operationId ?? operation.nameSnapshot) &&
            row.sizeCode === sizeCode,
        );
        if (existing) continue;
        await tx.orderItemOperation.create({
          data: {
            orderItemId: item.id,
            operationId: operation.operationId,
            nameSnapshot: operation.nameSnapshot,
            calculationMethod: operation.calculationMethod,
            unitRate: operation.unitRate,
            shiftCost: operation.shiftCost,
            standardOutput: operation.standardOutput,
            sortOrder: operation.sortOrder,
            sizeCode,
          },
        });
      }
    }
  });
}

export async function addOrderItemDecoration(input: {
  orderItemId: string;
  decorationMethodId: string;
}) {
  await assertOrderItemEditable(input.orderItemId);
  const method = await prisma.decorationMethod.findUniqueOrThrow({
    where: { id: input.decorationMethodId },
  });
  const maxSort = await prisma.orderItemDecoration.aggregate({
    where: { orderItemId: input.orderItemId },
    _max: { sortOrder: true },
  });

  return prisma.orderItemDecoration.create({
    data: {
      orderItemId: input.orderItemId,
      decorationMethodId: method.id,
      nameSnapshot: method.nameUk,
      setupCost: method.setupCost,
      unitRate: method.unitRate,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

/** Snapshot a calculated branding line (e.g. format matrix / silk-screen) onto the order item. */
export async function addOrderItemDecorationWithRates(input: {
  orderItemId: string;
  nameUk: string;
  setupCost: number;
  unitRate: number;
  decorationMethodId?: string | null;
  decorationFormatId?: string | null;
}) {
  await assertOrderItemEditable(input.orderItemId);
  const nameUk = input.nameUk.trim();
  if (!nameUk) throw new Error("VALIDATION");
  const setupCost = Math.max(0, Number(input.setupCost) || 0);
  const unitRate = Math.max(0, Number(input.unitRate) || 0);
  const maxSort = await prisma.orderItemDecoration.aggregate({
    where: { orderItemId: input.orderItemId },
    _max: { sortOrder: true },
  });

  return prisma.orderItemDecoration.create({
    data: {
      orderItemId: input.orderItemId,
      decorationMethodId: input.decorationMethodId ?? null,
      decorationFormatId: input.decorationFormatId ?? null,
      nameSnapshot: nameUk,
      setupCost,
      unitRate,
      sortOrder: (maxSort._max.sortOrder ?? -1) + 1,
    },
  });
}

export async function removeOrderItemDecoration(id: string) {
  await assertOrderItemDecorationEditable(id);
  return prisma.orderItemDecoration.delete({ where: { id } });
}

export async function updateOrderItemDecoration(input: {
  id: string;
  setupCost?: number;
  unitRate?: number;
  nameUk?: string;
}) {
  await assertOrderItemDecorationEditable(input.id);
  const nameUk = input.nameUk?.trim();
  return prisma.orderItemDecoration.update({
    where: { id: input.id },
    data: {
      ...(nameUk ? { nameSnapshot: nameUk } : {}),
      ...(input.setupCost != null ? { setupCost: Math.max(0, input.setupCost) } : {}),
      ...(input.unitRate != null ? { unitRate: Math.max(0, input.unitRate) } : {}),
    },
  });
}

/** Find the silk-screen branding line on an order item (name starts with method label). */
export async function findOrderItemScreenPrintDecoration(orderItemId: string) {
  const rows = await prisma.orderItemDecoration.findMany({
    where: { orderItemId },
    orderBy: { sortOrder: "asc" },
  });
  return rows.find((row) => isScreenPrintDecorationName(row.nameSnapshot)) ?? null;
}

export async function saveCalculationVersion(input: {
  orderItemId: string;
  authorId: string;
  label?: string | null;
  comment?: string | null;
  proposalRevision?: number | null;
  proposalLabel?: string | null;
  snapshot: Prisma.InputJsonValue;
  totals: {
    costPerUnit: number;
    totalCost: number;
    sellingPricePerUnit: number;
    totalSellingValue: number;
    profitAmount: number;
    marginPercent: number;
  };
}) {
  await assertOrderItemEditable(input.orderItemId);
  const last = await prisma.calculationVersion.findFirst({
    where: { orderItemId: input.orderItemId },
    orderBy: { versionNumber: "desc" },
    select: { versionNumber: true },
  });

  const version = await prisma.calculationVersion.create({
    data: {
      orderItemId: input.orderItemId,
      versionNumber: (last?.versionNumber ?? 0) + 1,
      label: input.label || null,
      comment: input.comment || null,
      proposalRevision: input.proposalRevision ?? null,
      proposalLabel: input.proposalLabel ?? null,
      snapshotJson: input.snapshot,
      costPerUnit: input.totals.costPerUnit,
      totalCost: input.totals.totalCost,
      sellingPricePerUnit: input.totals.sellingPricePerUnit,
      totalSellingValue: input.totals.totalSellingValue,
      profitAmount: input.totals.profitAmount,
      marginPercent: input.totals.marginPercent,
      authorId: input.authorId,
    },
  });

  const order = await prisma.order.findFirst({
    where: { items: { some: { id: input.orderItemId } } },
    select: { id: true, status: true },
  });

  await prisma.order.updateMany({
    where: { items: { some: { id: input.orderItemId } }, status: "DRAFT" },
    data: { status: "CALCULATION" },
  });

  if (order) {
    await recordActivity({
      entityType: "order",
      entityId: order.id,
      action: "version_saved",
      userId: input.authorId,
      payload: {
        versionNumber: version.versionNumber,
        label: version.label,
        sellingPricePerUnit: input.totals.sellingPricePerUnit,
      },
    });
  }

  return version;
}

export async function approveVersion(versionId: string, userId?: string) {
  const version = await prisma.calculationVersion.findUniqueOrThrow({
    where: { id: versionId },
  });

  if (version.isApproved) return version;

  const approved = await prisma.$transaction(async (tx) => {
    await tx.calculationVersion.updateMany({
      where: { orderItemId: version.orderItemId, isApproved: true },
      data: { isApproved: false },
    });

    const next = await tx.calculationVersion.update({
      where: { id: versionId },
      data: { isApproved: true },
    });

    const line = await tx.orderItem.findUniqueOrThrow({
      where: { id: version.orderItemId },
      select: { orderId: true },
    });
    const order = await tx.order.findUniqueOrThrow({
      where: { id: line.orderId },
      select: { status: true },
    });

    const locked =
      order.status === "HANDED_TO_PRODUCTION" ||
      order.status === "CLOSED" ||
      order.status === "CANCELLED";

    if (!locked) {
      const siblings = await tx.orderItem.findMany({
        where: { orderId: line.orderId },
        select: {
          id: true,
          versions: { where: { isApproved: true }, select: { id: true }, take: 1 },
        },
      });
      const allApproved = siblings.every((row) =>
        row.id === version.orderItemId ? true : row.versions.length > 0,
      );
      await tx.order.update({
        where: { id: line.orderId },
        data: allApproved
          ? { status: "APPROVED", approvedDate: new Date() }
          : { status: "PENDING_APPROVAL" },
      });
    }

    return next;
  });

  const order = await prisma.order.findFirst({
    where: { items: { some: { id: version.orderItemId } } },
    select: { id: true },
  });
  if (order) {
    await recordActivity({
      entityType: "order",
      entityId: order.id,
      action: "version_approved",
      userId: userId ?? null,
      payload: { versionNumber: approved.versionNumber, versionId: approved.id },
    });
  }

  return approved;
}

async function nextProposalRevision(orderId: string) {
  const agg = await prisma.calculationVersion.aggregate({
    where: { orderItem: { orderId }, proposalRevision: { not: null } },
    _max: { proposalRevision: true },
  });
  return (agg._max.proposalRevision ?? 0) + 1;
}

function workingOrderItems<T extends { superseded?: boolean }>(items: T[]): T[] {
  return items.filter((item) => !item.superseded);
}

async function replaceOrderItemComposition(
  tx: Prisma.TransactionClient,
  orderItemId: string,
  snap: NonNullable<ReturnType<typeof parseProposalItemSnapshot>>,
) {
  await tx.orderItemSize.deleteMany({ where: { orderItemId } });
  await tx.orderItemMaterial.deleteMany({ where: { orderItemId } });
  await tx.orderItemOperation.deleteMany({ where: { orderItemId } });
  await tx.orderItemDecoration.deleteMany({ where: { orderItemId } });
  await tx.orderItemAdditionalCost.deleteMany({ where: { orderItemId } });

  await tx.orderItem.update({
    where: { id: orderItemId },
    data: {
      productId: snap.productId,
      sourceProductId: snap.sourceProductId,
      nameUk: snap.nameUk,
      totalQuantity: snap.totalQuantity,
      comment: snap.comment,
      sewerCountOverride: snap.sewerCountOverride,
      fabricDeliveryAmount: snap.fabricDeliveryAmount ?? 0,
      fabricDeliveryComputed: snap.fabricDeliveryComputed,
      fabricDeliveryManual: Boolean(snap.fabricDeliveryManual),
      superseded: false,
      sizes: { create: snap.sizes },
      materials: {
        create: snap.materials.map((row, index) => materialCreateFromSnapshot(row, index)),
      },
      operations: {
        create: snap.operations.map((row, index) => operationCreateFromSnapshot(row, index)),
      },
      decorations: {
        create: snap.decorations.map((row, index) => decorationCreateFromSnapshot(row, index)),
      },
      additionalCosts: {
        create: snap.additionalCosts.map((row) => additionalCostCreateFromSnapshot(row)),
      },
    },
  });
}

export async function saveProposal(input: {
  orderId: string;
  authorId: string;
  label?: string | null;
  comment?: string | null;
  lines: Array<{
    orderItemId: string;
    manualSellingPricePerUnit?: number | null;
    discountPercent?: number | null;
  }>;
}) {
  const order = await getOrder(input.orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status === "APPROVED") throw new Error("USE_NEW_PROPOSAL");
  assertOrderEditable(order.status);

  const proposalLabel = input.label?.trim() || null;
  const comment = input.comment?.trim() || null;
  const items = workingOrderItems(order.items);

  // Empty orders may be saved only on DRAFT / CALCULATION (no calc versions).
  if (items.length === 0) {
    if (!STAGES_ALLOWING_EMPTY.includes(order.status)) {
      throw new Error("EMPTY_ORDER_NOT_ALLOWED");
    }
    await prisma.order.updateMany({
      where: { id: input.orderId, status: "DRAFT" },
      data: { status: "CALCULATION", activeProposalRevision: null },
    });
    await recordActivity({
      entityType: "order",
      entityId: input.orderId,
      action: "proposal_saved",
      userId: input.authorId,
      payload: {
        proposalRevision: null,
        label: proposalLabel,
        comment,
        lineCount: 0,
        empty: true,
      },
    });
    return { proposalRevision: 0, versions: [] };
  }

  const lineMap = new Map(input.lines.map((line) => [line.orderItemId, line]));
  for (const item of items) {
    if (!lineMap.has(item.id)) throw new Error("MISSING_LINE");
    if (item.totalQuantity <= 0) throw new Error("NO_QUANTITY");
    if (item.materials.length === 0 || item.operations.length === 0) throw new Error("INCOMPLETE");
  }

  const proposalRevision = await nextProposalRevision(input.orderId);
  const pricing = await getPricingForOrder(input.orderId);
  const fixedCosts = await fixedCostOptionsFromDb();
  const fromStatus = order.status;

  const created = await prisma.$transaction(async (tx) => {
    const versions = [];
    for (const item of items) {
      const line = lineMap.get(item.id)!;
      const manualSellingPricePerUnit =
        line.manualSellingPricePerUnit != null && !Number.isNaN(line.manualSellingPricePerUnit)
          ? line.manualSellingPricePerUnit
          : null;
      const calcOptions = {
        ...calcOptionsFromProduct(item.product),
        fixedCosts,
      };
      const costCalc = buildCalcFromOrderItem(item, { ...pricing }, calcOptions);
      const fixedCostAllocation = fixedCosts
        ? resolveFixedCostAllocationForOrderItem(item, fixedCosts, calcOptions, pricing.sizeRules)
        : null;

      const commercial = commercialPriceForOrderItem(item, {
        discountPercent: line.discountPercent,
        fallbackPricePerUnit: manualSellingPricePerUnit ?? Number(costCalc.sellingPricePerUnit),
      });

      let sellingPricePerUnit: number;
      let totalSellingValue: number;
      let marginPercent: number;
      let profitAmount: number;

      if (manualSellingPricePerUnit != null) {
        sellingPricePerUnit = manualSellingPricePerUnit;
        totalSellingValue = manualSellingPricePerUnit * item.totalQuantity;
        profitAmount = totalSellingValue - Number(costCalc.totalCost);
        marginPercent =
          totalSellingValue > 0 ? (profitAmount / totalSellingValue) * 100 : 0;
      } else if (commercial?.fromPriceList) {
        const merged = mergeCommercialAndCost(commercial, costCalc, item.totalQuantity);
        sellingPricePerUnit = merged.sellingPricePerUnit;
        totalSellingValue = merged.totalSellingValue;
        marginPercent = merged.marginPercent;
        profitAmount = totalSellingValue - Number(costCalc.totalCost);
      } else {
        const draft = draftLineFromItem(item, costCalc, line.discountPercent);
        sellingPricePerUnit = draft.sellingPricePerUnit;
        totalSellingValue = draft.totalSellingValue;
        marginPercent = draft.marginPercent;
        profitAmount = totalSellingValue - Number(costCalc.totalCost);
      }

      const calc = {
        ...costCalc,
        sellingPricePerUnit: sellingPricePerUnit.toFixed(2),
        totalSellingValue: totalSellingValue.toFixed(2),
        marginPercent: marginPercent.toFixed(2),
        profitAmount: profitAmount.toFixed(2),
      };

      const last = await tx.calculationVersion.findFirst({
        where: { orderItemId: item.id },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });

      const version = await tx.calculationVersion.create({
        data: {
          orderItemId: item.id,
          versionNumber: (last?.versionNumber ?? 0) + 1,
          label: proposalLabel,
          comment,
          proposalRevision,
          proposalLabel,
          snapshotJson: {
            item: {
              productId: item.productId,
              sourceProductId: item.sourceProductId,
              nameUk: item.nameUk,
              totalQuantity: item.totalQuantity,
              comment: item.comment,
              sewerCountOverride: item.sewerCountOverride,
              fabricDeliveryAmount: Number(item.fabricDeliveryAmount),
              fabricDeliveryComputed:
                item.fabricDeliveryComputed == null
                  ? null
                  : Number(item.fabricDeliveryComputed),
              fabricDeliveryManual: item.fabricDeliveryManual,
              sizes: item.sizes,
              materials: item.materials,
              operations: item.operations,
              decorations: item.decorations,
              additionalCosts: item.additionalCosts,
            },
            calc,
            pricing,
            commercial: commercial ?? null,
            manualSellingPricePerUnit,
            proposalRevision,
            fixedCosts: fixedCostAllocation
              ? {
                  params: fixedCosts,
                  allocation: fixedCostAllocation,
                }
              : null,
          },
          costPerUnit: Number(costCalc.costPerUnit),
          totalCost: Number(costCalc.totalCost),
          sellingPricePerUnit,
          totalSellingValue,
          profitAmount,
          marginPercent,
          authorId: input.authorId,
        },
      });
      versions.push(version);
    }

    await tx.calculationVersion.updateMany({
      where: { orderItem: { orderId: input.orderId }, isApproved: true },
      data: { isApproved: false },
    });

    await tx.order.update({
      where: { id: input.orderId },
      data: {
        status: "PENDING_APPROVAL",
        approvedDate: null,
        activeProposalRevision: proposalRevision,
      },
    });

    return versions;
  });

  await recordActivity({
    entityType: "order",
    entityId: input.orderId,
    action: "proposal_saved",
    userId: input.authorId,
    payload: {
      proposalRevision,
      label: proposalLabel,
      lineCount: created.length,
    },
  });

  if (fromStatus !== "PENDING_APPROVAL") {
    await recordActivity({
      entityType: "order",
      entityId: input.orderId,
      action: "status_changed",
      userId: input.authorId,
      payload: {
        from: fromStatus,
        to: "PENDING_APPROVAL",
        fromLabel: orderStatusLabel[fromStatus] ?? fromStatus,
        toLabel: orderStatusLabel.PENDING_APPROVAL,
      },
    });
  }

  return { proposalRevision, versions: created };
}

/** From Погоджено → Розрахунок to edit a new commercial variant (same order). */
export async function startNewProposal(orderId: string, userId?: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { id: true, status: true },
  });
  if (!order) throw new Error("ORDER_NOT_FOUND");
  if (order.status !== "APPROVED") throw new Error("NOT_APPROVED");

  await prisma.$transaction(async (tx) => {
    await tx.calculationVersion.updateMany({
      where: { orderItem: { orderId }, isApproved: true },
      data: { isApproved: false },
    });
    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "CALCULATION",
        approvedDate: null,
        activeProposalRevision: null,
      },
    });
  });

  await recordActivity({
    entityType: "order",
    entityId: orderId,
    action: "status_changed",
    userId: userId ?? null,
    payload: {
      from: "APPROVED",
      to: "CALCULATION",
      fromLabel: orderStatusLabel.APPROVED,
      toLabel: orderStatusLabel.CALCULATION,
      reason: "new_proposal",
    },
  });

  return { orderId };
}

/** Load a saved proposal into live items and move order to Погодження. */
export async function activateProposal(
  orderId: string,
  proposalRevision: number,
  userId?: string,
) {
  const order = await getOrder(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  assertOrderEditable(order.status);

  if (order.activeProposalRevision === proposalRevision && order.status === "PENDING_APPROVAL") {
    return { orderId, proposalRevision };
  }

  const versions = await prisma.calculationVersion.findMany({
    where: { proposalRevision, orderItem: { orderId } },
    orderBy: { createdAt: "asc" },
  });
  if (versions.length === 0) throw new Error("PROPOSAL_NOT_FOUND");

  const snaps = versions.map((version) => ({
    version,
    snap: parseProposalItemSnapshot(version.snapshotJson),
  }));
  if (snaps.some((row) => !row.snap || !proposalSnapshotRestorable(row.version.snapshotJson))) {
    throw new Error("SNAPSHOT_INCOMPLETE");
  }

  const fromStatus = order.status;
  const keepIds = new Set(versions.map((version) => version.orderItemId));

  await prisma.$transaction(async (tx) => {
    const existing = await tx.orderItem.findMany({
      where: { orderId },
      select: { id: true, _count: { select: { versions: true } } },
    });
    const existingIds = new Set(existing.map((row) => row.id));

    for (const row of existing) {
      if (keepIds.has(row.id)) continue;
      if (row._count.versions > 0) {
        await tx.orderItem.update({
          where: { id: row.id },
          data: { superseded: true },
        });
      } else {
        await tx.quotation.deleteMany({
          where: { calculationVersion: { orderItemId: row.id } },
        });
        await tx.productionSpecification.deleteMany({ where: { orderItemId: row.id } });
        await tx.orderItem.delete({ where: { id: row.id } });
      }
    }

    for (const { version, snap } of snaps) {
      const itemSnap = snap!;
      if (existingIds.has(version.orderItemId)) {
        await replaceOrderItemComposition(tx, version.orderItemId, itemSnap);
        continue;
      }

      const created = await tx.orderItem.create({
        data: {
          orderId,
          productId: itemSnap.productId,
          sourceProductId: itemSnap.sourceProductId,
          nameUk: itemSnap.nameUk,
          totalQuantity: itemSnap.totalQuantity,
          comment: itemSnap.comment,
          sewerCountOverride: itemSnap.sewerCountOverride,
          fabricDeliveryAmount: itemSnap.fabricDeliveryAmount ?? 0,
          fabricDeliveryComputed: itemSnap.fabricDeliveryComputed,
          fabricDeliveryManual: Boolean(itemSnap.fabricDeliveryManual),
          superseded: false,
          sizes: { create: itemSnap.sizes },
          materials: {
            create: itemSnap.materials.map((row, index) =>
              materialCreateFromSnapshot(row, index),
            ),
          },
          operations: {
            create: itemSnap.operations.map((row, index) =>
              operationCreateFromSnapshot(row, index),
            ),
          },
          decorations: {
            create: itemSnap.decorations.map((row, index) =>
              decorationCreateFromSnapshot(row, index),
            ),
          },
          additionalCosts: {
            create: itemSnap.additionalCosts.map((row) =>
              additionalCostCreateFromSnapshot(row),
            ),
          },
        },
      });

      await tx.calculationVersion.update({
        where: { id: version.id },
        data: { orderItemId: created.id },
      });
    }

    await tx.calculationVersion.updateMany({
      where: { orderItem: { orderId }, isApproved: true },
      data: { isApproved: false },
    });

    await tx.order.update({
      where: { id: orderId },
      data: {
        status: "PENDING_APPROVAL",
        approvedDate: null,
        activeProposalRevision: proposalRevision,
      },
    });
  });

  await recordActivity({
    entityType: "order",
    entityId: orderId,
    action: "proposal_activated",
    userId: userId ?? null,
    payload: { proposalRevision },
  });

  if (fromStatus !== "PENDING_APPROVAL") {
    await recordActivity({
      entityType: "order",
      entityId: orderId,
      action: "status_changed",
      userId: userId ?? null,
      payload: {
        from: fromStatus,
        to: "PENDING_APPROVAL",
        fromLabel: orderStatusLabel[fromStatus] ?? fromStatus,
        toLabel: orderStatusLabel.PENDING_APPROVAL,
        reason: "activate_proposal",
      },
    });
  }

  return { orderId, proposalRevision };
}

export async function approveProposal(orderId: string, proposalRevision: number, userId?: string) {
  const order = await getOrder(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");

  const versions = await prisma.calculationVersion.findMany({
    where: {
      proposalRevision,
      orderItem: { orderId },
    },
  });

  const itemIds = new Set(workingOrderItems(order.items).map((item) => item.id));
  const covered = new Set(versions.map((version) => version.orderItemId));
  if (
    itemIds.size === 0 ||
    covered.size !== itemIds.size ||
    [...itemIds].some((id) => !covered.has(id))
  ) {
    throw new Error("INCOMPLETE_PROPOSAL");
  }

  if (versions.every((version) => version.isApproved) && order.status === "APPROVED") {
    return versions;
  }

  const approved = await prisma.$transaction(async (tx) => {
    await tx.calculationVersion.updateMany({
      where: { orderItem: { orderId }, isApproved: true },
      data: { isApproved: false },
    });

    await tx.calculationVersion.updateMany({
      where: { id: { in: versions.map((version) => version.id) } },
      data: { isApproved: true },
    });

    const orderRow = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true },
    });

    const locked =
      orderRow.status === "HANDED_TO_PRODUCTION" ||
      orderRow.status === "CLOSED" ||
      orderRow.status === "CANCELLED";

    if (!locked) {
      await tx.order.update({
        where: { id: orderId },
        data: {
          status: "APPROVED",
          approvedDate: new Date(),
          activeProposalRevision: proposalRevision,
        },
      });
    }

    return tx.calculationVersion.findMany({
      where: { id: { in: versions.map((version) => version.id) } },
    });
  });

  await recordActivity({
    entityType: "order",
    entityId: orderId,
    action: "proposal_approved",
    userId: userId ?? null,
    payload: { proposalRevision, versionIds: approved.map((row) => row.id) },
  });

  return approved;
}

export async function handOverToProduction(orderId: string, userId?: string) {
  const order = await getOrder(orderId);
  if (!order) throw new Error("ORDER_NOT_FOUND");
  const working = workingOrderItems(order.items);
  if (working.length === 0) throw new Error("NO_ITEM");

  await assertOrderSizesReady(orderId);

  // Recompute fabric meters / wholesale / delivery on the final size layout (incl. 3XL+).
  for (const item of working) {
    await syncOrderItemFabricPricing(item.id);
  }

  const fresh = await getOrder(orderId);
  if (!fresh) throw new Error("ORDER_NOT_FOUND");
  const freshWorking = workingOrderItems(fresh.items);

  const lines = freshWorking.map((item) => {
    const approved = item.versions.find((v) => v.isApproved);
    if (!approved) throw new Error("NO_APPROVED_VERSION");
    if (item.totalQuantity <= 0) throw new Error("NO_QUANTITY");
    return { item, approved };
  });

  if (
    !orderArtworkReady(
      freshWorking.map((item) => ({
        id: item.id,
        decorationsCount: item.decorations.length,
        decorations: item.decorations.map((decoration) => ({ id: decoration.id })),
      })),
      fresh.files.map((file) => ({
        orderItemId: file.orderItemId,
        orderItemDecorationId: file.orderItemDecorationId,
      })),
    )
  ) {
    throw new Error("NO_ARTWORK");
  }

  const [pricing, fixedCosts] = await Promise.all([
    getPricingForOrder(orderId),
    fixedCostOptionsFromDb(),
  ]);

  const updated = await prisma.$transaction(async (tx) => {
    for (const { item, approved } of lines) {
      const calcOptions = {
        ...calcOptionsFromProduct(item.product),
        fixedCosts,
      };
      const costCalc = buildCalcFromOrderItem(item, { ...pricing }, calcOptions);
      const approvedSnap = approved.snapshotJson as {
        commercial?: unknown;
        manualSellingPricePerUnit?: number | null;
        proposalRevision?: number | null;
        fixedCosts?: unknown;
        calc?: {
          sellingPricePerUnit?: string;
          totalSellingValue?: string;
          marginPercent?: string;
          profitAmount?: string;
        };
      } | null;

      // Lock live sizes + BOM after layout; keep commercial figures from the approved KP.
      const snapshotJson = {
        item: {
          nameUk: item.nameUk,
          totalQuantity: item.totalQuantity,
          sewerCountOverride: item.sewerCountOverride,
          sizes: item.sizes,
          materials: item.materials,
          operations: item.operations,
          decorations: item.decorations,
          additionalCosts: item.additionalCosts,
        },
        calc: {
          ...costCalc,
          sellingPricePerUnit:
            approved.sellingPricePerUnit != null
              ? Number(approved.sellingPricePerUnit).toFixed(2)
              : (approvedSnap?.calc?.sellingPricePerUnit ?? costCalc.sellingPricePerUnit),
          totalSellingValue:
            approved.totalSellingValue != null
              ? Number(approved.totalSellingValue).toFixed(2)
              : (approvedSnap?.calc?.totalSellingValue ?? costCalc.totalSellingValue),
          marginPercent:
            approved.marginPercent != null
              ? Number(approved.marginPercent).toFixed(2)
              : (approvedSnap?.calc?.marginPercent ?? costCalc.marginPercent),
          profitAmount:
            approved.profitAmount != null
              ? Number(approved.profitAmount).toFixed(2)
              : (approvedSnap?.calc?.profitAmount ?? costCalc.profitAmount),
        },
        pricing,
        commercial: approvedSnap?.commercial ?? null,
        manualSellingPricePerUnit: approvedSnap?.manualSellingPricePerUnit ?? null,
        proposalRevision: approvedSnap?.proposalRevision ?? approved.proposalRevision,
        fixedCosts: approvedSnap?.fixedCosts ?? null,
        productionLockedAt: new Date().toISOString(),
        lockedFromVersionId: approved.id,
      };

      await tx.productionSpecification.upsert({
        where: { orderItemId: item.id },
        create: {
          orderItemId: item.id,
          calculationVersionId: approved.id,
          snapshotJson: snapshotJson as Prisma.InputJsonValue,
        },
        update: {
          calculationVersionId: approved.id,
          snapshotJson: snapshotJson as Prisma.InputJsonValue,
          lockedAt: new Date(),
        },
      });
    }

    return tx.order.update({
      where: { id: orderId },
      data: { status: "HANDED_TO_PRODUCTION" },
    });
  });

  await recordActivity({
    entityType: "order",
    entityId: orderId,
    action: "handed_to_production",
    userId: userId ?? null,
    payload: { number: fresh.number, itemCount: lines.length },
  });

  return updated;
}

export async function updateOrderStatus(orderId: string, status: OrderStatus, userId?: string) {
  const before = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true, _count: { select: { items: true } } },
  });
  if (!before) throw new Error("ORDER_NOT_FOUND");

  // Empty orders may live on DRAFT / CALCULATION (or be cancelled).
  if (
    before._count.items === 0 &&
    !STAGES_ALLOWING_EMPTY.includes(status) &&
    status !== "CANCELLED"
  ) {
    throw new Error("EMPTY_ORDER_NOT_ALLOWED");
  }

  const updated = await prisma.order.update({
    where: { id: orderId },
    data: { status },
  });
  if (before.status !== status) {
    await recordActivity({
      entityType: "order",
      entityId: orderId,
      action: "status_changed",
      userId: userId ?? null,
      payload: {
        from: before.status,
        to: status,
        fromLabel: orderStatusLabel[before.status] ?? before.status,
        toLabel: orderStatusLabel[status] ?? status,
      },
    });
  }
  return updated;
}

export async function cancelOrders(ids: string[], userId?: string) {
  if (ids.length === 0) return { count: 0 };

  const orders = await prisma.order.findMany({
    where: {
      id: { in: ids },
      status: { not: "CANCELLED" },
    },
    select: { id: true, status: true },
  });

  if (orders.length === 0) return { count: 0 };

  await prisma.$transaction(
    orders.map((order) =>
      prisma.order.update({
        where: { id: order.id },
        data: { status: "CANCELLED" },
      }),
    ),
  );

  for (const order of orders) {
    await recordActivity({
      entityType: "order",
      entityId: order.id,
      action: "status_changed",
      userId: userId ?? null,
      payload: {
        from: order.status,
        to: "CANCELLED",
        fromLabel: orderStatusLabel[order.status] ?? order.status,
        toLabel: orderStatusLabel.CANCELLED,
      },
    });
  }

  return { count: orders.length };
}

/** Clone order + line BOM into a new DRAFT (no proposals, specs, or files). */
export async function duplicateOrder(input: { orderId: string; userId: string }) {
  const source = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          sizes: true,
          materials: { orderBy: { sortOrder: "asc" } },
          operations: { orderBy: { sortOrder: "asc" } },
          decorations: { orderBy: { sortOrder: "asc" } },
          additionalCosts: true,
        },
      },
    },
  });
  if (!source) throw new Error("NOT_FOUND");

  const number = await nextOrderNumber();
  const created = await prisma.$transaction(async (tx) => {
    const order = await tx.order.create({
      data: {
        number,
        clientId: source.clientId,
        managerId: input.userId,
        title: source.title,
        status: "DRAFT",
        deadline: source.deadline,
        comment: source.comment,
        targetMarginPercent: source.targetMarginPercent,
      },
    });

    for (const item of source.items) {
      await tx.orderItem.create({
        data: {
          orderId: order.id,
          productId: item.productId,
          sourceProductId: item.sourceProductId,
          nameUk: item.nameUk,
          totalQuantity: item.totalQuantity,
          comment: item.comment,
          fabricDeliveryAmount: item.fabricDeliveryAmount,
          fabricDeliveryComputed: item.fabricDeliveryComputed,
          fabricDeliveryManual: item.fabricDeliveryManual,
          sewerCountOverride: item.sewerCountOverride,
          sizes: {
            create: item.sizes.map((size) => ({
              sizeCode: size.sizeCode,
              sizeNameUk: size.sizeNameUk,
              quantity: size.quantity,
            })),
          },
          materials: {
            create: item.materials.map((row) => ({
              materialId: row.materialId,
              nameSnapshot: row.nameSnapshot,
              unitCodeSnapshot: row.unitCodeSnapshot,
              consumptionPerUnit: row.consumptionPerUnit,
              wastePercent: row.wastePercent,
              purchasePrice: row.purchasePrice,
              actualPurchasePrice: row.actualPurchasePrice,
              supplierId: row.supplierId,
              supplierNameSnapshot: row.supplierNameSnapshot,
              colorSnapshot: row.colorSnapshot,
              deliveryType: row.deliveryType,
              cargoUsdPerKg: row.cargoUsdPerKg,
              usdUahRate: row.usdUahRate,
              costVatOverride: row.costVatOverride,
              fabricDeliveryAmount: row.fabricDeliveryAmount,
              fabricDeliveryComputed: row.fabricDeliveryComputed,
              fabricDeliveryManual: row.fabricDeliveryManual,
              minWholesaleMetersOverride: row.minWholesaleMetersOverride,
              sortOrder: row.sortOrder,
              sizeCode: row.sizeCode,
            })),
          },
          operations: {
            create: item.operations.map((row) => ({
              operationId: row.operationId,
              nameSnapshot: row.nameSnapshot,
              calculationMethod: row.calculationMethod,
              unitRate: row.unitRate,
              shiftCost: row.shiftCost,
              standardOutput: row.standardOutput,
              sortOrder: row.sortOrder,
              sizeCode: row.sizeCode,
            })),
          },
          decorations: {
            create: item.decorations.map((row) => ({
              decorationMethodId: row.decorationMethodId,
              nameSnapshot: row.nameSnapshot,
              setupCost: row.setupCost,
              unitRate: row.unitRate,
              sortOrder: row.sortOrder,
            })),
          },
          additionalCosts: {
            create: item.additionalCosts.map((row) => ({
              nameUk: row.nameUk,
              amount: row.amount,
              isPerUnit: row.isPerUnit,
            })),
          },
        },
      });
    }

    return order;
  });

  await recordActivity({
    entityType: "order",
    entityId: created.id,
    action: "created",
    userId: input.userId,
    payload: {
      number: created.number,
      duplicatedFrom: source.id,
      duplicatedFromNumber: source.number,
      itemCount: source.items.length,
    },
  });

  return created;
}

export async function updateOrderTargetMargin(orderId: string, targetMarginPercent: number | null) {
  await assertOrderEditableById(orderId);
  return prisma.order.update({
    where: { id: orderId },
    data: {
      targetMarginPercent:
        targetMarginPercent != null && Number.isFinite(targetMarginPercent)
          ? targetMarginPercent
          : null,
    },
  });
}

export async function addOrderFile(input: {
  orderId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storageKey: string;
  orderItemId?: string | null;
  orderItemDecorationId?: string | null;
  caption?: string | null;
}) {
  await assertOrderEditableById(input.orderId);

  let orderItemId = input.orderItemId || null;
  let orderItemDecorationId = input.orderItemDecorationId || null;

  if (orderItemDecorationId) {
    const decoration = await prisma.orderItemDecoration.findFirst({
      where: {
        id: orderItemDecorationId,
        orderItem: { orderId: input.orderId },
      },
      select: { id: true, orderItemId: true, nameSnapshot: true },
    });
    if (!decoration) throw new Error("ORDER_DECORATION_NOT_FOUND");
    orderItemId = decoration.orderItemId;
    orderItemDecorationId = decoration.id;
  } else if (orderItemId) {
    const item = await prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId: input.orderId },
      select: { id: true },
    });
    if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
  }

  const caption = input.caption?.trim() || null;
  return prisma.fileAsset.create({
    data: {
      orderId: input.orderId,
      orderItemId,
      orderItemDecorationId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      storageKey: input.storageKey,
      caption,
    },
  });
}

export async function updateOrderFileMeta(input: {
  fileId: string;
  caption?: string | null;
  orderItemId?: string | null;
  orderItemDecorationId?: string | null;
}) {
  const file = await prisma.fileAsset.findUnique({
    where: { id: input.fileId },
    select: { orderId: true },
  });
  if (!file?.orderId) throw new Error("NOT_FOUND");
  await assertOrderEditableById(file.orderId);

  let orderItemId = input.orderItemId;
  let orderItemDecorationId = input.orderItemDecorationId;

  if (orderItemDecorationId !== undefined) {
    if (orderItemDecorationId) {
      const decoration = await prisma.orderItemDecoration.findFirst({
        where: {
          id: orderItemDecorationId,
          orderItem: { orderId: file.orderId },
        },
        select: { id: true, orderItemId: true },
      });
      if (!decoration) throw new Error("ORDER_DECORATION_NOT_FOUND");
      orderItemId = decoration.orderItemId;
      orderItemDecorationId = decoration.id;
    } else {
      orderItemDecorationId = null;
    }
  } else if (orderItemId) {
    const item = await prisma.orderItem.findFirst({
      where: { id: orderItemId, orderId: file.orderId },
      select: { id: true },
    });
    if (!item) throw new Error("ORDER_ITEM_NOT_FOUND");
    // Changing product clears decoration link unless explicitly set.
    orderItemDecorationId = null;
  }

  return prisma.fileAsset.update({
    where: { id: input.fileId },
    data: {
      ...(input.caption !== undefined ? { caption: input.caption?.trim() || null } : {}),
      ...(orderItemId !== undefined ? { orderItemId: orderItemId || null } : {}),
      ...(orderItemDecorationId !== undefined
        ? { orderItemDecorationId: orderItemDecorationId || null }
        : {}),
    },
  });
}

export async function removeOrderFile(id: string) {
  const file = await prisma.fileAsset.findUnique({
    where: { id },
    select: { orderId: true },
  });
  if (!file?.orderId) throw new Error("NOT_FOUND");
  await assertOrderEditableById(file.orderId);
  return prisma.fileAsset.delete({ where: { id } });
}
