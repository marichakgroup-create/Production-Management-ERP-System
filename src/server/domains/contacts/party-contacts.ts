import { prisma } from "@/server/db/client";
import { normalizePartyContact, type PartyContactInput } from "@/lib/party-contacts";

export async function listClientContacts(clientId: string) {
  return prisma.clientContact.findMany({
    where: { clientId },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { nameUk: "asc" }],
  });
}

export async function listSupplierContacts(supplierId: string) {
  return prisma.supplierContact.findMany({
    where: { supplierId },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { nameUk: "asc" }],
  });
}

async function clearOtherClientPrimaries(clientId: string, keepId?: string) {
  await prisma.clientContact.updateMany({
    where: {
      clientId,
      isPrimary: true,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
    data: { isPrimary: false },
  });
}

async function clearOtherSupplierPrimaries(supplierId: string, keepId?: string) {
  await prisma.supplierContact.updateMany({
    where: {
      supplierId,
      isPrimary: true,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
    data: { isPrimary: false },
  });
}

export async function createClientContact(clientId: string, raw: PartyContactInput) {
  const data = normalizePartyContact(raw);
  if (!data) throw new Error("NAME_REQUIRED");
  const count = await prisma.clientContact.count({ where: { clientId } });
  const isPrimary = data.isPrimary || count === 0;
  if (isPrimary) await clearOtherClientPrimaries(clientId);
  const created = await prisma.clientContact.create({
    data: {
      clientId,
      nameUk: data.nameUk,
      roleUk: data.roleUk,
      phone: data.phone,
      email: data.email,
      isPrimary,
      sortOrder: count,
    },
  });
  // Keep legacy single-field mirror for older UI/print.
  if (isPrimary) {
    await prisma.client.update({
      where: { id: clientId },
      data: {
        contactPerson: created.nameUk,
        phone: created.phone,
        email: created.email,
      },
    });
  }
  return created;
}

export async function updateClientContact(id: string, raw: PartyContactInput) {
  const data = normalizePartyContact(raw);
  if (!data) throw new Error("NAME_REQUIRED");
  const existing = await prisma.clientContact.findUniqueOrThrow({ where: { id } });
  if (data.isPrimary) await clearOtherClientPrimaries(existing.clientId, id);
  const updated = await prisma.clientContact.update({
    where: { id },
    data: {
      nameUk: data.nameUk,
      roleUk: data.roleUk,
      phone: data.phone,
      email: data.email,
      isPrimary: data.isPrimary ?? existing.isPrimary,
    },
  });
  if (updated.isPrimary) {
    await prisma.client.update({
      where: { id: existing.clientId },
      data: {
        contactPerson: updated.nameUk,
        phone: updated.phone,
        email: updated.email,
      },
    });
  }
  return updated;
}

export async function deleteClientContact(id: string) {
  const existing = await prisma.clientContact.findUniqueOrThrow({ where: { id } });
  await prisma.clientContact.delete({ where: { id } });
  if (existing.isPrimary) {
    const next = await prisma.clientContact.findFirst({
      where: { clientId: existing.clientId },
      orderBy: [{ sortOrder: "asc" }, { nameUk: "asc" }],
    });
    if (next) {
      await prisma.clientContact.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
      await prisma.client.update({
        where: { id: existing.clientId },
        data: {
          contactPerson: next.nameUk,
          phone: next.phone,
          email: next.email,
        },
      });
    } else {
      await prisma.client.update({
        where: { id: existing.clientId },
        data: { contactPerson: null },
      });
    }
  }
}

export async function createSupplierContactPerson(supplierId: string, raw: PartyContactInput) {
  const data = normalizePartyContact(raw);
  if (!data) throw new Error("NAME_REQUIRED");
  const count = await prisma.supplierContact.count({ where: { supplierId } });
  const isPrimary = data.isPrimary || count === 0;
  if (isPrimary) await clearOtherSupplierPrimaries(supplierId);
  const created = await prisma.supplierContact.create({
    data: {
      supplierId,
      nameUk: data.nameUk,
      roleUk: data.roleUk,
      phone: data.phone,
      email: data.email,
      isPrimary,
      sortOrder: count,
    },
  });
  if (isPrimary) {
    await prisma.supplier.update({
      where: { id: supplierId },
      data: {
        contactPerson: created.nameUk,
        phone: created.phone,
        email: created.email,
      },
    });
  }
  return created;
}

export async function updateSupplierContactPerson(id: string, raw: PartyContactInput) {
  const data = normalizePartyContact(raw);
  if (!data) throw new Error("NAME_REQUIRED");
  const existing = await prisma.supplierContact.findUniqueOrThrow({ where: { id } });
  if (data.isPrimary) await clearOtherSupplierPrimaries(existing.supplierId, id);
  const updated = await prisma.supplierContact.update({
    where: { id },
    data: {
      nameUk: data.nameUk,
      roleUk: data.roleUk,
      phone: data.phone,
      email: data.email,
      isPrimary: data.isPrimary ?? existing.isPrimary,
    },
  });
  if (updated.isPrimary) {
    await prisma.supplier.update({
      where: { id: existing.supplierId },
      data: {
        contactPerson: updated.nameUk,
        phone: updated.phone,
        email: updated.email,
      },
    });
  }
  return updated;
}

export async function deleteSupplierContactPerson(id: string) {
  const existing = await prisma.supplierContact.findUniqueOrThrow({ where: { id } });
  await prisma.supplierContact.delete({ where: { id } });
  if (existing.isPrimary) {
    const next = await prisma.supplierContact.findFirst({
      where: { supplierId: existing.supplierId },
      orderBy: [{ sortOrder: "asc" }, { nameUk: "asc" }],
    });
    if (next) {
      await prisma.supplierContact.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
      await prisma.supplier.update({
        where: { id: existing.supplierId },
        data: {
          contactPerson: next.nameUk,
          phone: next.phone,
          email: next.email,
        },
      });
    } else {
      await prisma.supplier.update({
        where: { id: existing.supplierId },
        data: { contactPerson: null },
      });
    }
  }
}
