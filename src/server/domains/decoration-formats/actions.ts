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
  try {
    const matrix = JSON.parse(raw) as DecorationFormatMatrixInput[];
    if (!Array.isArray(matrix)) {
      return { ok: false as const, error: "VALIDATION" as const };
    }
    await saveDecorationFormatsMatrix(matrix);
  } catch {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  revalidatePath("/settings/operations");
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

  const resolved = await resolveFormatUnitRate(input.formatId, item.totalQuantity);
  if (!resolved) {
    return { ok: false as const, error: "NO_RATE" as const };
  }

  await addOrderItemDecorationWithRates({
    orderItemId: input.orderItemId,
    nameUk: decorationFormatLineName(resolved.nameUk),
    setupCost: 0,
    unitRate: resolved.unitRate,
    decorationFormatId: input.formatId,
  });

  revalidatePath(`/orders/${input.orderId}`);
  return { ok: true as const, unitRate: resolved.unitRate };
}

export async function listDecorationFormatsForOrderAction() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return getDecorationFormatsCatalog();
}
