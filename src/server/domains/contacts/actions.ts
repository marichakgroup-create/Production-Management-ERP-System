"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { assertSessionPermission } from "@/server/auth/access";
import {
  createClientContact,
  createSupplierContactPerson,
  deleteClientContact,
  deleteSupplierContactPerson,
  updateClientContact,
  updateSupplierContactPerson,
} from "@/server/domains/contacts/party-contacts";

function parsePerson(formData: FormData) {
  return {
    nameUk: String(formData.get("nameUk") ?? ""),
    roleUk: String(formData.get("roleUk") ?? "") || null,
    phone: String(formData.get("phone") ?? "") || null,
    email: String(formData.get("email") ?? "") || null,
    isPrimary: formData.get("isPrimary") === "1" || formData.get("isPrimary") === "on",
  };
}

function revalidateParty(clientId?: string | null, supplierId?: string | null) {
  revalidatePath("/clients");
  revalidatePath("/orders/new");
  if (clientId) {
    revalidatePath(`/clients/${clientId}`);
  }
  if (supplierId) {
    revalidatePath(`/clients/suppliers/${supplierId}`);
  }
}

export async function createClientContactAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return { ok: false as const, error: "VALIDATION" as const };

  try {
    const row = await createClientContact(clientId, parsePerson(formData));
    revalidateParty(clientId);
    return { ok: true as const, id: row.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "NAME_REQUIRED") return { ok: false as const, error: "VALIDATION" as const };
    console.error("[createClientContactAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}

export async function updateClientContactAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  try {
    const row = await updateClientContact(id, parsePerson(formData));
    revalidateParty(row.clientId);
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "NAME_REQUIRED") return { ok: false as const, error: "VALIDATION" as const };
    console.error("[updateClientContactAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}

export async function deleteClientContactAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const id = String(formData.get("id") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  try {
    await deleteClientContact(id);
    revalidateParty(clientId || null);
    return { ok: true as const };
  } catch (error) {
    console.error("[deleteClientContactAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}

export async function createSupplierContactPersonAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const supplierId = String(formData.get("supplierId") ?? "").trim();
  if (!supplierId) return { ok: false as const, error: "VALIDATION" as const };

  try {
    const row = await createSupplierContactPerson(supplierId, parsePerson(formData));
    revalidateParty(null, supplierId);
    return { ok: true as const, id: row.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "NAME_REQUIRED") return { ok: false as const, error: "VALIDATION" as const };
    console.error("[createSupplierContactPersonAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}

export async function updateSupplierContactPersonAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  try {
    const row = await updateSupplierContactPerson(id, parsePerson(formData));
    revalidateParty(null, row.supplierId);
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "NAME_REQUIRED") return { ok: false as const, error: "VALIDATION" as const };
    console.error("[updateSupplierContactPersonAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}

export async function deleteSupplierContactPersonAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageCatalogs");

  const id = String(formData.get("id") ?? "").trim();
  const supplierId = String(formData.get("supplierId") ?? "").trim();
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  try {
    await deleteSupplierContactPerson(id);
    revalidateParty(null, supplierId || null);
    return { ok: true as const };
  } catch (error) {
    console.error("[deleteSupplierContactPersonAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}
