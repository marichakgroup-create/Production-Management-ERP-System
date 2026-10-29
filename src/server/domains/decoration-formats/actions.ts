"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db/client";
import {
  assertSessionPermission,
  canEditOrderComposition,
  getCurrentUserAccess,
} from "@/server/auth/access";
import { addOrderItemDecorationWithRates } from "@/server/domains/orders/service";
import {
  decorationFormatLineName,
  MISC_DECORATION_COST_NAME,
} from "@/lib/decoration-format-pricing";
import {
  getDecorationFormatsCatalog,
  resolveFormatUnitRate,
  saveDecorationFormatsMatrix,
  type DecorationFormatMatrixInput,
} from "@/server/domains/decoration-formats/service";

export async function saveDecorationFormatsMatrixAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const raw = String(formData.get("matrixJson") ?? "");
  const kindRaw = String(formData.get("kind") ?? "DTF");
  const kind = kindRaw === "EMBROIDERY" ? "EMBROIDERY" : "DTF";
  try {
    const matrix = JSON.parse(raw) as DecorationFormatMatrixInput[];
    if (!Array.isArray(matrix)) {
      return { ok: false as const, error: "VALIDATION" as const };
    }
    await saveDecorationFormatsMatrix(matrix, kind);
  } catch {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  revalidatePath("/settings/applications");
  revalidatePath("/orders");
  return { ok: true as const };
}

async function assertCanEditOrderDecorations(orderId: string) {
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
}

/** Add a format×tirage decoration line (duplicates of the same format allowed). */
export async function addOrderDecorationFormatAction(input: {
  orderId: string;
  orderItemId: string;
  formatId: string;
  quantity?: number;
  /** Required when the catalog row is quoted individually. */
  unitRate?: number;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");
  await assertCanEditOrderDecorations(input.orderId);

  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: { id: true, orderId: true, totalQuantity: true },
  });
  if (!item || item.orderId !== input.orderId) {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  const rateQty = Math.max(1, Math.floor(Number(input.quantity) || item.totalQuantity));
  const resolved = await resolveFormatUnitRate(input.formatId, rateQty);
  if (!resolved) {
    return { ok: false as const, error: "NO_RATE" as const };
  }

  const unitRate = resolved.quoteIndividually
    ? Math.max(0, Number(input.unitRate) || 0)
    : resolved.unitRate;

  try {
    await addOrderItemDecorationWithRates({
      orderItemId: input.orderItemId,
      nameUk: decorationFormatLineName(resolved.nameUk, {
        kind: resolved.kind,
        detailUk: resolved.detailUk,
      }),
      setupCost: 0,
      unitRate,
      quantity: input.quantity,
      decorationFormatId: input.formatId,
    });
  } catch (error) {
    if (error instanceof Error && error.message === "OVER_QTY") {
      return { ok: false as const, error: "OVER_QTY" as const };
    }
    throw error;
  }

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const, unitRate };
}

/** Unplanned decoration cost for the tirage — unitRate × qty (not приладка). */
export async function addOrderMiscDecorationCostAction(input: {
  orderId: string;
  orderItemId: string;
  amount?: number;
  quantity?: number;
}) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");
  await assertCanEditOrderDecorations(input.orderId);

  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    select: { id: true, orderId: true },
  });
  if (!item || item.orderId !== input.orderId) {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  const amount = Math.max(0, Number(input.amount) || 0);

  await addOrderItemDecorationWithRates({
    orderItemId: input.orderItemId,
    nameUk: MISC_DECORATION_COST_NAME,
    setupCost: 0,
    unitRate: amount,
    quantity: input.quantity,
    decorationFormatId: null,
  });

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const };
}

export async function listDecorationFormatsForOrderAction() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return getDecorationFormatsCatalog();
}
