import { prisma } from "@/server/db/client";

export type CompanyInput = {
  legalName: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  quotationFooter?: string | null;
  isDefault?: boolean;
};

export async function listCompanies() {
  return prisma.companySettings.findMany({
    orderBy: [{ isDefault: "desc" }, { legalName: "asc" }],
  });
}

export async function getDefaultCompany() {
  return (
    (await prisma.companySettings.findFirst({ where: { isDefault: true } })) ??
    (await prisma.companySettings.findFirst({ orderBy: { legalName: "asc" } }))
  );
}

export async function resolveCompanySettings(companySettingsId?: string | null) {
  if (companySettingsId) {
    const found = await prisma.companySettings.findUnique({
      where: { id: companySettingsId },
    });
    if (found) return found;
  }
  return getDefaultCompany();
}

async function ensureSingleDefault(preferredId?: string) {
  if (preferredId) {
    await prisma.companySettings.updateMany({
      where: { id: { not: preferredId } },
      data: { isDefault: false },
    });
    await prisma.companySettings.update({
      where: { id: preferredId },
      data: { isDefault: true },
    });
    return;
  }
  const current = await prisma.companySettings.findFirst({ where: { isDefault: true } });
  if (current) return;
  const first = await prisma.companySettings.findFirst({ orderBy: { legalName: "asc" } });
  if (first) {
    await prisma.companySettings.update({
      where: { id: first.id },
      data: { isDefault: true },
    });
  }
}

export async function createCompany(input: CompanyInput) {
  const count = await prisma.companySettings.count();
  const isDefault = count === 0 ? true : Boolean(input.isDefault);
  const created = await prisma.companySettings.create({
    data: {
      legalName: input.legalName,
      address: input.address || null,
      phone: input.phone || null,
      email: input.email || null,
      taxId: input.taxId || null,
      quotationFooter: input.quotationFooter || null,
      isDefault,
    },
  });
  if (isDefault) await ensureSingleDefault(created.id);
  return created;
}

export async function updateCompany(id: string, input: CompanyInput) {
  const existing = await prisma.companySettings.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");
  const updated = await prisma.companySettings.update({
    where: { id },
    data: {
      legalName: input.legalName,
      address: input.address || null,
      phone: input.phone || null,
      email: input.email || null,
      taxId: input.taxId || null,
      quotationFooter: input.quotationFooter || null,
      isDefault: input.isDefault ? true : existing.isDefault,
    },
  });
  if (input.isDefault) await ensureSingleDefault(id);
  return updated;
}

export async function deleteCompany(id: string) {
  const count = await prisma.companySettings.count();
  if (count <= 1) throw new Error("LAST_COMPANY");
  const existing = await prisma.companySettings.findUnique({ where: { id } });
  if (!existing) throw new Error("NOT_FOUND");
  await prisma.companySettings.delete({ where: { id } });
  await ensureSingleDefault();
}
