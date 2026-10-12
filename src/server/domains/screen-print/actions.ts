"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { addOrderItemDecorationWithRates } from "@/server/domains/orders/service";
import {
  resolveScreenPrintUnitRate,
  screenPrintLineName,
} from "@/lib/screen-print-pricing";
import { prisma } from "@/server/db/client";
import {
  assertSessionPermission,
  canEditOrderComposition,
  getCurrentUserAccess,
} from "@/server/auth/access";
import {
  getScreenPrintCatalog,
  saveScreenPrintCoefficients,
  saveScreenPrintGrid,
} from "@/server/domains/screen-print/service";

export async function saveScreenPrintCatalogAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const gridRaw = String(formData.get("gridJson") ?? "");
  const coefRaw = String(formData.get("coefficientsJson") ?? "");
  try {
    const grid = JSON.parse(gridRaw) as Array<{
      minQuantity: number;
      colorCount: number;
      unitRate: number;
    }>;
    const coefficients = JSON.parse(coefRaw) as Array<{
      code: string;
      nameUk: string;
      factor: number;
      noteUk?: string | null;
    }>;
    if (!Array.isArray(grid) || !Array.isArray(coefficients)) {
      return { ok: false as const, error: "VALIDATION" as const };
    }
    await saveScreenPrintGrid(grid);
    await saveScreenPrintCoefficients(coefficients);
  } catch {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  revalidatePath("/settings/applications");
  revalidatePath("/orders");
  return { ok: true as const };
}

async function assertCanEditOrderScreenPrint(orderId: string) {
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

/**
 * Silk-screen line: enabled → always insert a new decoration row
 * (multiple prints / приладки per order item). disabled → no-op here
 * (rows are removed from the decorations table trash).
 */
export async function syncOrderScreenPrintAction(input: {
  orderId: string;
  orderItemId: string;
  enabled: boolean;
  colorCount: number;
  selectedCodes: string[];
}) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageOrders");
  await assertCanEditOrderScreenPrint(input.orderId);

  const item = await prisma.orderItem.findUnique({
    where: { id: input.orderItemId },
    include: { sizes: true },
  });
  if (!item || item.orderId !== input.orderId) {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  if (!input.enabled) {
    revalidatePath(`/orders/${input.orderId}`);
    return { ok: true as const, removed: false as const };
  }

  const catalog = await getScreenPrintCatalog();
  const quantity = item.sizes.reduce((sum, row) => sum + row.quantity, 0);
  const resolved = resolveScreenPrintUnitRate({
    quantity,
    colorCount: input.colorCount,
    cells: catalog.cells,
    coefficients: catalog.coefficients,
    selectedCodes: input.selectedCodes,
  });
  if (!resolved) {
    return { ok: false as const, error: "NO_RATE" as const };
  }

  const nameUk = screenPrintLineName({
    colorCount: resolved.colorCount,
    applied: resolved.applied,
  });

  await addOrderItemDecorationWithRates({
    orderItemId: input.orderItemId,
    nameUk,
    setupCost: 0,
    unitRate: resolved.unitRate,
  });

  revalidatePath(`/orders/${input.orderId}`);
  return {
    ok: true as const,
    unitRate: resolved.unitRate,
    baseRate: resolved.baseRate,
    bandQty: resolved.bandQty,
  };
}

/** @deprecated Prefer syncOrderScreenPrintAction — kept for any stale callers. */
export async function addOrderScreenPrintAction(input: {
  orderId: string;
  orderItemId: string;
  colorCount: number;
  selectedCodes: string[];
}) {
  return syncOrderScreenPrintAction({
    ...input,
    enabled: true,
  });
}
