"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { assertSessionPermission } from "@/server/auth/access";
import { hasUserPermission } from "@/lib/permissions";
import { clientFormSchema, createClient, updateClient, archiveClients } from "@/server/domains/clients/service";

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
