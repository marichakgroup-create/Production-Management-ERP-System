"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { assertSessionPermission } from "@/server/auth/access";
import {
  archiveSuppliers,
  createSupplierContact,
  updateSupplierContact,
} from "@/server/domains/catalog/suppliers";

function parseSupplierForm(formData: FormData) {
  const cargoRaw = String(formData.get("defaultCargoUsdPerKg") ?? "").trim();
  const hasCargo = formData.has("defaultCargoUsdPerKg");
  const cargo =
    cargoRaw === "" ? null : Number(cargoRaw.replace(",", "."));
  return {
    nameUk: String(formData.get("nameUk") ?? ""),
    contactPerson: String(formData.get("contactPerson") ?? "").trim() || null,
    contactRoleUk: String(formData.get("contactRoleUk") ?? "").trim() || null,
    phone: String(formData.get("phone") ?? "").trim() || null,
    email: String(formData.get("email") ?? "").trim() || null,
    website: String(formData.get("website") ?? "").trim() || null,
    note: String(formData.get("note") ?? "").trim() || null,
    ...(hasCargo
      ? {
          defaultCargoUsdPerKg:
            cargo != null && Number.isFinite(cargo) && cargo >= 0 ? cargo : null,
        }
      : {}),
  };
}

export async function createSupplierContactAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const data = parseSupplierForm(formData);
  if (!data.nameUk.trim()) return { ok: false as const, error: "NAME_REQUIRED" as const };

  try {
    const row = await createSupplierContact(data);
    revalidatePath("/clients");
    revalidatePath("/settings/resources");
    return { ok: true as const, supplierId: row.id, nameUk: row.nameUk };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message.includes("Unique") || message.includes("unique")) {
      return { ok: false as const, error: "DUPLICATE_NAME" as const };
    }
    return { ok: false as const, error: "ERROR" as const };
  }
}

export async function updateSupplierContactAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, error: "INVALID" as const };

  const data = parseSupplierForm(formData);
  if (!data.nameUk.trim()) return { ok: false as const, error: "NAME_REQUIRED" as const };

  try {
    await updateSupplierContact(id, data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message.includes("Unique") || message.includes("unique")) {
      return { ok: false as const, error: "DUPLICATE_NAME" as const };
    }
    return { ok: false as const, error: "ERROR" as const };
  }

  revalidatePath("/clients");
  revalidatePath("/settings/resources");
  return { ok: true as const };
}

export async function bulkArchiveSuppliersAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false as const, error: "EMPTY" as const };

  const result = await archiveSuppliers(ids);
  revalidatePath("/clients");
  revalidatePath("/settings/resources");
  return { ok: true as const, count: result.count };
}
