"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { assertSessionPermission } from "@/server/auth/access";
import { clientFormSchema, createClient, updateClient, archiveClients } from "@/server/domains/clients/service";
import {
  createClientLegalDetail,
  deleteClientLegalDetail,
  updateClientLegalDetail,
} from "@/server/domains/clients/legal-details";

export async function createClientAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const parsed = clientFormSchema.safeParse({
    companyName: formData.get("companyName"),
    contactPerson: formData.get("contactPerson") || null,
    contactRoleUk: formData.get("contactRoleUk") || null,
    phone: formData.get("phone") || null,
    email: formData.get("email") || null,
    website: formData.get("website") || null,
    legalDetails: formData.get("legalDetails") || null,
    note: formData.get("note") || null,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const client = await createClient(parsed.data);
  revalidatePath("/clients");
  revalidatePath("/orders/new");
  return {
    ok: true as const,
    clientId: client.id,
    companyName: client.companyName,
    contactPerson: client.contactPerson,
    phone: client.phone,
    email: client.email,
    contacts: client.contacts.map((person) => ({
      id: person.id,
      nameUk: person.nameUk,
      roleUk: person.roleUk,
      phone: person.phone,
      email: person.email,
      isPrimary: person.isPrimary,
    })),
  };
}

export async function updateClientAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, error: "INVALID" as const };

  const parsed = clientFormSchema.safeParse({
    companyName: formData.get("companyName"),
    contactPerson: formData.get("contactPerson") || null,
    contactRoleUk: formData.get("contactRoleUk") || null,
    phone: formData.get("phone") || null,
    email: formData.get("email") || null,
    website: formData.get("website") || null,
    legalDetails: formData.get("legalDetails") || null,
    note: formData.get("note") || null,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  try {
    await updateClient(id, parsed.data);
  } catch {
    return { ok: false as const, error: "ERROR" as const };
  }

  revalidatePath("/clients");
  revalidatePath(`/clients/${id}`);
  revalidatePath("/orders/new");
  return { ok: true as const };
}

export async function bulkArchiveClientsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const ids = formData.getAll("ids").map(String).filter(Boolean);
  if (ids.length === 0) return { ok: false as const, error: "EMPTY" as const };

  const result = await archiveClients(ids);
  revalidatePath("/clients");
  revalidatePath("/orders/new");
  return { ok: true as const, count: result.count };
}

function parseLegalDetail(formData: FormData) {
  return {
    nameUk: String(formData.get("nameUk") ?? ""),
    details: String(formData.get("details") ?? "") || null,
    isPrimary: formData.get("isPrimary") === "1" || formData.get("isPrimary") === "on",
  };
}

function revalidateClientLegal(clientId: string) {
  revalidatePath("/clients");
  revalidatePath(`/clients/${clientId}`);
  revalidatePath("/orders/new");
}

export async function createClientLegalDetailAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!clientId) return { ok: false as const, error: "VALIDATION" as const };

  try {
    const row = await createClientLegalDetail(clientId, parseLegalDetail(formData));
    revalidateClientLegal(clientId);
    return { ok: true as const, id: row.id };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "DETAILS_REQUIRED") return { ok: false as const, error: "VALIDATION" as const };
    console.error("[createClientLegalDetailAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}

export async function updateClientLegalDetailAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  try {
    const row = await updateClientLegalDetail(id, parseLegalDetail(formData));
    revalidateClientLegal(row.clientId);
    return { ok: true as const };
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "DETAILS_REQUIRED") return { ok: false as const, error: "VALIDATION" as const };
    console.error("[updateClientLegalDetailAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}

export async function deleteClientLegalDetailAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("manageClients");

  const id = String(formData.get("id") ?? "").trim();
  const clientId = String(formData.get("clientId") ?? "").trim();
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  try {
    await deleteClientLegalDetail(id);
    if (clientId) revalidateClientLegal(clientId);
    else revalidatePath("/clients");
    return { ok: true as const };
  } catch (error) {
    console.error("[deleteClientLegalDetailAction]", error);
    return { ok: false as const, error: "FAILED" as const };
  }
}
