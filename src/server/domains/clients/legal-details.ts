import { prisma } from "@/server/db/client";
import {
  normalizeClientLegalDetail,
  type ClientLegalDetailInput,
} from "@/lib/client-legal-details";

export async function listClientLegalDetails(clientId: string) {
  return prisma.clientLegalDetail.findMany({
    where: { clientId },
    orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }, { nameUk: "asc" }],
  });
}

async function clearOtherPrimaries(clientId: string, keepId?: string) {
  await prisma.clientLegalDetail.updateMany({
    where: {
      clientId,
      isPrimary: true,
      ...(keepId ? { id: { not: keepId } } : {}),
    },
    data: { isPrimary: false },
  });
}

async function mirrorPrimaryToClient(clientId: string, details: string | null) {
  await prisma.client.update({
    where: { id: clientId },
    data: { legalDetails: details },
  });
}

export async function createClientLegalDetail(clientId: string, raw: ClientLegalDetailInput) {
  const data = normalizeClientLegalDetail(raw);
  if (!data) throw new Error("DETAILS_REQUIRED");
  const count = await prisma.clientLegalDetail.count({ where: { clientId } });
  const isPrimary = data.isPrimary || count === 0;
  if (isPrimary) await clearOtherPrimaries(clientId);
  const created = await prisma.clientLegalDetail.create({
    data: {
      clientId,
      nameUk: data.nameUk,
      details: data.details,
      isPrimary,
      sortOrder: count,
    },
  });
  if (isPrimary) {
    await mirrorPrimaryToClient(clientId, created.details);
  }
  return created;
}

export async function updateClientLegalDetail(id: string, raw: ClientLegalDetailInput) {
  const data = normalizeClientLegalDetail(raw);
  if (!data) throw new Error("DETAILS_REQUIRED");
  const existing = await prisma.clientLegalDetail.findUniqueOrThrow({ where: { id } });
  if (data.isPrimary) await clearOtherPrimaries(existing.clientId, id);
  const updated = await prisma.clientLegalDetail.update({
    where: { id },
    data: {
      nameUk: data.nameUk,
      details: data.details,
      isPrimary: data.isPrimary ?? existing.isPrimary,
    },
  });
  if (updated.isPrimary) {
    await mirrorPrimaryToClient(existing.clientId, updated.details);
  }
  return updated;
}

export async function deleteClientLegalDetail(id: string) {
  const existing = await prisma.clientLegalDetail.findUniqueOrThrow({ where: { id } });
  await prisma.clientLegalDetail.delete({ where: { id } });
  if (existing.isPrimary) {
    const next = await prisma.clientLegalDetail.findFirst({
      where: { clientId: existing.clientId },
      orderBy: [{ sortOrder: "asc" }, { nameUk: "asc" }],
    });
    if (next) {
      await prisma.clientLegalDetail.update({
        where: { id: next.id },
        data: { isPrimary: true },
      });
      await mirrorPrimaryToClient(existing.clientId, next.details);
    } else {
      await mirrorPrimaryToClient(existing.clientId, null);
    }
  }
}
