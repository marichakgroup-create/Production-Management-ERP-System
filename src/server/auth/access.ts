import { cache } from "react";
import { auth } from "@/server/auth";
import { prisma } from "@/server/db/client";
import {
  resolveUserPermissions,
  type Permission,
  type UserRole,
} from "@/lib/permissions";

export type UserAccess = {
  userId: string;
  role: UserRole;
  permissions: Permission[];
  name: string;
  email: string;
};

export const getCurrentUserAccess = cache(async (): Promise<UserAccess | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      role: true,
      permissions: true,
      isActive: true,
      name: true,
      email: true,
    },
  });

  if (!user?.isActive) return null;

  return {
    userId: user.id,
    role: user.role as UserRole,
    permissions: resolveUserPermissions({
      role: user.role as UserRole,
      permissions: user.permissions,
    }),
    name: user.name,
    email: user.email,
  };
});

export async function assertSessionPermission(permission: Permission): Promise<UserAccess> {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("UNAUTHORIZED");
  if (!access.permissions.includes(permission)) throw new Error("FORBIDDEN");
  return access;
}

export function accessHas(access: UserAccess | null, permission: Permission): boolean {
  return access?.permissions.includes(permission) ?? false;
}

/** After DRAFT, BOM edits require calc rights (admin). Managers assemble only in DRAFT. */
export function canEditOrderComposition(
  access: UserAccess | null,
  orderStatus: string,
): boolean {
  if (!access) return false;
  if (!accessHas(access, "manageOrders")) return false;
  if (orderStatus === "DRAFT") return true;
  return accessHas(access, "saveVersions");
}

/**
 * Tirage / size grid — editable for anyone with manageOrders until production.
 * Independent from BOM composition rights.
 */
export function canEditOrderQuantities(
  access: UserAccess | null,
  orderStatus: string,
): boolean {
  if (!access) return false;
  if (!accessHas(access, "manageOrders")) return false;
  return (
    orderStatus !== "HANDED_TO_PRODUCTION" &&
    orderStatus !== "CLOSED" &&
    orderStatus !== "CANCELLED"
  );
}

/**
 * Add / remove products in «Позиції замовлення».
 * Allowed in Чернетка and Розрахунок (same as assembling the line list);
 * later statuses follow composition rights (admin).
 */
export function canManageOrderItems(
  access: UserAccess | null,
  orderStatus: string,
): boolean {
  if (!access) return false;
  if (!accessHas(access, "manageOrders")) return false;
  if (orderStatus === "DRAFT" || orderStatus === "CALCULATION") return true;
  return canEditOrderComposition(access, orderStatus);
}

export function canViewOrderCosts(access: UserAccess | null): boolean {
  return accessHas(access, "viewProductCosts") || accessHas(access, "saveVersions");
}

/**
 * Money / VAT / supplier color / delivery / waste — admin (or cost-view grant).
 * Managers assemble DRAFT structure only; pricing is filled in later by admin.
 */
export function canEditOrderPricing(access: UserAccess | null): boolean {
  return canViewOrderCosts(access);
}

export async function assertCanEditOrderPricing(): Promise<UserAccess> {
  const access = await getCurrentUserAccess();
  if (!access) throw new Error("UNAUTHORIZED");
  if (!canEditOrderPricing(access)) throw new Error("FORBIDDEN");
  return access;
}
