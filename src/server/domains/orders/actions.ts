"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import {
  assertSessionPermission,
  getCurrentUserAccess,
  canEditOrderComposition,
  canEditOrderPricing,
  canManageOrderItems,
  canViewOrderCosts,
} from "@/server/auth/access";
import { hasUserPermission } from "@/lib/permissions";
import {
  ORDER_FILE_MAX_BYTES,
  ORDER_FILE_MAX_COUNT,
  orderFileAllowed,
} from "@/lib/order-files";
import {
  addOrderFile,
  addOrderItemDecoration,
  addOrderItemFromProduct,
  addOrderItemMaterial,
  addOrderItemOperation,
  activateProposal,
  approveVersion,
  approveProposal,
  cancelOrders,
  createOrderWithProducts,
  duplicateOrder,
  getOrder,
  handOverToProduction,
  removeOrderFile,
  updateOrderFileMeta,
  removeOrderItem,
  removeOrderItemDecoration,
  removeOrderItemMaterial,
  removeOrderItemOperation,
  saveCalculationVersion,
  saveProposal,
  startNewProposal,
  setOrderItemMaterialActualPrice,
  setOrderItemMaterialConsumption,
  copyOrderItemSizeSpec,
  updateOrderItemFabricDelivery,
  updateOrderItemSewerCountOverride,
  updateOrderItemMaterialTerms,
  getOrderItemMaterialDetail,
  updateOrderItemSizes,
  applyOrderItemSizeBreakdown,
  updateOrderStatus,
  updateOrderTargetMargin,
} from "@/server/domains/orders/service";
import {
  buildCalcFromOrderItem,
  calcOptionsFromProduct,
  getPricingForOrder,
  resolveFixedCostAllocationForOrderItem,
} from "@/server/domains/calculation/from-entities";
import { fixedCostOptionsFromDb } from "@/server/domains/fixed-costs/service";
import {
  fixedCostValidationMessage,
  validateFixedCostParams,
  resolveSewerCount,
} from "@/lib/fixed-costs";
import type { OrderStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/server/db/client";

async function assertCanEditOrderComposition(orderId: string) {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("UNAUTHORIZED");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) throw new Error("NOT_FOUND");
  if (!canEditOrderComposition(access, order.status)) {
    throw new Error("FORBIDDEN");
  }
  return { access, order };
}

async function assertCanManageOrderItems(orderId: string) {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("UNAUTHORIZED");
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: { status: true },
  });
  if (!order) throw new Error("NOT_FOUND");
  if (!canManageOrderItems(access, order.status)) {
    throw new Error("FORBIDDEN");
  }
  return { access, order };
}

const createOrderSchema = z.object({
  clientId: z.string().min(1),
  productId: z.string().optional().nullable(),
  title: z.string().optional().nullable(),
  deadline: z.string().optional().nullable(),
  comment: z.string().optional().nullable(),
  targetMarginPercent: z.coerce.number().min(0).max(99).optional().nullable(),
  itemsJson: z.string().optional().nullable(),
});

const draftItemSchema = z.object({
  productId: z.string().min(1),
  comment: z.string().optional().nullable(),
  sizeQuantities: z
    .array(
      z.object({
        sizeCode: z.string(),
        sizeNameUk: z.string(),
        quantity: z.coerce.number().nonnegative(),
      }),
    )
    .min(1),
  composition: z
    .object({
      materials: z.array(
        z.object({
          materialId: z.string().min(1),
          consumptionPerUnit: z.coerce.number().nonnegative(),
          wastePercent: z.coerce.number().nonnegative().optional().nullable(),
          sizeCode: z.string().optional().nullable(),
          sizeCodes: z.array(z.string()).optional().nullable(),
          sizeConsumption: z.record(z.string(), z.coerce.number().nonnegative()).optional(),
          purchasePrice: z.coerce.number().nonnegative().optional().nullable(),
          supplierId: z.string().trim().optional().nullable(),
          deliveryType: z
            .enum(["CARGO", "NP_STANDARD", "NP_VOLUME"])
            .optional()
            .nullable(),
          colorSnapshot: z.string().trim().optional().nullable(),
          cargoUsdPerKg: z.coerce.number().nonnegative().optional().nullable(),
          usdUahRate: z.coerce.number().positive().optional().nullable(),
          fabricDeliveryManual: z.boolean().optional(),
          fabricDeliveryAmount: z.coerce.number().nonnegative().optional().nullable(),
        }),
      ),
      operations: z.array(
        z.object({
          operationId: z.string().min(1),
          sizeCode: z.string().optional().nullable(),
          sizeCodes: z.array(z.string()).optional().nullable(),
        }),
      ),
      decorations: z.array(
        z.object({
          decorationMethodId: z.string().min(1),
          setupCost: z.coerce.number().nonnegative().optional().nullable(),
          unitRate: z.coerce.number().nonnegative().optional().nullable(),
        }),
      ),
    })
    .optional(),
});

export async function createOrderAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  const access = await assertSessionPermission("manageOrders");
  const allowPricing = canEditOrderPricing(access);

  const parsed = createOrderSchema.safeParse({
    clientId: formData.get("clientId"),
    productId: formData.get("productId") || null,
    title: formData.get("title") || null,
    deadline: formData.get("deadline") || null,
    comment: formData.get("comment") || null,
    targetMarginPercent: formData.get("targetMarginPercent") || null,
    itemsJson: formData.get("itemsJson") || null,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  let items: Array<{
    productId: string;
    comment?: string | null;
    sizeQuantities: Array<{ sizeCode: string; sizeNameUk: string; quantity: number }>;
    composition?: {
      materials: Array<{
        materialId: string;
        consumptionPerUnit: number;
        wastePercent?: number | null;
        sizeCode?: string | null;
        sizeCodes?: string[] | null;
        sizeConsumption?: Record<string, number>;
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
  }> = [];

  if (parsed.data.itemsJson) {
    try {
      const raw = JSON.parse(parsed.data.itemsJson);
      const list = z.array(draftItemSchema).safeParse(raw);
      if (!list.success) {
        return { ok: false as const, error: "VALIDATION" as const };
      }
      items = list.data.map((item) => ({
        productId: item.productId,
        comment: item.comment,
        sizeQuantities: item.sizeQuantities
          .map((s) => ({
            ...s,
            quantity: Math.max(0, Math.floor(Number(s.quantity) || 0)),
          }))
          .filter((s) => s.quantity > 0),
        composition: item.composition
          ? {
              materials: item.composition.materials.map((row) =>
                allowPricing
                  ? row
                  : {
                      materialId: row.materialId,
                      consumptionPerUnit: row.consumptionPerUnit,
                      sizeCode: row.sizeCode,
                      sizeCodes: row.sizeCodes,
                      sizeConsumption: row.sizeConsumption,
                      // Catalog defaults applied in service — no client waste/price/VAT/color/delivery.
                    },
              ),
              operations: item.composition.operations,
              // Screen print is configured on the order after create, never from product draft.
              decorations: [],
            }
          : undefined,
      }));
      if (items.length === 0 || items.some((item) => item.sizeQuantities.length === 0)) {
        return { ok: false as const, error: "QUANTITY_REQUIRED" as const };
      }
    } catch {
      return { ok: false as const, error: "VALIDATION" as const };
    }
  } else if (parsed.data.productId) {
    const sizeCodes = formData.getAll("sizeCode").map(String);
    const sizeNames = formData.getAll("sizeNameUk").map(String);
    const sizeQtys = formData.getAll("sizeQty").map((v) => Number(v));
    const sizeQuantities = sizeCodes.map((code, i) => ({
      sizeCode: code,
      sizeNameUk: sizeNames[i] || code,
      quantity: Number.isFinite(sizeQtys[i]) ? Math.max(0, Math.floor(sizeQtys[i])) : 0,
    }));
    if (sizeQuantities.every((s) => s.quantity <= 0)) {
      return { ok: false as const, error: "QUANTITY_REQUIRED" as const };
    }
    items = [
      {
        productId: parsed.data.productId,
        comment: parsed.data.comment,
        sizeQuantities,
      },
    ];
  }

  if (items.length === 0) {
    return { ok: false as const, error: "ITEMS_REQUIRED" as const };
  }

  let order;
  try {
    ({ order } = await createOrderWithProducts({
      clientId: parsed.data.clientId,
      managerId: session.user.id,
      title: parsed.data.title,
      deadline: parsed.data.deadline ? new Date(parsed.data.deadline) : null,
      targetMarginPercent: parsed.data.targetMarginPercent ?? null,
      items,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "PRODUCT_ARCHIVED") {
      return { ok: false as const, error: "PRODUCT_ARCHIVED" as const };
    }
    throw error;
  }

  revalidatePath("/orders");
  revalidatePath("/overview");
  return { ok: true as const, orderId: order.id };
}

export async function updateOrderSizesAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderItemId = String(formData.get("orderItemId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const sizeCodes = formData.getAll("sizeCode").map(String);
  const sizeNames = formData.getAll("sizeNameUk").map(String);
  const sizeQtys = formData.getAll("sizeQty").map((v) => Number(v));

  await updateOrderItemSizes(
    orderItemId,
    sizeCodes.map((code, i) => ({
      sizeCode: code,
      sizeNameUk: sizeNames[i] || code,
      quantity: Number.isFinite(sizeQtys[i]) ? Math.max(0, sizeQtys[i]) : 0,
    })),
  );

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function applyOrderItemSizeBreakdownAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderItemId = String(formData.get("orderItemId") ?? "");
  if (!orderId || !orderItemId) {
    return { ok: false as const, error: "VALIDATION" as const };
  }
  await assertCanEditOrderComposition(orderId);

  const sizeCodes = formData.getAll("sizeCode").map(String);
  const sizeNames = formData.getAll("sizeNameUk").map(String);
  const sizeQtys = formData.getAll("sizeQty").map((value) => Number(value));

  try {
    await applyOrderItemSizeBreakdown(
      orderItemId,
      sizeCodes.map((code, index) => ({
        sizeCode: code,
        sizeNameUk: sizeNames[index] || code,
        quantity: Number.isFinite(sizeQtys[index]) ? Math.max(0, Math.floor(sizeQtys[index])) : 0,
      })),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (
      message === "SIZES_SUM_MISMATCH" ||
      message === "SIZES_EMPTY" ||
      message === "ORDER_LOCKED" ||
      message === "ORDER_ITEM_LOCKED"
    ) {
      return { ok: false as const, error: message };
    }
    throw error;
  }

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function addOrderItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanManageOrderItems(orderId);
  const productId = String(formData.get("productId") ?? "");
  const sizeCodes = formData.getAll("sizeCode").map(String);
  const sizeNames = formData.getAll("sizeNameUk").map(String);
  const sizeQtys = formData.getAll("sizeQty").map((value) => Number(value));

  if (!orderId || !productId) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const sizeQuantities = sizeCodes.map((code, index) => ({
    sizeCode: code,
    sizeNameUk: sizeNames[index] || code,
    quantity: Number.isFinite(sizeQtys[index]) ? Math.max(0, Math.floor(sizeQtys[index])) : 0,
  }));

  try {
    const item = await addOrderItemFromProduct({
      orderId,
      productId,
      sizeQuantities,
      userId: session.user.id,
    });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/orders");
    revalidatePath("/overview");
    return { ok: true as const, itemId: item.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return { ok: false as const, error: message };
  }
}

export async function removeOrderItemAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanManageOrderItems(orderId);
  const orderItemId = String(formData.get("orderItemId") ?? "");
  if (!orderItemId) return { ok: false as const, error: "VALIDATION" as const };

  try {
    await removeOrderItem({ orderItemId, userId: session.user.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return { ok: false as const, error: message };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function addOrderMaterialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const { access } = await assertCanEditOrderComposition(orderId);
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const materialId = String(formData.get("materialId") ?? "");
  const consumptionPerUnit = Number(formData.get("consumptionPerUnit"));
  const wasteRaw = formData.get("wastePercent");
  const wastePercent =
    canEditOrderPricing(access) && wasteRaw !== "" && wasteRaw != null
      ? Number(wasteRaw)
      : null;

  const sizeCodeRaw = String(formData.get("sizeCode") ?? "").trim();
  const sizeCode = sizeCodeRaw && sizeCodeRaw !== "ALL" ? sizeCodeRaw : null;

  if (!orderItemId || !materialId || Number.isNaN(consumptionPerUnit)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await addOrderItemMaterial({
    orderItemId,
    materialId,
    consumptionPerUnit,
    wastePercent,
    sizeCode,
  });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function removeOrderMaterialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const id = String(formData.get("id") ?? "");
  const sizeCodeRaw = String(formData.get("sizeCode") ?? "").trim();
  const sizeCode = sizeCodeRaw && sizeCodeRaw !== "ALL" ? sizeCodeRaw : null;
  await removeOrderItemMaterial(id, sizeCode);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function addOrderOperationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const operationId = String(formData.get("operationId") ?? "");
  const sizeCodeRaw = String(formData.get("sizeCode") ?? "").trim();
  const sizeCode = sizeCodeRaw && sizeCodeRaw !== "ALL" ? sizeCodeRaw : null;

  if (!orderItemId || !operationId) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await addOrderItemOperation({ orderItemId, operationId, sizeCode });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function removeOrderOperationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const id = String(formData.get("id") ?? "");
  const sizeCodeRaw = String(formData.get("sizeCode") ?? "").trim();
  const sizeCode = sizeCodeRaw && sizeCodeRaw !== "ALL" ? sizeCodeRaw : null;
  await removeOrderItemOperation(id, sizeCode);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function addOrderDecorationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const decorationMethodId = String(formData.get("decorationMethodId") ?? "");

  if (!orderItemId || !decorationMethodId) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await addOrderItemDecoration({ orderItemId, decorationMethodId });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function removeOrderDecorationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const id = String(formData.get("id") ?? "");
  await removeOrderItemDecoration(id);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function updateOrderDecorationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const { access } = await assertCanEditOrderComposition(orderId);
  if (!canEditOrderPricing(access)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  const id = String(formData.get("id") ?? "");
  const setupRaw = String(formData.get("setupCost") ?? "").trim();
  const unitRaw = String(formData.get("unitRate") ?? "").trim();
  const setupCost = setupRaw === "" ? undefined : Number(setupRaw);
  const unitRate = unitRaw === "" ? undefined : Number(unitRaw);
  if (
    (setupCost != null && (Number.isNaN(setupCost) || setupCost < 0)) ||
    (unitRate != null && (Number.isNaN(unitRate) || unitRate < 0))
  ) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const { updateOrderItemDecoration } = await import("@/server/domains/orders/service");
  await updateOrderItemDecoration({ id, setupCost, unitRate });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function getOrderMaterialDetailAction(orderItemMaterialId: string) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  const access = await assertSessionPermission("manageOrders");
  if (!canViewOrderCosts(access)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }

  const detail = await getOrderItemMaterialDetail(orderItemMaterialId);
  if (!detail) return { ok: false as const, error: "NOT_FOUND" as const };
  return { ok: true as const, detail };
}

export async function updateOrderMaterialTermsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const { access } = await assertCanEditOrderComposition(orderId);
  const allowPricing = canEditOrderPricing(access);
  const id = String(formData.get("id") ?? "");
  const hasSupplierField = formData.has("supplierId");
  const supplierId = hasSupplierField
    ? String(formData.get("supplierId") ?? "").trim() || null
    : undefined;
  const hasColorField = formData.has("colorSnapshot");
  const colorSnapshot = hasColorField
    ? String(formData.get("colorSnapshot") ?? "").trim() || null
    : undefined;
  const cargoRaw = String(formData.get("cargoUsdPerKg") ?? "").trim();
  const cargoUsdPerKg = cargoRaw === "" ? null : Number(cargoRaw);
  const hasDeliveryTypeField = formData.has("deliveryType");
  const deliveryTypeRaw = String(formData.get("deliveryType") ?? "").trim();
  const deliveryType = hasDeliveryTypeField
    ? deliveryTypeRaw || null
    : undefined;
  const rateRaw = String(formData.get("usdUahRate") ?? "").trim();
  const usdUahRate = rateRaw === "" ? null : Number(rateRaw);
  const deliveryRaw = String(formData.get("fabricDeliveryAmount") ?? "").trim();
  const fabricDeliveryAmount = deliveryRaw === "" ? undefined : Number(deliveryRaw);
  const fabricDeliveryManual = formData.get("fabricDeliveryManual") === "1";

  const costVatRaw = String(formData.get("costVatOverride") ?? "").trim();
  const costVatOverride =
    costVatRaw === "" || costVatRaw === "COMPANY"
      ? null
      : costVatRaw === "NET" || costVatRaw === "GROSS"
        ? costVatRaw
        : undefined;
  const consumptionRaw = String(formData.get("consumptionPerUnit") ?? "").trim();
  const consumptionPerUnit =
    consumptionRaw === "" ? undefined : Number(consumptionRaw);
  const wasteRaw = String(formData.get("wastePercent") ?? "").trim();
  const wastePercent = wasteRaw === "" ? undefined : Number(wasteRaw);
  const thresholdRaw = String(formData.get("minWholesaleMetersOverride") ?? "").trim();
  const hasThresholdField = formData.has("minWholesaleMetersOverride");
  const minWholesaleMetersOverride = !hasThresholdField
    ? undefined
    : thresholdRaw === ""
      ? null
      : Number(thresholdRaw);

  if (!id) return { ok: false as const, error: "VALIDATION" as const };
  if (
    consumptionPerUnit != null &&
    (Number.isNaN(consumptionPerUnit) || consumptionPerUnit < 0)
  ) {
    return { ok: false as const, error: "VALIDATION" as const };
  }
  if (wastePercent != null && (Number.isNaN(wastePercent) || wastePercent < 0)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }
  if (cargoRaw !== "" && (Number.isNaN(cargoUsdPerKg!) || cargoUsdPerKg! < 0)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }
  if (rateRaw !== "" && (Number.isNaN(usdUahRate!) || usdUahRate! <= 0)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }
  if (
    deliveryRaw !== "" &&
    (fabricDeliveryAmount == null || Number.isNaN(fabricDeliveryAmount) || fabricDeliveryAmount < 0)
  ) {
    return { ok: false as const, error: "VALIDATION" as const };
  }
  if (
    minWholesaleMetersOverride != null &&
    (Number.isNaN(minWholesaleMetersOverride) || minWholesaleMetersOverride < 0)
  ) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  // Managers may only adjust consumption (BOM structure). Pricing fields need cost rights.
  if (!allowPricing) {
    if (
      hasSupplierField ||
      hasColorField ||
      formData.has("cargoUsdPerKg") ||
      formData.has("deliveryType") ||
      formData.has("usdUahRate") ||
      formData.has("fabricDeliveryAmount") ||
      formData.has("fabricDeliveryManual") ||
      formData.has("costVatOverride") ||
      wastePercent != null ||
      hasThresholdField
    ) {
      return { ok: false as const, error: "FORBIDDEN" as const };
    }
    if (consumptionPerUnit == null) {
      return { ok: false as const, error: "VALIDATION" as const };
    }
    await updateOrderItemMaterialTerms({ id, consumptionPerUnit });
    revalidatePath(`/orders/${orderId}`);
    return { ok: true as const };
  }

  await updateOrderItemMaterialTerms({
    id,
    ...(hasSupplierField ? { supplierId } : {}),
    ...(hasColorField ? { colorSnapshot } : {}),
    ...(formData.has("cargoUsdPerKg") ? { cargoUsdPerKg } : {}),
    ...(hasDeliveryTypeField ? { deliveryType } : {}),
    ...(formData.has("usdUahRate") ? { usdUahRate } : {}),
    ...(costVatOverride !== undefined ? { costVatOverride } : {}),
    ...(consumptionPerUnit != null ? { consumptionPerUnit } : {}),
    ...(wastePercent != null ? { wastePercent } : {}),
    ...(fabricDeliveryAmount != null ? { fabricDeliveryAmount } : {}),
    fabricDeliveryManual,
    ...(hasThresholdField ? { minWholesaleMetersOverride } : {}),
  });

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function updateOrderFabricDeliveryAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const { access } = await assertCanEditOrderComposition(orderId);
  if (!canEditOrderPricing(access)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const amount = Number(formData.get("amount"));
  const manual = formData.get("manual") === "1";

  if (!orderItemId || Number.isNaN(amount) || amount < 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await updateOrderItemFabricDelivery(orderItemId, { amount, manual });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function updateOrderItemSewerCountAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const { access } = await assertCanEditOrderComposition(orderId);
  if (!canEditOrderPricing(access)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const raw = String(formData.get("sewerCountOverride") ?? "").trim();
  const clear = formData.get("clearOverride") === "1" || raw === "";

  if (!orderItemId) return { ok: false as const, error: "VALIDATION" as const };

  let sewerCountOverride: number | null = null;
  if (!clear) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) {
      return { ok: false as const, error: "VALIDATION" as const };
    }
    sewerCountOverride = Math.floor(n);
  }

  await updateOrderItemSewerCountOverride(orderItemId, sewerCountOverride);
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function updateOrderMaterialConsumptionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const id = String(formData.get("id") ?? "");
  const consumptionPerUnit = Number(formData.get("consumptionPerUnit"));
  const sizeCodeRaw = String(formData.get("sizeCode") ?? "").trim();
  const sizeCode = sizeCodeRaw && sizeCodeRaw !== "ALL" ? sizeCodeRaw : null;

  if (!id || Number.isNaN(consumptionPerUnit) || consumptionPerUnit < 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await setOrderItemMaterialConsumption({ id, consumptionPerUnit, sizeCode });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function updateOrderMaterialActualPriceAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const { access } = await assertCanEditOrderComposition(orderId);
  if (!canEditOrderPricing(access)) {
    return { ok: false as const, error: "FORBIDDEN" as const };
  }
  const id = String(formData.get("id") ?? "");
  const raw = String(formData.get("actualPurchasePrice") ?? "").trim();
  const actualPurchasePrice = raw === "" ? null : Number(raw);

  if (!id || (actualPurchasePrice != null && !Number.isFinite(actualPurchasePrice))) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await setOrderItemMaterialActualPrice({ id, actualPurchasePrice });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function copyOrderSizeSpecAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  await assertCanEditOrderComposition(orderId);
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const fromSizeCode = String(formData.get("fromSizeCode") ?? "");
  const toSizeCodes = formData.getAll("toSizeCode").map(String).filter(Boolean);

  if (!orderItemId || !fromSizeCode || toSizeCodes.length === 0) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await copyOrderItemSizeSpec({ orderItemId, fromSizeCode, toSizeCodes });
  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function saveVersionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("saveVersions");

  const orderId = String(formData.get("orderId") ?? "");
  const orderItemId = String(formData.get("orderItemId") ?? "");
  const label = String(formData.get("label") ?? "") || null;
  const comment = String(formData.get("comment") ?? "") || null;
  const manualPriceRaw = formData.get("manualSellingPrice");
  const manualSellingPricePerUnit =
    manualPriceRaw === "" || manualPriceRaw == null ? null : Number(manualPriceRaw);

  const order = await getOrder(orderId);
  const item = order?.items.find((i) => i.id === orderItemId);
  if (!item) return { ok: false as const, error: "NOT_FOUND" as const };

  const pricing = await getPricingForOrder(orderId);
  const fixedCosts = await fixedCostOptionsFromDb();
  const { sewerCount } = resolveSewerCount({
    companySewerCount: fixedCosts?.companySewerCount ?? 0,
    orderOverride: item.sewerCountOverride,
  });
  const paramsInvalid = fixedCosts
    ? validateFixedCostParams({
        workingDaysPerMonth: fixedCosts.workingDaysPerMonth,
        sewerCount,
        dailySewerPay: fixedCosts.dailySewerPay,
        monthlyTotal: fixedCosts.monthlyTotal,
      })
    : "MONTHLY_TOTAL_ZERO";
  if (paramsInvalid) {
    return {
      ok: false as const,
      error: "FIXED_COSTS_INVALID" as const,
      message: fixedCostValidationMessage(paramsInvalid),
    };
  }

  const calcOptions = {
    ...calcOptionsFromProduct(item.product),
    fixedCosts,
  };
  const calc = buildCalcFromOrderItem(
    item,
    {
      ...pricing,
      manualSellingPricePerUnit,
    },
    calcOptions,
  );
  const fixedCostAllocation = fixedCosts
    ? resolveFixedCostAllocationForOrderItem(item, fixedCosts, calcOptions, pricing.sizeRules)
    : null;

  const version = await saveCalculationVersion({
    orderItemId,
    authorId: session.user.id,
    label,
    comment,
    snapshot: {
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
      calc,
      pricing,
      manualSellingPricePerUnit,
      fixedCosts: fixedCostAllocation
        ? {
            params: fixedCosts,
            allocation: fixedCostAllocation,
          }
        : null,
    },
    totals: {
      costPerUnit: Number(calc.costPerUnit),
      totalCost: Number(calc.totalCost),
      sellingPricePerUnit: Number(calc.sellingPricePerUnit),
      totalSellingValue: Number(calc.totalSellingValue),
      profitAmount: Number(calc.profitAmount),
      marginPercent: Number(calc.marginPercent),
    },
  });

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const, versionId: version.id, versionNumber: version.versionNumber };
}

export async function saveProposalAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("saveVersions");

  const orderId = String(formData.get("orderId") ?? "");
  const label = String(formData.get("label") ?? "") || null;
  const comment = String(formData.get("comment") ?? "") || null;
  const linesJson = String(formData.get("linesJson") ?? "[]");

  let lines: Array<{
    orderItemId: string;
    manualSellingPricePerUnit?: number | null;
    discountPercent?: number | null;
  }>;
  try {
    lines = JSON.parse(linesJson) as Array<{
      orderItemId: string;
      manualSellingPricePerUnit?: number | null;
      discountPercent?: number | null;
    }>;
  } catch {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const order = await getOrder(orderId);
  if (!order) return { ok: false as const, error: "NOT_FOUND" as const };

  const pricing = await getPricingForOrder(orderId);
  const fixedCosts = await fixedCostOptionsFromDb();
  for (const line of lines) {
    const item = order.items.find((row) => row.id === line.orderItemId);
    if (!item) return { ok: false as const, error: "NOT_FOUND" as const };
    const { sewerCount } = resolveSewerCount({
      companySewerCount: fixedCosts?.companySewerCount ?? 0,
      orderOverride: item.sewerCountOverride,
    });
    const paramsInvalid = fixedCosts
      ? validateFixedCostParams({
          workingDaysPerMonth: fixedCosts.workingDaysPerMonth,
          sewerCount,
          dailySewerPay: fixedCosts.dailySewerPay,
          monthlyTotal: fixedCosts.monthlyTotal,
        })
      : "MONTHLY_TOTAL_ZERO";
    if (paramsInvalid) {
      return {
        ok: false as const,
        error: "FIXED_COSTS_INVALID" as const,
        message: fixedCostValidationMessage(paramsInvalid),
      };
    }
  }

  try {
    const result = await saveProposal({
      orderId,
      authorId: session.user.id,
      label,
      comment,
      lines,
    });
    revalidatePath(`/orders/${orderId}`);
    revalidatePath("/overview");
    return { ok: true as const, proposalRevision: result.proposalRevision };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "ORDER_LOCKED") {
      return { ok: false as const, error: "ORDER_LOCKED" as const };
    }
    if (message === "USE_NEW_PROPOSAL") {
      return { ok: false as const, error: "USE_NEW_PROPOSAL" as const };
    }
    return { ok: false as const, error: message };
  }
}

export async function startNewProposalAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("saveVersions");

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false as const, error: "VALIDATION" as const };

  try {
    await startNewProposal(orderId, session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "NOT_APPROVED") {
      return { ok: false as const, error: "NOT_APPROVED" as const };
    }
    if (message === "ORDER_NOT_FOUND") {
      return { ok: false as const, error: "NOT_FOUND" as const };
    }
    return { ok: false as const, error: "FAILED" as const };
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function activateProposalAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("saveVersions");

  const orderId = String(formData.get("orderId") ?? "");
  const proposalRevision = Number(formData.get("proposalRevision") ?? "");
  if (!orderId || !Number.isFinite(proposalRevision)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  try {
    await activateProposal(orderId, proposalRevision, session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "ORDER_LOCKED") {
      return { ok: false as const, error: "ORDER_LOCKED" as const };
    }
    if (message === "PROPOSAL_NOT_FOUND") {
      return { ok: false as const, error: "NOT_FOUND" as const };
    }
    if (message === "SNAPSHOT_INCOMPLETE") {
      return { ok: false as const, error: "SNAPSHOT_INCOMPLETE" as const };
    }
    return { ok: false as const, error: "FAILED" as const };
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function approveProposalAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("changeOrderStatus");

  const orderId = String(formData.get("orderId") ?? "");
  const proposalRevision = Number(formData.get("proposalRevision") ?? "");
  if (!orderId || !Number.isFinite(proposalRevision)) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  try {
    await approveProposal(orderId, proposalRevision, session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "INCOMPLETE_PROPOSAL") {
      return { ok: false as const, error: "INCOMPLETE_PROPOSAL" as const };
    }
    return { ok: false as const, error: "APPROVE_FAILED" as const };
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function approveVersionAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("changeOrderStatus");

  const orderId = String(formData.get("orderId") ?? "");
  const versionId = String(formData.get("versionId") ?? "");
  try {
    await approveVersion(versionId, session.user.id);
  } catch (error) {
    throw error;
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function handOverAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("changeOrderStatus");

  const orderId = String(formData.get("orderId") ?? "");
  try {
    await handOverToProduction(orderId, session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    return { ok: false as const, error: message };
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}


export async function submitOrderForCalculationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false as const, error: "VALIDATION" as const };

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      status: true,
      items: {
        select: {
          totalQuantity: true,
          _count: { select: { materials: true, operations: true } },
        },
      },
    },
  });
  if (!order) return { ok: false as const, error: "NOT_FOUND" as const };
  if (order.status !== "DRAFT") {
    return { ok: false as const, error: "NOT_DRAFT" as const };
  }
  // Empty draft may move to calculation; incomplete lines still block.
  const incomplete = order.items.some(
    (item) =>
      item.totalQuantity <= 0 ||
      item._count.materials <= 0 ||
      item._count.operations <= 0,
  );
  if (incomplete) {
    return { ok: false as const, error: "INCOMPLETE" as const };
  }

  await updateOrderStatus(orderId, "CALCULATION", session.user.id);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function setOrderStatusAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("changeOrderStatus");

  const orderId = String(formData.get("orderId") ?? "");
  const status = String(formData.get("status") ?? "") as OrderStatus;
  try {
    await updateOrderStatus(orderId, status, session.user.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "EMPTY_ORDER_NOT_ALLOWED") {
      return { ok: false as const, error: "EMPTY_ORDER_NOT_ALLOWED" as const };
    }
    if (message === "ORDER_NOT_FOUND") {
      return { ok: false as const, error: "NOT_FOUND" as const };
    }
    throw error;
  }
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function bulkCancelOrdersAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false as const, error: "EMPTY" as const };

  const result = await cancelOrders(ids, session.user.id);
  revalidatePath("/orders");
  revalidatePath("/overview");
  return { ok: true as const, count: result.count };
}

export async function cancelOrderAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false as const, error: "VALIDATION" as const };

  const result = await cancelOrders([orderId], session.user.id);
  if (result.count === 0) return { ok: false as const, error: "NOT_FOUND" as const };

  revalidatePath("/orders");
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function duplicateOrderAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  if (!orderId) return { ok: false as const, error: "VALIDATION" as const };

  try {
    const order = await duplicateOrder({ orderId, userId: session.user.id });
    revalidatePath("/orders");
    revalidatePath("/overview");
    return { ok: true as const, orderId: order.id, number: order.number };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "NOT_FOUND") return { ok: false as const, error: "NOT_FOUND" as const };
    return { ok: false as const, error: "ERROR" as const };
  }
}

export async function updateOrderMarginAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("viewProductCosts");

  const orderId = String(formData.get("orderId") ?? "");
  const raw = formData.get("targetMarginPercent");
  const useDefault = String(formData.get("useDefault") ?? "") === "1";

  let targetMarginPercent: number | null = null;
  if (!useDefault) {
    const value = Number(raw);
    if (!orderId || !Number.isFinite(value) || value < 0 || value > 99) {
      return { ok: false as const, error: "VALIDATION" as const };
    }
    targetMarginPercent = value;
  }

  if (!orderId) return { ok: false as const, error: "VALIDATION" as const };

  await updateOrderTargetMargin(orderId, targetMarginPercent);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/orders");
  return { ok: true as const };
}

export async function uploadOrderFileAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const orderItemIdRaw = String(formData.get("orderItemId") ?? "").trim();
  const decorationIdRaw = String(formData.get("orderItemDecorationId") ?? "").trim();
  const caption = String(formData.get("caption") ?? "").trim() || null;
  const file = formData.get("file");
  if (!orderId) return { ok: false as const, error: "VALIDATION" as const };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false as const, error: "EMPTY" as const };
  }
  if (file.size > ORDER_FILE_MAX_BYTES) {
    return { ok: false as const, error: "TOO_LARGE" as const };
  }
  if (!orderFileAllowed(file)) {
    return { ok: false as const, error: "TYPE" as const };
  }

  const order = await getOrder(orderId);
  if (!order) return { ok: false as const, error: "NOT_FOUND" as const };
  if (
    order.status === "CANCELLED" ||
    order.status === "HANDED_TO_PRODUCTION" ||
    order.status === "CLOSED"
  ) {
    return { ok: false as const, error: "ORDER_LOCKED" as const };
  }
  if (order.files.length >= ORDER_FILE_MAX_COUNT) {
    return { ok: false as const, error: "TOO_MANY" as const };
  }

  let orderItemId: string | null = orderItemIdRaw || null;
  let orderItemDecorationId: string | null = decorationIdRaw || null;

  if (orderItemDecorationId) {
    const match = order.items
      .flatMap((item) =>
        item.decorations.map((decoration) => ({
          decorationId: decoration.id,
          orderItemId: item.id,
          nameSnapshot: decoration.nameSnapshot,
        })),
      )
      .find((row) => row.decorationId === orderItemDecorationId);
    if (!match) return { ok: false as const, error: "DECORATION" as const };
    orderItemId = match.orderItemId;
    if (!caption) {
      // Auto-caption from decoration when caller did not pass one.
    }
  } else if (orderItemId) {
    const match = order.items.find((item) => item.id === orderItemId);
    if (!match) return { ok: false as const, error: "ITEM" as const };
  }

  try {
    const { storeOrderFile } = await import("@/lib/uploads");
    const stored = await storeOrderFile(orderId, file);
    if (!stored.ok) {
      return { ok: false as const, error: "UPLOAD" as const, message: stored.message };
    }

    let resolvedCaption = caption;
    if (!resolvedCaption && orderItemDecorationId) {
      const decoration = order.items
        .flatMap((item) => item.decorations)
        .find((row) => row.id === orderItemDecorationId);
      if (decoration) {
        const { decorationDisplayName } = await import("@/lib/decoration-format-pricing");
        resolvedCaption = decorationDisplayName(decoration.nameSnapshot);
      }
    }

    await addOrderFile({
      orderId,
      orderItemId,
      orderItemDecorationId,
      fileName: file.name,
      mimeType: file.type || "application/octet-stream",
      sizeBytes: file.size,
      storageKey: stored.storageKey,
      caption: resolvedCaption,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "ORDER_ITEM_NOT_FOUND") {
      return { ok: false as const, error: "ITEM" as const };
    }
    if (error instanceof Error && error.message === "ORDER_DECORATION_NOT_FOUND") {
      return { ok: false as const, error: "DECORATION" as const };
    }
    return { ok: false as const, error: "UPLOAD" as const };
  }

  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}

export async function updateOrderFileMetaAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  if (!orderId || !fileId) return { ok: false as const, error: "VALIDATION" as const };

  const captionRaw = formData.get("caption");
  const itemRaw = formData.get("orderItemId");
  const decorationRaw = formData.get("orderItemDecorationId");
  try {
    await updateOrderFileMeta({
      fileId,
      ...(captionRaw !== null ? { caption: String(captionRaw) } : {}),
      ...(itemRaw !== null ? { orderItemId: String(itemRaw).trim() || null } : {}),
      ...(decorationRaw !== null
        ? { orderItemDecorationId: String(decorationRaw).trim() || null }
        : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "ORDER_LOCKED") return { ok: false as const, error: "ORDER_LOCKED" as const };
    if (message === "ORDER_ITEM_NOT_FOUND") return { ok: false as const, error: "ITEM" as const };
    if (message === "ORDER_DECORATION_NOT_FOUND") {
      return { ok: false as const, error: "DECORATION" as const };
    }
    if (message === "NOT_FOUND") return { ok: false as const, error: "NOT_FOUND" as const };
    return { ok: false as const, error: "ERROR" as const };
  }

  revalidatePath(`/orders/${orderId}`);
  return { ok: true as const };
}

export async function deleteOrderFileAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");

  const orderId = String(formData.get("orderId") ?? "");
  const fileId = String(formData.get("fileId") ?? "");
  if (!orderId || !fileId) return { ok: false as const, error: "VALIDATION" as const };

  const order = await getOrder(orderId);
  if (!order) return { ok: false as const, error: "NOT_FOUND" as const };
  const asset = order.files.find((row) => row.id === fileId);
  if (!asset) return { ok: false as const, error: "NOT_FOUND" as const };
  if (
    order.status === "HANDED_TO_PRODUCTION" ||
    order.status === "CLOSED" ||
    order.status === "CANCELLED"
  ) {
    return { ok: false as const, error: "ORDER_LOCKED" as const };
  }

  try {
    const { removeStoredOrderFile } = await import("@/lib/uploads");
    await removeStoredOrderFile(asset.storageKey);
  } catch {
    // Still drop the DB row so the order is not stuck with a dead attachment.
  }

  await removeOrderFile(fileId);
  revalidatePath(`/orders/${orderId}`);
  revalidatePath("/overview");
  return { ok: true as const };
}
