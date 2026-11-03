"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { assertSessionPermission } from "@/server/auth/access";
import { hasUserPermission } from "@/lib/permissions";
import { PRODUCT_IMAGE_MAX_BYTES } from "@/lib/product-image";
import {
  addProductDecoration,
  addProductMaterial,
  addProductOperation,
  archiveProducts,
  copyProductSizeSpec,
  createProductDraft,
  getProduct,
  parseCutRateTiersInput,
  productFormSchema,
  removeProductMaterialFromSize,
  removeProductOperationFromSize,
  removeProductDecoration,
  reorderProductBomLines,
  setProductDecorationSetupCost,
  setProductMaterialConsumption,
  setProductMaterialWaste,
  setProductMaterialSizeNorm,
  setProductMaterialSizeWaste,
  setProductMaterialSupplierColor,
  setProductCutRates,
  setProductCommercialPrices,
  setProductImageUrl,
  setProductOperationRateTiers,
  setProductOperationRateOverride,
  parseCommercialPriceTiersInput,
  toCompositionTemplate,
  duplicateProduct,
  setProductSizes,
  updateProductIdentity,
} from "@/server/domains/products/service";

export async function createProductAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const sizeIds = formData.getAll("sizeIds").map(String).filter(Boolean);
  const sizeChartVariantId = String(formData.get("sizeChartVariantId") ?? "").trim() || null;
  let composition: {
    materials: Array<{ materialId: string; consumptionPerUnit: number; wastePercent?: number | null }>;
    operations: Array<{ operationId: string }>;
    decorations: Array<{ decorationMethodId: string }>;
  } = { materials: [], operations: [], decorations: [] };

  const compositionRaw = formData.get("compositionJson");
  if (typeof compositionRaw === "string" && compositionRaw.trim()) {
    try {
      composition = JSON.parse(compositionRaw) as typeof composition;
    } catch {
      return { ok: false as const, error: "VALIDATION" as const };
    }
  }

  const imageUrlRaw = String(formData.get("imageUrl") ?? "").trim();

  const parsed = productFormSchema.safeParse({
    nameUk: formData.get("nameUk"),
    internalCode: formData.get("internalCode") || null,
    description: formData.get("description") || null,
    imageUrl: imageUrlRaw || null,
    sizeIds,
    sizeChartVariantId,
    materials: Array.isArray(composition.materials) ? composition.materials : [],
    operations: Array.isArray(composition.operations) ? composition.operations : [],
    decorations: Array.isArray(composition.decorations) ? composition.decorations : [],
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  let cutRates: { optimalQty: number | null; tiers: Array<{ minQuantity: number; ratePerUnit: number }> } | null =
    null;
  const cutRatesRaw = formData.get("cutRatesJson");
  if (typeof cutRatesRaw === "string" && cutRatesRaw.trim()) {
    try {
      const parsedCutRates = parseCutRateTiersInput(JSON.parse(cutRatesRaw) as {
        optimalQty?: unknown;
        tiers?: unknown;
      });
      if (!parsedCutRates.ok) {
        return { ok: false as const, error: "VALIDATION" as const };
      }
      cutRates = parsedCutRates;
    } catch {
      return { ok: false as const, error: "VALIDATION" as const };
    }
  }

  const product = await createProductDraft(parsed.data);
  if (cutRates && (cutRates.optimalQty != null || cutRates.tiers.length > 0)) {
    await setProductCutRates({
      productId: product.id,
      optimalQty: cutRates.optimalQty,
      tiers: cutRates.tiers,
    });
  }

  let priceList: { isBaseModel: boolean; tiers: Array<{ minQuantity: number; pricePerUnit: number }> } | null =
    null;
  const priceListRaw = formData.get("priceListJson");
  if (typeof priceListRaw === "string" && priceListRaw.trim()) {
    try {
      const parsedPriceList = parseCommercialPriceTiersInput(JSON.parse(priceListRaw) as {
        isBaseModel?: unknown;
        tiers?: unknown;
      });
      if (!parsedPriceList.ok) {
        return { ok: false as const, error: "VALIDATION" as const };
      }
      priceList = parsedPriceList;
    } catch {
      return { ok: false as const, error: "VALIDATION" as const };
    }
  }

  if (priceList && (priceList.isBaseModel || priceList.tiers.length > 0)) {
    await setProductCommercialPrices({
      productId: product.id,
      isBaseModel: priceList.isBaseModel,
      tiers: priceList.tiers,
    });
  }

  const savedProduct =
    cutRates || priceList ? await getProduct(product.id) : product;
  if (!savedProduct) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  revalidatePath("/products");
  revalidatePath("/orders/new");

  const compositionPayload = toCompositionTemplate(savedProduct);

  return {
    ok: true as const,
    productId: savedProduct.id,
    nameUk: savedProduct.nameUk,
    internalCode: savedProduct.internalCode,
    imageUrl: savedProduct.imageUrl,
    label: savedProduct.internalCode
      ? `${savedProduct.nameUk} (${savedProduct.internalCode})`
      : savedProduct.nameUk,
    sizes: savedProduct.sizes.map((row) => ({
      code: row.size.code,
      nameUk: row.size.nameUk,
    })),
    materialsCount: savedProduct.materials.length,
    operationsCount: savedProduct.operations.length,
    decorationsCount: savedProduct.decorations.length,
    composition: compositionPayload,
  };
}

export async function uploadProductImageAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "EMPTY" as const };
  }
  if (file.size > PRODUCT_IMAGE_MAX_BYTES) {
    return { ok: false as const, error: "TOO_LARGE" as const };
  }

  const { isImageUpload, storeProductImage } = await import("@/lib/uploads");
  if (!isImageUpload(file)) {
    return { ok: false as const, error: "TYPE" as const };
  }

  const stored = await storeProductImage(file);
  if (!stored.ok) {
    return { ok: false as const, error: "UPLOAD" as const, message: stored.message };
  }
  return { ok: true as const, url: stored.url };
}

export async function updateProductImageAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const imageUrlRaw = String(formData.get("imageUrl") ?? "").trim();
  if (!productId) return { ok: false as const, error: "VALIDATION" as const };

  try {
    await setProductImageUrl(productId, imageUrlRaw || null);
  } catch {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  revalidatePath("/orders/new");
  return { ok: true as const, imageUrl: imageUrlRaw || null };
}

export async function updateProductIdentityAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const nameUk = String(formData.get("nameUk") ?? "").trim();
  const internalCodeRaw = String(formData.get("internalCode") ?? "").trim();
  const descriptionRaw = String(formData.get("description") ?? "").trim();
  if (!productId || !nameUk) return { ok: false as const, error: "VALIDATION" as const };

  try {
    await updateProductIdentity({
      productId,
      nameUk,
      internalCode: internalCodeRaw || null,
      description: descriptionRaw || null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "VALIDATION";
    if (message === "DUPLICATE_CODE") return { ok: false as const, error: "DUPLICATE_CODE" as const };
    if (message === "DUPLICATE_NAME") return { ok: false as const, error: "DUPLICATE_NAME" as const };
    return { ok: false as const, error: "VALIDATION" as const };
  }

  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  revalidatePath("/orders/new");
  return { ok: true as const };
}

export async function addProductMaterialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const materialId = String(formData.get("materialId") ?? "");
  const consumptionPerUnit = Number(formData.get("consumptionPerUnit"));
  const wasteRaw = formData.get("wastePercent");
  const wastePercent = wasteRaw === "" || wasteRaw == null ? null : Number(wasteRaw);
  const sizeIds = formData.getAll("sizeIds").map(String).filter(Boolean);

  if (!productId || !materialId || Number.isNaN(consumptionPerUnit)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await addProductMaterial({
    productId,
    materialId,
    consumptionPerUnit,
    wastePercent,
    sizeIds: sizeIds.length > 0 ? sizeIds : undefined,
  });
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function addProductOperationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const operationId = String(formData.get("operationId") ?? "");
  const sizeIds = formData.getAll("sizeIds").map(String).filter(Boolean);
  if (!productId || !operationId) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await addProductOperation({
    productId,
    operationId,
    sizeIds: sizeIds.length > 0 ? sizeIds : undefined,
  });
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function reorderProductBomAction(input: {
  productId: string;
  kind: "materials" | "operations";
  orderedIds: string[];
}) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(input.productId ?? "");
  const kind = input.kind;
  const orderedIds = Array.isArray(input.orderedIds) ? input.orderedIds.map(String) : [];
  if (!productId || (kind !== "materials" && kind !== "operations") || orderedIds.length === 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  try {
    await reorderProductBomLines({ productId, kind, orderedIds });
  } catch {
    return { ok: false as const, error: "REORDER_FAILED" as const };
  }
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function addProductDecorationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const decorationMethodId = String(formData.get("decorationMethodId") ?? "");
  if (!productId || !decorationMethodId) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await addProductDecoration({ productId, decorationMethodId });
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function updateProductDecorationSetupCostAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  const setupCost = Number(formData.get("setupCost"));

  if (!id || Number.isNaN(setupCost) || setupCost < 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await setProductDecorationSetupCost(id, setupCost);
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function updateProductMaterialConsumptionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  const consumptionPerUnit = Number(formData.get("consumptionPerUnit"));
  const sizeId = String(formData.get("sizeId") ?? "").trim() || null;

  if (!id || Number.isNaN(consumptionPerUnit) || consumptionPerUnit < 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  if (sizeId) {
    await setProductMaterialSizeNorm({
      productMaterialId: id,
      sizeId,
      consumptionPerUnit,
    });
  } else {
    await setProductMaterialConsumption(id, consumptionPerUnit);
  }
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function updateProductMaterialWasteAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  const wastePercent = Number(formData.get("wastePercent"));
  const sizeId = String(formData.get("sizeId") ?? "").trim() || null;

  if (!id || Number.isNaN(wastePercent) || wastePercent < 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  if (sizeId) {
    await setProductMaterialSizeWaste({
      productMaterialId: id,
      sizeId,
      wastePercent,
    });
  } else {
    await setProductMaterialWaste(id, wastePercent);
  }
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function updateProductMaterialSupplierColorAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  const hasSupplier = formData.has("supplierId");
  const hasColor = formData.has("colorSnapshot");
  const hasDelivery = formData.has("deliveryType");
  const supplierId = hasSupplier
    ? String(formData.get("supplierId") ?? "").trim() || null
    : undefined;
  const colorSnapshot = hasColor
    ? String(formData.get("colorSnapshot") ?? "").trim() || null
    : undefined;
  const deliveryType = hasDelivery
    ? String(formData.get("deliveryType") ?? "").trim() || null
    : undefined;

  await setProductMaterialSupplierColor({ id, supplierId, colorSnapshot, deliveryType });
  revalidatePath(`/products/${productId}`);
  revalidatePath("/orders");
  return { ok: true as const };
}

export async function removeProductMaterialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  const sizeId = String(formData.get("sizeId") ?? "").trim() || null;
  await removeProductMaterialFromSize({ productMaterialId: id, sizeId });
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function removeProductOperationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  const sizeId = String(formData.get("sizeId") ?? "").trim() || null;
  await removeProductOperationFromSize({ productOperationId: id, sizeId });
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function removeProductDecorationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  await removeProductDecoration(id);
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function copyProductSizeSpecAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const fromSizeId = String(formData.get("fromSizeId") ?? "");
  const toSizeIds = formData.getAll("toSizeId").map(String).filter(Boolean);
  if (!productId || !fromSizeId || toSizeIds.length === 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }
  await copyProductSizeSpec({ productId, fromSizeId, toSizeIds });
  revalidatePath(`/products/${productId}`);
  return { ok: true as const };
}

export async function updateProductCutRatesAction(
  input:
    | FormData
    | {
        productId: string;
        optimalQty?: number | null;
        tiers: Array<{ minQuantity: number; ratePerUnit: number }>;
      },
) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  let productId: string;
  let optimalQty: number | null;
  let tiers: Array<{ minQuantity: number; ratePerUnit: number }>;

  if (input instanceof FormData) {
    productId = String(input.get("productId") ?? "");
    const optimalRaw = String(input.get("optimalQty") ?? "").trim();
    optimalQty = optimalRaw ? Number(optimalRaw) : null;
    const minQuantities = input.getAll("tierMinQuantity").map(String);
    const rates = input.getAll("tierRate").map(String);
    tiers = [];
    for (let i = 0; i < minQuantities.length; i++) {
      const minQuantity = Number(minQuantities[i]);
      const ratePerUnit = Number(rates[i]);
      if (!Number.isFinite(minQuantity) || !Number.isFinite(ratePerUnit)) continue;
      if (minQuantity <= 0 || ratePerUnit < 0) continue;
      tiers.push({ minQuantity, ratePerUnit });
    }
  } else {
    productId = input.productId;
    optimalQty = input.optimalQty ?? null;
    tiers = input.tiers;
  }

  if (!productId) return { ok: false as const, error: "VALIDATION" as const };

  const parsed = parseCutRateTiersInput({ optimalQty, tiers });
  if (!parsed.ok) return { ok: false as const, error: "VALIDATION" as const };

  await setProductCutRates({ productId, optimalQty: parsed.optimalQty, tiers: parsed.tiers });
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true as const };
}

export async function updateProductOperationRateTiersAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const productOperationId = String(formData.get("productOperationId") ?? "");
  if (!productId || !productOperationId) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  let tiers: Array<{ minQuantity: number; ratePerUnit: number }> = [];
  const raw = formData.get("rateTiersJson");
  if (typeof raw === "string" && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        tiers = parsed
          .map((row) => ({
            minQuantity: Number((row as { minQuantity?: unknown }).minQuantity),
            ratePerUnit: Number((row as { ratePerUnit?: unknown }).ratePerUnit),
          }))
          .filter(
            (row) =>
              Number.isFinite(row.minQuantity) &&
              row.minQuantity > 0 &&
              Number.isFinite(row.ratePerUnit) &&
              row.ratePerUnit >= 0,
          );
      }
    } catch {
      return { ok: false as const, error: "VALIDATION" as const };
    }
  }

  if (tiers.length === 0) return { ok: false as const, error: "VALIDATION" as const };

  await setProductOperationRateTiers({ productOperationId, tiers });
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true as const };
}

export async function updateProductOperationRateAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const id = String(formData.get("id") ?? "");
  const rateRaw = formData.get("rateOverride");
  const clear = String(formData.get("clear") ?? "") === "1";

  if (!productId || !id) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const rateOverride = clear
    ? null
    : rateRaw === "" || rateRaw == null
      ? null
      : Number(rateRaw);

  if (rateOverride != null && (!Number.isFinite(rateOverride) || rateOverride < 0)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await setProductOperationRateOverride({ productOperationId: id, rateOverride });
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  return { ok: true as const };
}

export async function updateProductCommercialPricesAction(
  input:
    | FormData
    | {
        productId: string;
        isBaseModel?: boolean;
        tiers: Array<{
          minQuantity: number;
          pricePerUnit: number;
          showOnCard?: boolean;
          sewingMultiplier?: number | null;
        }>;
      },
) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  let productId: string;
  let isBaseModel: boolean;
  let tiers: Array<{
    minQuantity: number;
    pricePerUnit: number;
    showOnCard?: boolean;
    sewingMultiplier?: number | null;
  }>;

  if (input instanceof FormData) {
    productId = String(input.get("productId") ?? "");
    isBaseModel = input.get("isBaseModel") === "1";
    const minQuantities = input.getAll("tierMinQuantity").map(String);
    const prices = input.getAll("tierPrice").map(String);
    const multipliers = input.getAll("tierSewingMultiplier").map(String);
    tiers = [];
    for (let i = 0; i < minQuantities.length; i++) {
      const minQuantity = Number(minQuantities[i]);
      const pricePerUnit = Number(prices[i]);
      const sewingRaw = multipliers[i];
      const sewingMultiplier =
        sewingRaw != null && sewingRaw !== "" && Number.isFinite(Number(sewingRaw))
          ? Number(sewingRaw)
          : null;
      if (!Number.isFinite(minQuantity) || !Number.isFinite(pricePerUnit)) continue;
      if (minQuantity <= 0 || pricePerUnit < 0) continue;
      tiers.push({ minQuantity, pricePerUnit, sewingMultiplier });
    }
  } else {
    productId = input.productId;
    isBaseModel = input.isBaseModel === true;
    tiers = input.tiers;
  }

  if (!productId) return { ok: false as const, error: "VALIDATION" as const };

  const parsed = parseCommercialPriceTiersInput({ isBaseModel, tiers });
  if (!parsed.ok) return { ok: false as const, error: "VALIDATION" as const };

  await setProductCommercialPrices({
    productId,
    isBaseModel: parsed.isBaseModel,
    tiers: parsed.tiers,
  });
  revalidatePath(`/products/${productId}`);
  revalidatePath("/products");
  revalidatePath("/orders/new");
  return { ok: true as const };
}

export async function previewProductEconomicsAction(productId: string, quantity: number) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("viewProductCosts");

  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const product = await getProduct(productId);
  if (!product) return { ok: false as const, error: "NOT_FOUND" as const };

  const { buildCalcFromProduct, getPricingDefaults } = await import(
    "@/server/domains/calculation/from-entities"
  );
  const pricing = await getPricingDefaults();
  const { fixedCostOptionsFromDb } = await import("@/server/domains/fixed-costs/service");
  const fixedCosts = await fixedCostOptionsFromDb();
  const costCalc = buildCalcFromProduct(product, qty, {
    ...pricing,
    fixedCosts,
    quantityAwareMaterialPrices: true,
    sizeMode: "standard",
  });
  const {
    calcWithClientPrice,
    resolveSewingPerUnitFromOperations,
  } = await import("@/lib/product-selling");
  const sewingPerUnit = resolveSewingPerUnitFromOperations(
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
  const { calc, resolved } = calcWithClientPrice({
    costCalc,
    quantity: qty,
    product,
    sewingPerUnit,
  });

  return { ok: true as const, calc, quantity: qty, priceSource: resolved };
}

export async function bulkArchiveProductsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("archiveRecords");

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false as const, error: "EMPTY" as const };

  const result = await archiveProducts(ids);
  revalidatePath("/products");
  revalidatePath("/orders/new");
  return { ok: true as const, count: result.count };
}

export async function duplicateProductAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("saveAsStandardProduct");

  const productId = String(formData.get("productId") ?? "");
  const nameUk = String(formData.get("nameUk") ?? "").trim();
  if (!productId) return { ok: false as const, error: "INVALID" as const };
  if (!nameUk) return { ok: false as const, error: "NAME_REQUIRED" as const };

  try {
    const copy = await duplicateProduct(productId, { nameUk });
    revalidatePath("/products");
    revalidatePath("/orders/new");
    revalidatePath(`/products/${copy.id}`);
    return { ok: true as const, productId: copy.id, nameUk: copy.nameUk };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "PRODUCT_NOT_FOUND") {
      return { ok: false as const, error: "NOT_FOUND" as const };
    }
    return { ok: false as const, error: "ERROR" as const };
  }
}

export async function updateProductSizesAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const productId = String(formData.get("productId") ?? "");
  const sizeIds = formData.getAll("sizeIds").map(String).filter(Boolean);
  const sizeChartVariantIdRaw = String(formData.get("sizeChartVariantId") ?? "").trim();
  const sizeChartVariantId = formData.has("sizeChartVariantId")
    ? sizeChartVariantIdRaw || null
    : undefined;
  if (!productId) return { ok: false as const, error: "INVALID" as const };

  try {
    await setProductSizes({ productId, sizeIds, sizeChartVariantId });
    revalidatePath(`/products/${productId}`);
    revalidatePath("/orders/new");
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "PRODUCT_NOT_FOUND" || message === "PRODUCT_ARCHIVED") {
      return { ok: false as const, error: message as "PRODUCT_NOT_FOUND" | "PRODUCT_ARCHIVED" };
    }
    if (
      message === "SIZE_NOT_FOUND" ||
      message === "SIZE_VARIANT_MIXED" ||
      message === "SIZE_VARIANT_MISMATCH"
    ) {
      return { ok: false as const, error: "SIZE_NOT_FOUND" as const };
    }
    return { ok: false as const, error: "ERROR" as const };
  }
}
