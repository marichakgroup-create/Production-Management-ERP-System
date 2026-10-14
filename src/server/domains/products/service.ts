import { prisma } from "@/server/db/client";
import { z } from "zod";
import {
  sizeCodesFromScopes,
  sizeConsumptionFromNorms,
  sizeWasteFromNorms,
} from "@/lib/size-bom";
import {
  fabricFieldsForOrderLine,
  materialToSnapshot,
  offerToSnapshot,
  pickSupplierOffer,
  resolveBomMaterialPurchasePrice,
} from "@/lib/order-material-terms";
import {
  defaultOperationRateTiers,
  parseRateTiersInput,
} from "@/lib/quantity-tiers";

export function assertProductOrderable(
  product: { status: string } | null | undefined,
): asserts product is { status: string } {
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (product.status === "ARCHIVED") throw new Error("PRODUCT_ARCHIVED");
}

const sizeCodesField = z.array(z.string()).optional().nullable();
const sizeConsumptionField = z.record(z.string(), z.number().nonnegative()).optional();

/** Absolute https URL or app-local /uploads/... path from storeProductImage. */
export function isAllowedProductImageUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("/uploads/")) {
    return !trimmed.includes("..") && trimmed.length < 500;
  }
  return z.string().url().safeParse(trimmed).success;
}

export const productFormSchema = z.object({
  nameUk: z.string().trim().min(1),
  internalCode: z.string().trim().optional().nullable(),
  description: z.string().trim().optional().nullable(),
  imageUrl: z.preprocess(
    (value) => (value === "" || value == null ? null : value),
    z
      .string()
      .refine(isAllowedProductImageUrl, "INVALID_IMAGE_URL")
      .nullable()
      .optional(),
  ),
  sizeIds: z.array(z.string()).default([]),
  sizeChartVariantId: z.string().trim().optional().nullable(),
  materials: z
    .array(
      z.object({
        materialId: z.string().min(1),
        consumptionPerUnit: z.number().positive(),
        wastePercent: z.number().min(0).nullable().optional(),
        sizeCodes: sizeCodesField,
        sizeConsumption: sizeConsumptionField,
      }),
    )
    .default([]),
  operations: z
    .array(
      z.object({
        operationId: z.string().min(1),
        sizeCodes: sizeCodesField,
      }),
    )
    .default([]),
  decorations: z
    .array(
      z.object({
        decorationMethodId: z.string().min(1),
      }),
    )
    .default([]),
});

export type ProductFormValues = z.infer<typeof productFormSchema>;

const productMaterialInclude = {
  material: {
    include: {
      unitOfMeasure: true,
      supplierOffers: {
        include: { supplier: true },
        orderBy: [{ isPrimary: "desc" as const }, { updatedAt: "desc" as const }],
      },
    },
  },
  supplier: true,
  sizeNorms: { include: { size: true } },
  sizeScopes: { include: { size: true } },
} satisfies import("@prisma/client").Prisma.ProductMaterialInclude;

const productOperationInclude = {
  operation: { include: { rateTiers: { orderBy: { minQuantity: "asc" as const } } } },
  sizeScopes: { include: { size: true } },
  rateTiers: { orderBy: { minQuantity: "asc" as const } },
} satisfies import("@prisma/client").Prisma.ProductOperationInclude;

const productDetailInclude = {
  category: true,
  sizeChartVariant: true,
  sizes: { include: { size: true }, orderBy: { size: { sortOrder: "asc" as const } } },
  materials: { include: productMaterialInclude, orderBy: { sortOrder: "asc" as const } },
  operations: { include: productOperationInclude, orderBy: { sortOrder: "asc" as const } },
  decorations: { include: { decorationMethod: true } },
  additionalCosts: true,
  cutRateTiers: { orderBy: { minQuantity: "asc" as const } },
  commercialPriceTiers: { orderBy: { minQuantity: "asc" as const } },
} satisfies import("@prisma/client").Prisma.ProductInclude;

function sizeCreateForCodes(
  codes: string[] | null | undefined,
  sizeIdByCode: Map<string, string>,
) {
  if (!codes?.length) return undefined;
  const sizeIds = [...new Set(codes.map((code) => sizeIdByCode.get(code)).filter(Boolean))] as string[];
  if (sizeIds.length === 0) return undefined;
  return { create: sizeIds.map((sizeId) => ({ sizeId })) };
}

function normCreateForMap(
  map: Record<string, number> | undefined,
  sizeIdByCode: Map<string, string>,
) {
  if (!map) return undefined;
  const rows = Object.entries(map)
    .map(([code, consumptionPerUnit]) => {
      const sizeId = sizeIdByCode.get(code);
      if (!sizeId || !Number.isFinite(consumptionPerUnit) || consumptionPerUnit < 0) return null;
      return { sizeId, consumptionPerUnit };
    })
    .filter((row): row is { sizeId: string; consumptionPerUnit: number } => Boolean(row));
  if (rows.length === 0) return undefined;
  return { create: rows };
}
export async function listProducts() {
  return prisma.product.findMany({
    where: { status: "ACTIVE" },
    include: productDetailInclude,
    orderBy: { nameUk: "asc" },
  });
}

/** Lightweight list for the products table — counts only, no nested BOM. */
export async function listProductsSummary() {
  return prisma.product.findMany({
    where: { status: "ACTIVE" },
    select: {
      id: true,
      nameUk: true,
      internalCode: true,
      isBaseModel: true,
      imageUrl: true,
      description: true,
      updatedAt: true,
      category: { select: { nameUk: true } },
      materials: {
        where: { material: { type: "FABRIC" } },
        select: {
          material: {
            select: {
              type: true,
              nameUk: true,
            },
          },
        },
        orderBy: { sortOrder: "asc" },
        take: 4,
      },
      _count: {
        select: {
          materials: true,
          operations: true,
          decorations: true,
        },
      },
    },
    orderBy: { nameUk: "asc" },
  });
}

/** Full detail for a subset (e.g. ready products that need price calc). */
export async function listProductsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  return prisma.product.findMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    include: productDetailInclude,
  });
}

export async function listSizes(variantId?: string | null) {
  return prisma.size.findMany({
    where: {
      status: "ACTIVE",
      ...(variantId ? { variantId } : {}),
    },
    orderBy: [{ sortOrder: "asc" }],
  });
}

export async function listSizeChartVariantsForProduct() {
  return prisma.sizeChartVariant.findMany({
    where: { status: "ACTIVE" },
    orderBy: [{ sortOrder: "asc" }, { nameUk: "asc" }],
    select: { id: true, code: true, nameUk: true },
  });
}

/** Replace product size grid. Removing a size also clears size-specific norms/scopes. */
export async function setProductSizes(input: {
  productId: string;
  sizeIds: string[];
  sizeChartVariantId?: string | null;
}) {
  const product = await getProduct(input.productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  if (product.status === "ARCHIVED") throw new Error("PRODUCT_ARCHIVED");

  const uniqueIds = [...new Set(input.sizeIds.filter(Boolean))];
  let variantId =
    input.sizeChartVariantId !== undefined
      ? input.sizeChartVariantId
      : product.sizeChartVariantId;

  if (uniqueIds.length > 0) {
    const found = await prisma.size.findMany({
      where: { id: { in: uniqueIds }, status: "ACTIVE" },
      select: { id: true, variantId: true },
    });
    if (found.length !== uniqueIds.length) throw new Error("SIZE_NOT_FOUND");
    const variantIds = [...new Set(found.map((row) => row.variantId))];
    if (variantIds.length > 1) throw new Error("SIZE_VARIANT_MIXED");
    if (variantId && variantIds[0] !== variantId) throw new Error("SIZE_VARIANT_MISMATCH");
    variantId = variantIds[0] ?? variantId;
  }

  const currentIds = new Set(product.sizes.map((row) => row.sizeId));
  const nextIds = new Set(uniqueIds);
  const toAdd = uniqueIds.filter((id) => !currentIds.has(id));
  const toRemove = [...currentIds].filter((id) => !nextIds.has(id));

  await prisma.$transaction(async (tx) => {
    if (toRemove.length > 0) {
      const materialIds = product.materials.map((row) => row.id);
      const operationIds = product.operations.map((row) => row.id);
      if (materialIds.length > 0) {
        await tx.productMaterialSizeNorm.deleteMany({
          where: { productMaterialId: { in: materialIds }, sizeId: { in: toRemove } },
        });
        await tx.productMaterialSizeScope.deleteMany({
          where: { productMaterialId: { in: materialIds }, sizeId: { in: toRemove } },
        });
      }
      if (operationIds.length > 0) {
        await tx.productOperationSizeScope.deleteMany({
          where: { productOperationId: { in: operationIds }, sizeId: { in: toRemove } },
        });
      }
      await tx.productSize.deleteMany({
        where: { productId: input.productId, sizeId: { in: toRemove } },
      });
    }
    if (toAdd.length > 0) {
      await tx.productSize.createMany({
        data: toAdd.map((sizeId) => ({ productId: input.productId, sizeId })),
      });
    }
    await tx.product.update({
      where: { id: input.productId },
      data: { sizeChartVariantId: variantId ?? null },
    });
  });

  return getProduct(input.productId);
}

export async function createProductDraft(raw: ProductFormValues) {
  const data = productFormSchema.parse(raw);
  const imageUrl = data.imageUrl?.trim() ? data.imageUrl.trim() : null;

  const materialIds = [...new Set(data.materials.map((row) => row.materialId))];
  const materials =
    materialIds.length > 0
      ? await prisma.material.findMany({ where: { id: { in: materialIds } } })
      : [];
  const materialById = new Map(materials.map((row) => [row.id, row]));

  const operationIds = [...new Set(data.operations.map((row) => row.operationId))];
  const catalogOperations =
    operationIds.length > 0
      ? await prisma.operation.findMany({
          where: { id: { in: operationIds } },
          include: { rateTiers: { orderBy: { minQuantity: "asc" } } },
        })
      : [];
  const operationById = new Map(catalogOperations.map((row) => [row.id, row]));

  const sizeRecords = data.sizeIds.length
    ? await prisma.size.findMany({ where: { id: { in: data.sizeIds }, status: "ACTIVE" } })
    : [];
  const sizeIdByCode = new Map(sizeRecords.map((row) => [row.code, row.id]));
  const inferredVariantId =
    data.sizeChartVariantId ||
    sizeRecords[0]?.variantId ||
    (
      await prisma.sizeChartVariant.findFirst({
        where: { code: "INTL_UNISEX", status: "ACTIVE" },
        select: { id: true },
      })
    )?.id ||
    null;

  return prisma.product.create({
    data: {
      nameUk: data.nameUk,
      internalCode: data.internalCode || null,
      description: data.description || null,
      imageUrl,
      status: "ACTIVE",
      sizeChartVariantId: inferredVariantId,
      sizes: {
        create: data.sizeIds.map((sizeId) => ({ sizeId })),
      },
      materials: {
        create: data.materials.map((row, index) => {
          const catalog = materialById.get(row.materialId);
          return {
            materialId: row.materialId,
            consumptionPerUnit: row.consumptionPerUnit,
            wastePercent: row.wastePercent ?? catalog?.defaultWastePercent ?? 0,
            sortOrder: index,
            sizeScopes: sizeCreateForCodes(row.sizeCodes, sizeIdByCode),
            sizeNorms: normCreateForMap(row.sizeConsumption, sizeIdByCode),
          };
        }),
      },
      operations: {
        create: data.operations.map((row, index) => {
          const catalog = operationById.get(row.operationId);
          const tiers =
            catalog?.calculationMethod === "QUANTITY_TIER"
              ? catalog.rateTiers.length > 0
                ? catalog.rateTiers.map((tier) => ({
                    minQuantity: tier.minQuantity,
                    ratePerUnit: Number(tier.ratePerUnit),
                  }))
                : defaultOperationRateTiers(
                    catalog.baseRate != null ? Number(catalog.baseRate) : 0,
                  )
              : [];
          return {
            operationId: row.operationId,
            sortOrder: index,
            sizeScopes: sizeCreateForCodes(row.sizeCodes, sizeIdByCode),
            rateTiers:
              tiers.length > 0
                ? {
                    create: tiers.map((tier) => ({
                      minQuantity: tier.minQuantity,
                      ratePerUnit: tier.ratePerUnit,
                    })),
                  }
                : undefined,
          };
        }),
      },
      decorations: {
        create: data.decorations.map((row) => ({
          decorationMethodId: row.decorationMethodId,
        })),
      },
    },
    include: productDetailInclude,
  });
}

export async function getProduct(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: productDetailInclude,
  });
}

export function toCompositionTemplate(product: NonNullable<Awaited<ReturnType<typeof getProduct>>>) {
  return {
    materials: product.materials.map((row) => {
      const offer = pickSupplierOffer(row.material.supplierOffers ?? [], row.supplierId);
      const merged = fabricFieldsForOrderLine(
        materialToSnapshot(row.material),
        offer ? offerToSnapshot(offer) : null,
      );
      return {
      materialId: row.materialId,
      name: row.material.nameUk,
      unit: row.material.unitOfMeasure.code,
      consumption: Number(row.consumptionPerUnit),
      waste: Number(row.wastePercent ?? row.material.defaultWastePercent),
      price: resolveBomMaterialPurchasePrice({
        material: row.material,
        offers: row.material.supplierOffers ?? [],
        supplierId: row.supplierId,
        companyCostMode: "NET",
        metersNeeded: null,
      }),
      sizeCodes: sizeCodesFromScopes(row.sizeScopes),
      sizeConsumption: sizeConsumptionFromNorms(row.sizeNorms),
      sizeWaste: sizeWasteFromNorms(row.sizeNorms),
      materialType: row.material.type,
      supplierId: row.supplierId,
      deliveryType: row.deliveryType ?? null,
      colorSnapshot: row.colorSnapshot ?? null,
      lineColor: row.colorSnapshot ?? null,
      priceMeterUahNoVat: merged.priceMeterUahNoVat,
      priceMeterUahVat: merged.priceMeterUahVat,
      priceMeterUahCutVat: merged.priceMeterUahCutVat,
      metersPerRoll: merged.metersPerRoll,
      minWholesaleMeters: merged.minWholesaleMeters,
      metersPerKg: merged.metersPerKg,
      wholesaleNote: row.material.wholesaleNote ?? null,
      costVatMode: row.material.costVatOverride,
      availableColors: row.material.availableColors ?? [],
      supplierOffers: (row.material.supplierOffers ?? []).map((offer) => ({
        supplierId: offer.supplierId,
        supplierName: offer.supplier.nameUk,
        isPrimary: offer.isPrimary,
        availableColors: offer.availableColors ?? [],
      })),
    };
    }),
    operations: product.operations.map((row) => ({
      operationId: row.operationId,
      name: row.operation.nameUk,
      method: row.operation.calculationMethod,
      unitRate:
        row.rateOverride != null
          ? Number(row.rateOverride)
          : row.operation.baseRate != null
            ? Number(row.operation.baseRate)
            : null,
      shiftCost: row.operation.shiftCost != null ? Number(row.operation.shiftCost) : null,
      standardOutput:
        row.standardOverride != null
          ? Number(row.standardOverride)
          : row.operation.standardOutputPerShift != null
            ? Number(row.operation.standardOutputPerShift)
            : null,
      sizeCodes: sizeCodesFromScopes(row.sizeScopes),
      rateTiers: (row.rateTiers.length > 0 ? row.rateTiers : row.operation.rateTiers).map(
        (tier) => ({
          minQuantity: tier.minQuantity,
          ratePerUnit: Number(tier.ratePerUnit),
        }),
      ),
    })),
    decorations: product.decorations.map((row) => ({
      decorationMethodId: row.decorationMethodId,
      name: row.decorationMethod.nameUk,
      setupCost:
        row.setupCostOverride != null
          ? Number(row.setupCostOverride)
          : Number(row.decorationMethod.setupCost),
      unitRate: Number(row.decorationMethod.unitRate),
    })),
  };
}

export async function addProductMaterial(input: {
  productId: string;
  materialId: string;
  consumptionPerUnit: number;
  wastePercent?: number | null;
  sizeIds?: string[];
  supplierId?: string | null;
  colorSnapshot?: string | null;
}) {
  const material = await prisma.material.findUniqueOrThrow({
    where: { id: input.materialId },
    include: {
      supplierOffers: {
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
      },
    },
  });

  const { defaultSupplierId, reconcileColorForSupplier } = await import(
    "@/lib/supplier-colors"
  );
  const offers = material.supplierOffers.map((row) => ({
    supplierId: row.supplierId,
    isPrimary: row.isPrimary,
    availableColors: row.availableColors,
  }));
  const supplierId =
    input.supplierId ?? defaultSupplierId(offers);
  const colorSnapshot =
    input.colorSnapshot !== undefined
      ? input.colorSnapshot
      : reconcileColorForSupplier({
          color: null,
          supplierId,
          offers,
          materialFallback: material.availableColors,
        });

  const maxSort = await prisma.productMaterial.aggregate({
    where: { productId: input.productId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  return prisma.productMaterial.create({
    data: {
      productId: input.productId,
      materialId: input.materialId,
      consumptionPerUnit: input.consumptionPerUnit,
      wastePercent: input.wastePercent ?? material.defaultWastePercent,
      supplierId,
      colorSnapshot,
      sortOrder,
      sizeScopes:
        input.sizeIds && input.sizeIds.length > 0
          ? { create: input.sizeIds.map((sizeId) => ({ sizeId })) }
          : undefined,
    },
  });
}

export async function setProductMaterialSupplierColor(input: {
  id: string;
  supplierId?: string | null;
  deliveryType?: string | null;
  colorSnapshot?: string | null;
}) {
  const row = await prisma.productMaterial.findUniqueOrThrow({
    where: { id: input.id },
    include: {
      material: {
        include: {
          supplierOffers: {
            orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
          },
        },
      },
    },
  });

  const { reconcileColorForSupplier } = await import("@/lib/supplier-colors");
  const { normalizeFabricDeliveryType, isFabricDeliveryType } = await import(
    "@/lib/fabric-delivery-types"
  );
  const offers = row.material.supplierOffers.map((offer) => ({
    supplierId: offer.supplierId,
    isPrimary: offer.isPrimary,
    availableColors: offer.availableColors,
  }));
  const supplierId =
    input.supplierId !== undefined ? input.supplierId : row.supplierId;
  const nextColor =
    input.colorSnapshot !== undefined && input.supplierId === undefined
      ? input.colorSnapshot
      : reconcileColorForSupplier({
          color:
            input.colorSnapshot !== undefined ? input.colorSnapshot : row.colorSnapshot,
          supplierId,
          offers,
          materialFallback: row.material.availableColors,
        });

  let deliveryType = row.deliveryType;
  if (input.deliveryType !== undefined) {
    deliveryType =
      input.deliveryType && isFabricDeliveryType(input.deliveryType)
        ? normalizeFabricDeliveryType(input.deliveryType)
        : null;
  } else if (input.supplierId !== undefined && supplierId) {
    const offer = row.material.supplierOffers.find((o) => o.supplierId === supplierId);
    deliveryType = offer?.deliveryType ?? null;
  } else if (input.supplierId !== undefined && !supplierId) {
    deliveryType = null;
  }

  return prisma.productMaterial.update({
    where: { id: input.id },
    data: {
      supplierId,
      deliveryType,
      colorSnapshot: nextColor,
    },
  });
}

export async function addProductOperation(input: {
  productId: string;
  operationId: string;
  sizeIds?: string[];
}) {
  const operation = await prisma.operation.findUnique({
    where: { id: input.operationId },
    include: { rateTiers: { orderBy: { minQuantity: "asc" } } },
  });
  if (!operation) throw new Error("OPERATION_NOT_FOUND");

  const catalogTiers =
    operation.calculationMethod === "QUANTITY_TIER"
      ? operation.rateTiers.length > 0
        ? operation.rateTiers.map((tier) => ({
            minQuantity: tier.minQuantity,
            ratePerUnit: Number(tier.ratePerUnit),
          }))
        : defaultOperationRateTiers(
            operation.baseRate != null ? Number(operation.baseRate) : 0,
          )
      : [];

  const maxSort = await prisma.productOperation.aggregate({
    where: { productId: input.productId },
    _max: { sortOrder: true },
  });
  const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

  return prisma.productOperation.create({
    data: {
      productId: input.productId,
      operationId: input.operationId,
      sortOrder,
      sizeScopes:
        input.sizeIds && input.sizeIds.length > 0
          ? { create: input.sizeIds.map((sizeId) => ({ sizeId })) }
          : undefined,
      rateTiers:
        catalogTiers.length > 0
          ? {
              create: catalogTiers.map((tier) => ({
                minQuantity: tier.minQuantity,
                ratePerUnit: tier.ratePerUnit,
              })),
            }
          : undefined,
    },
    include: productOperationInclude,
  });
}

/** Persist manual material/operation order for a product (0-based sortOrder). */
export async function reorderProductBomLines(input: {
  productId: string;
  kind: "materials" | "operations";
  orderedIds: string[];
}) {
  const orderedIds = [...new Set(input.orderedIds.filter(Boolean))];
  if (orderedIds.length === 0) return;

  if (input.kind === "materials") {
    const existing = await prisma.productMaterial.findMany({
      where: { productId: input.productId },
      select: { id: true },
    });
    const allowed = new Set(existing.map((row) => row.id));
    const ids = orderedIds.filter((id) => allowed.has(id));
    if (ids.length !== existing.length) throw new Error("BOM_REORDER_MISMATCH");
    await prisma.$transaction(
      ids.map((id, index) =>
        prisma.productMaterial.update({
          where: { id },
          data: { sortOrder: index },
        }),
      ),
    );
    return;
  }

  const existing = await prisma.productOperation.findMany({
    where: { productId: input.productId },
    select: { id: true },
  });
  const allowed = new Set(existing.map((row) => row.id));
  const ids = orderedIds.filter((id) => allowed.has(id));
  if (ids.length !== existing.length) throw new Error("BOM_REORDER_MISMATCH");
  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.productOperation.update({
        where: { id },
        data: { sortOrder: index },
      }),
    ),
  );
}

export async function setProductOperationRateTiers(input: {
  productOperationId: string;
  tiers: Array<{ minQuantity: number; ratePerUnit: number }>;
}) {
  const tiers = parseRateTiersInput(input.tiers);
  await prisma.$transaction([
    prisma.productOperationRateTier.deleteMany({
      where: { productOperationId: input.productOperationId },
    }),
    prisma.productOperationRateTier.createMany({
      data: tiers.map((tier) => ({
        productOperationId: input.productOperationId,
        minQuantity: tier.minQuantity,
        ratePerUnit: tier.ratePerUnit,
      })),
    }),
  ]);
  return prisma.productOperation.findUnique({
    where: { id: input.productOperationId },
    include: productOperationInclude,
  });
}

export async function setProductOperationRateOverride(input: {
  productOperationId: string;
  rateOverride: number | null;
}) {
  const rate =
    input.rateOverride == null || !Number.isFinite(input.rateOverride)
      ? null
      : Math.max(0, input.rateOverride);

  return prisma.productOperation.update({
    where: { id: input.productOperationId },
    data: { rateOverride: rate },
    include: productOperationInclude,
  });
}

export async function setProductOperationStandardOverride(input: {
  productOperationId: string;
  standardOverride: number | null;
}) {
  const value =
    input.standardOverride == null || !Number.isFinite(input.standardOverride)
      ? null
      : Math.max(0, input.standardOverride);

  return prisma.productOperation.update({
    where: { id: input.productOperationId },
    data: { standardOverride: value },
    include: productOperationInclude,
  });
}

export async function setProductMaterialConsumption(id: string, consumptionPerUnit: number) {
  return prisma.productMaterial.update({
    where: { id },
    data: { consumptionPerUnit },
  });
}

export async function setProductMaterialWaste(id: string, wastePercent: number) {
  return prisma.productMaterial.update({
    where: { id },
    data: { wastePercent },
  });
}

export async function setProductMaterialSizeNorm(input: {
  productMaterialId: string;
  sizeId: string;
  consumptionPerUnit: number;
  wastePercent?: number | null;
}) {
  return prisma.productMaterialSizeNorm.upsert({
    where: {
      productMaterialId_sizeId: {
        productMaterialId: input.productMaterialId,
        sizeId: input.sizeId,
      },
    },
    update: {
      consumptionPerUnit: input.consumptionPerUnit,
      ...(input.wastePercent !== undefined
        ? { wastePercent: input.wastePercent }
        : {}),
    },
    create: {
      productMaterialId: input.productMaterialId,
      sizeId: input.sizeId,
      consumptionPerUnit: input.consumptionPerUnit,
      wastePercent:
        input.wastePercent !== undefined ? input.wastePercent : null,
    },
  });
}

/** Set waste for one size; creates a size norm row with base consumption if missing. */
export async function setProductMaterialSizeWaste(input: {
  productMaterialId: string;
  sizeId: string;
  wastePercent: number;
}) {
  const row = await prisma.productMaterial.findUnique({
    where: { id: input.productMaterialId },
    include: { sizeNorms: true },
  });
  if (!row) throw new Error("PRODUCT_MATERIAL_NOT_FOUND");
  const existing = row.sizeNorms.find((norm) => norm.sizeId === input.sizeId);
  const consumptionPerUnit = Number(
    existing?.consumptionPerUnit ?? row.consumptionPerUnit,
  );
  return prisma.productMaterialSizeNorm.upsert({
    where: {
      productMaterialId_sizeId: {
        productMaterialId: input.productMaterialId,
        sizeId: input.sizeId,
      },
    },
    update: { wastePercent: input.wastePercent },
    create: {
      productMaterialId: input.productMaterialId,
      sizeId: input.sizeId,
      consumptionPerUnit,
      wastePercent: input.wastePercent,
    },
  });
}

export async function removeProductMaterialFromSize(input: {
  productMaterialId: string;
  sizeId: string | null;
}) {
  const row = await prisma.productMaterial.findUnique({
    where: { id: input.productMaterialId },
    include: {
      sizeScopes: true,
      product: { include: { sizes: true } },
    },
  });
  if (!row) return;

  if (!input.sizeId) {
    await prisma.productMaterial.delete({ where: { id: row.id } });
    return;
  }

  const productSizeIds = row.product.sizes.map((size) => size.sizeId);
  if (row.sizeScopes.length === 0) {
    const keep = productSizeIds.filter((id) => id !== input.sizeId);
    await prisma.$transaction([
      prisma.productMaterialSizeNorm.deleteMany({
        where: { productMaterialId: row.id, sizeId: input.sizeId },
      }),
      prisma.productMaterialSizeScope.createMany({
        data: keep.map((sizeId) => ({ productMaterialId: row.id, sizeId })),
        skipDuplicates: true,
      }),
    ]);
    if (keep.length === 0) {
      await prisma.productMaterial.delete({ where: { id: row.id } });
    }
    return;
  }

  await prisma.$transaction([
    prisma.productMaterialSizeScope.deleteMany({
      where: { productMaterialId: row.id, sizeId: input.sizeId },
    }),
    prisma.productMaterialSizeNorm.deleteMany({
      where: { productMaterialId: row.id, sizeId: input.sizeId },
    }),
  ]);
  const remaining = await prisma.productMaterialSizeScope.count({
    where: { productMaterialId: row.id },
  });
  if (remaining === 0) {
    await prisma.productMaterial.delete({ where: { id: row.id } });
  }
}

export async function removeProductOperationFromSize(input: {
  productOperationId: string;
  sizeId: string | null;
}) {
  const row = await prisma.productOperation.findUnique({
    where: { id: input.productOperationId },
    include: {
      sizeScopes: true,
      product: { include: { sizes: true } },
    },
  });
  if (!row) return;

  if (!input.sizeId) {
    await prisma.productOperation.delete({ where: { id: row.id } });
    return;
  }

  const productSizeIds = row.product.sizes.map((size) => size.sizeId);
  if (row.sizeScopes.length === 0) {
    const keep = productSizeIds.filter((id) => id !== input.sizeId);
    if (keep.length === 0) {
      await prisma.productOperation.delete({ where: { id: row.id } });
      return;
    }
    await prisma.productOperationSizeScope.createMany({
      data: keep.map((sizeId) => ({ productOperationId: row.id, sizeId })),
      skipDuplicates: true,
    });
    return;
  }

  await prisma.productOperationSizeScope.deleteMany({
    where: { productOperationId: row.id, sizeId: input.sizeId },
  });
  const remaining = await prisma.productOperationSizeScope.count({
    where: { productOperationId: row.id },
  });
  if (remaining === 0) {
    await prisma.productOperation.delete({ where: { id: row.id } });
  }
}

export async function copyProductSizeSpec(input: {
  productId: string;
  fromSizeId: string;
  toSizeIds: string[];
}) {
  const product = await getProduct(input.productId);
  if (!product) throw new Error("PRODUCT_NOT_FOUND");
  const from = product.sizes.find((row) => row.sizeId === input.fromSizeId);
  if (!from) throw new Error("SIZE_NOT_FOUND");
  const targets = input.toSizeIds.filter((id) => id !== input.fromSizeId);
  if (targets.length === 0) return;

  const fromCode = from.size.code;

  await prisma.$transaction(async (tx) => {
    for (const material of product.materials) {
      const applies =
        material.sizeScopes.length === 0 ||
        material.sizeScopes.some((scope) => scope.sizeId === input.fromSizeId);
      if (!applies) continue;
      const consumption = Number(
        material.sizeNorms.find((norm) => norm.sizeId === input.fromSizeId)?.consumptionPerUnit ??
          material.consumptionPerUnit,
      );
      const fromNorm = material.sizeNorms.find((norm) => norm.sizeId === input.fromSizeId);
      const wastePercent =
        fromNorm?.wastePercent != null
          ? Number(fromNorm.wastePercent)
          : material.wastePercent != null
            ? Number(material.wastePercent)
            : null;
      for (const sizeId of targets) {
        if (material.sizeScopes.length > 0) {
          await tx.productMaterialSizeScope.upsert({
            where: {
              productMaterialId_sizeId: { productMaterialId: material.id, sizeId },
            },
            update: {},
            create: { productMaterialId: material.id, sizeId },
          });
        }
        await tx.productMaterialSizeNorm.upsert({
          where: {
            productMaterialId_sizeId: { productMaterialId: material.id, sizeId },
          },
          update: { consumptionPerUnit: consumption, wastePercent },
          create: {
            productMaterialId: material.id,
            sizeId,
            consumptionPerUnit: consumption,
            wastePercent,
          },
        });
      }
      if (material.sizeScopes.length === 0) {
        await tx.productMaterialSizeNorm.upsert({
          where: {
            productMaterialId_sizeId: {
              productMaterialId: material.id,
              sizeId: input.fromSizeId,
            },
          },
          update: { consumptionPerUnit: consumption, wastePercent },
          create: {
            productMaterialId: material.id,
            sizeId: input.fromSizeId,
            consumptionPerUnit: consumption,
            wastePercent,
          },
        });
      }
    }

    for (const operation of product.operations) {
      const applies =
        operation.sizeScopes.length === 0 ||
        operation.sizeScopes.some((scope) => scope.sizeId === input.fromSizeId);
      if (!applies || operation.sizeScopes.length === 0) continue;
      for (const sizeId of targets) {
        await tx.productOperationSizeScope.upsert({
          where: {
            productOperationId_sizeId: { productOperationId: operation.id, sizeId },
          },
          update: {},
          create: { productOperationId: operation.id, sizeId },
        });
      }
    }
  });

  return;
}

export async function addProductDecoration(input: {
  productId: string;
  decorationMethodId: string;
}) {
  return prisma.productDecoration.create({
    data: {
      productId: input.productId,
      decorationMethodId: input.decorationMethodId,
    },
  });
}

export async function setProductDecorationSetupCost(
  productDecorationId: string,
  setupCost: number,
) {
  return prisma.productDecoration.update({
    where: { id: productDecorationId },
    data: { setupCostOverride: setupCost },
  });
}

export async function setProductImageUrl(productId: string, imageUrl: string | null) {
  const url = imageUrl?.trim() ? imageUrl.trim() : null;
  if (url && !isAllowedProductImageUrl(url)) {
    throw new Error("INVALID_IMAGE_URL");
  }

  const previous = await prisma.product.findUnique({
    where: { id: productId },
    select: { imageUrl: true },
  });

  const updated = await prisma.product.update({
    where: { id: productId },
    data: { imageUrl: url },
  });

  const previousUrl = previous?.imageUrl?.trim() || null;
  if (previousUrl && previousUrl !== url) {
    const { removeStoredProductImage } = await import("@/lib/uploads");
    await removeStoredProductImage(previousUrl);
  }

  return updated;
}

export async function updateProductIdentity(input: {
  productId: string;
  nameUk: string;
  internalCode: string | null;
  description: string | null;
}) {
  const nameUk = input.nameUk.trim();
  if (!nameUk) throw new Error("VALIDATION");

  const internalCode = input.internalCode?.trim() || null;
  const description = input.description?.trim() || null;

  if (internalCode) {
    const codeClash = await prisma.product.findFirst({
      where: { internalCode, id: { not: input.productId } },
      select: { id: true },
    });
    if (codeClash) throw new Error("DUPLICATE_CODE");
  }

  const nameClash = await prisma.product.findFirst({
    where: {
      id: { not: input.productId },
      nameUk: { equals: nameUk, mode: "insensitive" },
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (nameClash) throw new Error("DUPLICATE_NAME");

  return prisma.product.update({
    where: { id: input.productId },
    data: { nameUk, internalCode, description },
  });
}

export async function removeProductDecoration(productDecorationId: string) {
  return prisma.productDecoration.delete({ where: { id: productDecorationId } });
}

export async function archiveProducts(ids: string[]) {
  if (ids.length === 0) return { count: 0 };
  return prisma.product.updateMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
}

export function parseCutRateTiersInput(input: {
  optimalQty?: unknown;
  tiers?: unknown;
}):
  | {
      ok: true;
      optimalQty: number | null;
      tiers: Array<{ minQuantity: number; ratePerUnit: number }>;
    }
  | { ok: false } {
  const optimalRaw =
    input.optimalQty == null || input.optimalQty === ""
      ? null
      : Number(input.optimalQty);
  if (optimalRaw != null && (!Number.isFinite(optimalRaw) || optimalRaw <= 0)) {
    return { ok: false };
  }

  const tiers: Array<{ minQuantity: number; ratePerUnit: number }> = [];
  if (Array.isArray(input.tiers)) {
    for (const row of input.tiers) {
      if (!row || typeof row !== "object") continue;
      const minQuantity = Number((row as { minQuantity?: unknown }).minQuantity);
      const ratePerUnit = Number((row as { ratePerUnit?: unknown }).ratePerUnit);
      if (!Number.isFinite(minQuantity) || !Number.isFinite(ratePerUnit)) continue;
      if (minQuantity <= 0 || ratePerUnit < 0) continue;
      tiers.push({ minQuantity, ratePerUnit });
    }
  }

  return { ok: true, optimalQty: optimalRaw, tiers };
}

export function parseCommercialPriceTiersInput(input: {
  isBaseModel?: unknown;
  tiers?: unknown;
}):
  | {
      ok: true;
      isBaseModel: boolean;
      tiers: Array<{
        minQuantity: number;
        pricePerUnit: number;
        showOnCard: boolean;
        sewingMultiplier: number | null;
      }>;
    }
  | { ok: false } {
  const isBaseModel =
    input.isBaseModel === true ||
    input.isBaseModel === "1" ||
    input.isBaseModel === "true";

  const tiers: Array<{
    minQuantity: number;
    pricePerUnit: number;
    showOnCard: boolean;
    sewingMultiplier: number | null;
  }> = [];
  if (Array.isArray(input.tiers)) {
    for (const row of input.tiers) {
      if (!row || typeof row !== "object") continue;
      const minQuantity = Number((row as { minQuantity?: unknown }).minQuantity);
      const pricePerUnit = Number((row as { pricePerUnit?: unknown }).pricePerUnit);
      const showOnCard =
        (row as { showOnCard?: unknown }).showOnCard === true ||
        (row as { showOnCard?: unknown }).showOnCard === "1" ||
        (row as { showOnCard?: unknown }).showOnCard === "true";
      const sewingRaw = (row as { sewingMultiplier?: unknown }).sewingMultiplier;
      const sewingMultiplier =
        sewingRaw != null &&
        sewingRaw !== "" &&
        Number.isFinite(Number(sewingRaw)) &&
        Number(sewingRaw) > 0
          ? Number(sewingRaw)
          : null;
      if (!Number.isFinite(minQuantity) || !Number.isFinite(pricePerUnit)) continue;
      if (minQuantity <= 0 || pricePerUnit < 0) continue;
      tiers.push({ minQuantity, pricePerUnit, showOnCard, sewingMultiplier });
    }
  }

  return { ok: true, isBaseModel, tiers };
}

export async function setProductCommercialPrices(input: {
  productId: string;
  isBaseModel: boolean;
  tiers: Array<{
    minQuantity: number;
    pricePerUnit: number;
    showOnCard?: boolean;
    sewingMultiplier?: number | null;
  }>;
}) {
  const tiers = input.tiers
    .filter((tier) => tier.minQuantity > 0 && tier.pricePerUnit >= 0)
    .sort((a, b) => a.minQuantity - b.minQuantity);

  const unique = new Map<
    number,
    { pricePerUnit: number; showOnCard: boolean; sewingMultiplier: number | null }
  >();
  for (const tier of tiers) {
    const sewing =
      tier.sewingMultiplier != null &&
      Number.isFinite(Number(tier.sewingMultiplier)) &&
      Number(tier.sewingMultiplier) > 0
        ? Number(tier.sewingMultiplier)
        : null;
    unique.set(tier.minQuantity, {
      pricePerUnit: tier.pricePerUnit,
      showOnCard: tier.showOnCard === true,
      sewingMultiplier: sewing,
    });
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: input.productId },
      data: { isBaseModel: input.isBaseModel },
    });
    await tx.productCommercialPriceTier.deleteMany({ where: { productId: input.productId } });
    if (unique.size > 0) {
      await tx.productCommercialPriceTier.createMany({
        data: [...unique.entries()].map(([minQuantity, row]) => ({
          productId: input.productId,
          minQuantity,
          pricePerUnit: row.pricePerUnit,
          showOnCard: row.showOnCard,
          sewingMultiplier: row.sewingMultiplier,
        })),
      });
    }
  });
}

export async function setProductCutRates(input: {
  productId: string;
  optimalQty?: number | null;
  tiers: Array<{ minQuantity: number; ratePerUnit: number }>;
}) {
  const tiers = input.tiers
    .filter((tier) => tier.minQuantity > 0 && tier.ratePerUnit >= 0)
    .sort((a, b) => a.minQuantity - b.minQuantity);

  // Dedupe by minQuantity (last wins)
  const unique = new Map<number, number>();
  for (const tier of tiers) unique.set(tier.minQuantity, tier.ratePerUnit);

  const sortedQtys = [...unique.keys()].sort((a, b) => a - b);
  const derivedOptimal = sortedQtys.length > 0 ? sortedQtys[sortedQtys.length - 1]! : null;
  const optimalQty =
    input.optimalQty != null && input.optimalQty > 0 ? input.optimalQty : derivedOptimal;

  // Floor: above optimal tirage, ₴/шт must not fall below the optimal row rate.
  if (optimalQty != null && unique.has(optimalQty)) {
    const floorRate = unique.get(optimalQty)!;
    for (const qty of sortedQtys) {
      if (qty > optimalQty) {
        const rate = unique.get(qty)!;
        if (rate < floorRate) unique.set(qty, floorRate);
      }
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id: input.productId },
      data: { optimalQty },
    });
    await tx.productCutRateTier.deleteMany({ where: { productId: input.productId } });
    if (unique.size > 0) {
      await tx.productCutRateTier.createMany({
        data: [...unique.entries()].map(([minQuantity, ratePerUnit]) => ({
          productId: input.productId,
          minQuantity,
          ratePerUnit,
        })),
      });
    }

    // Keep Розкрій rateOverride aligned with optimal-run rate for order snapshots.
    if (optimalQty != null && unique.has(optimalQty)) {
      const cutOps = await tx.productOperation.findMany({
        where: { productId: input.productId, operation: { nameUk: "Розкрій" } },
        select: { id: true },
      });
      for (const op of cutOps) {
        await tx.productOperation.update({
          where: { id: op.id },
          data: { rateOverride: unique.get(optimalQty)! },
        });
      }
    }
  });
}

async function uniqueProductNameUk(preferredName: string, fallbackBase?: string) {
  const preferred = preferredName.replace(/\s+/g, " ").trim();
  const base = (fallbackBase ?? preferred).replace(/\s+/g, " ").trim();
  const candidates = [
    preferred,
    `${base} (копія)`,
    ...Array.from({ length: 20 }, (_, index) => `${base} (копія ${index + 2})`),
  ].filter(Boolean);
  for (const nameUk of candidates) {
    const existing = await prisma.product.findFirst({
      where: { nameUk: { equals: nameUk, mode: "insensitive" } },
      select: { id: true },
    });
    if (!existing) return nameUk;
  }
  return `${base} (копія ${Date.now()})`;
}

/**
 * Quick catalog clone: full BOM + cut/price ladders under a new name.
 * Orders stay on the source; clone is never `isBaseModel`.
 */
export async function duplicateProduct(
  sourceId: string,
  options?: { nameUk?: string },
) {
  const source = await getProduct(sourceId);
  if (!source) throw new Error("PRODUCT_NOT_FOUND");

  const preferred =
    options?.nameUk?.replace(/\s+/g, " ").trim() || `${source.nameUk} (копія)`;
  const nameUk = await uniqueProductNameUk(preferred, source.nameUk);
  let internalCode: string | null = null;
  if (source.internalCode?.trim()) {
    const codeBase = `${source.internalCode.trim()}-COPY`;
    const codeTaken = await prisma.product.findFirst({
      where: { internalCode: { equals: codeBase, mode: "insensitive" } },
      select: { id: true },
    });
    internalCode = codeTaken ? `${codeBase}-${Date.now().toString(36)}` : codeBase;
  }

  return prisma.product.create({
    data: {
      nameUk,
      internalCode,
      description: source.description,
      imageUrl: source.imageUrl,
      categoryId: source.categoryId,
      status: "ACTIVE",
      isBaseModel: false,
      optimalQty: source.optimalQty,
      sizeChartVariantId: source.sizeChartVariantId,
      sizes: {
        create: source.sizes.map((row) => ({ sizeId: row.sizeId })),
      },
      materials: {
        create: source.materials.map((row) => ({
          materialId: row.materialId,
          consumptionPerUnit: row.consumptionPerUnit,
          wastePercent: row.wastePercent,
          note: row.note,
          sortOrder: row.sortOrder,
          supplierId: row.supplierId,
          colorSnapshot: row.colorSnapshot,
          sizeScopes: {
            create: row.sizeScopes.map((scope) => ({ sizeId: scope.sizeId })),
          },
          sizeNorms: {
            create: row.sizeNorms.map((norm) => ({
              sizeId: norm.sizeId,
              consumptionPerUnit: norm.consumptionPerUnit,
              wastePercent: norm.wastePercent,
            })),
          },
        })),
      },
      operations: {
        create: source.operations.map((row) => ({
          operationId: row.operationId,
          rateOverride: row.rateOverride,
          standardOverride: row.standardOverride,
          note: row.note,
          sortOrder: row.sortOrder,
          sizeScopes: {
            create: row.sizeScopes.map((scope) => ({ sizeId: scope.sizeId })),
          },
          rateTiers: {
            create: row.rateTiers.map((tier) => ({
              minQuantity: tier.minQuantity,
              ratePerUnit: tier.ratePerUnit,
            })),
          },
        })),
      },
      decorations: {
        create: source.decorations.map((row) => ({
          decorationMethodId: row.decorationMethodId,
          setupCostOverride: row.setupCostOverride,
          note: row.note,
        })),
      },
      additionalCosts: {
        create: source.additionalCosts.map((row) => ({
          nameUk: row.nameUk,
          amount: row.amount,
          isPerUnit: row.isPerUnit,
        })),
      },
      cutRateTiers: {
        create: source.cutRateTiers.map((tier) => ({
          minQuantity: tier.minQuantity,
          ratePerUnit: tier.ratePerUnit,
        })),
      },
      commercialPriceTiers: {
        create: source.commercialPriceTiers.map((tier) => ({
          minQuantity: tier.minQuantity,
          pricePerUnit: tier.pricePerUnit,
          showOnCard: tier.showOnCard,
          sewingMultiplier: tier.sewingMultiplier,
        })),
      },
    },
    include: productDetailInclude,
  });
}
