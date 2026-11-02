"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/server/auth";
import { assertSessionPermission } from "@/server/auth/access";
import { hasUserPermission } from "@/lib/permissions";
import { prisma } from "@/server/db/client";
import { resyncFabricPurchasePrices } from "@/server/domains/catalog/materials";

const pricingSchema = z.object({
  pricingMethod: z.enum(["MARGIN", "MARKUP"]),
  targetMarginPercent: z.coerce.number().min(0).max(99),
  minimumMarginPercent: z.coerce.number().min(0).max(99),
  managerMaxDiscountPercent: z.coerce.number().min(0).max(100),
  roundingRule: z.string().min(1),
  usdUahRate: z.coerce.number().positive(),
  fabricCargoUsdPerKg: z.coerce.number().min(0),
  npStandardUsdPerKg: z.coerce.number().min(0),
  npVolumeUsdPerKg: z.coerce.number().min(0),
  inputVatRatePercent: z.coerce.number().min(0).max(100),
  materialCostVatMode: z.enum(["NET", "GROSS"]),
});

export async function updatePricingSettingsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("managePricingRules");

  const parsed = pricingSchema.safeParse({
    pricingMethod: formData.get("pricingMethod"),
    targetMarginPercent: formData.get("targetMarginPercent"),
    minimumMarginPercent: formData.get("minimumMarginPercent"),
    managerMaxDiscountPercent: formData.get("managerMaxDiscountPercent") || 0,
    roundingRule: formData.get("roundingRule") || "ROUND_2",
    usdUahRate: formData.get("usdUahRate") || 45,
    fabricCargoUsdPerKg: formData.get("fabricCargoUsdPerKg") || 1.7,
    npStandardUsdPerKg: formData.get("npStandardUsdPerKg") || 0.4,
    npVolumeUsdPerKg: formData.get("npVolumeUsdPerKg") || 0.8,
    inputVatRatePercent: formData.get("inputVatRatePercent") || 20,
    materialCostVatMode: formData.get("materialCostVatMode") || "NET",
  });

  if (!parsed.success) return { ok: false as const, error: "VALIDATION" as const };

  const existing = await prisma.pricingSettings.findFirst();
  // targetMarginPercent на формі зафіксовано як 0 (націнка в прайсі виробу).
  // Не порівнюємо з minimumMarginPercent — інакше збереження завжди падає (15 > 0).
  const data = {
    ...parsed.data,
    targetMarginPercent: existing
      ? Number(existing.targetMarginPercent)
      : parsed.data.targetMarginPercent,
  };

  if (existing) {
    await prisma.pricingSettings.update({ where: { id: existing.id }, data });
  } else {
    await prisma.pricingSettings.create({ data });
  }

  await resyncFabricPurchasePrices();

  revalidatePath("/settings/pricing");
  revalidatePath("/settings/resources");
  revalidatePath("/products");
  return { ok: true as const };
}

const companySchema = z.object({
  id: z.string().trim().optional().nullable(),
  legalName: z.string().trim().min(1),
  address: z.string().trim().optional().nullable(),
  phone: z.string().trim().optional().nullable(),
  email: z.string().trim().optional().nullable(),
  taxId: z.string().trim().optional().nullable(),
  quotationFooter: z.string().trim().optional().nullable(),
  isDefault: z.boolean().optional(),
});

function parseCompanyForm(formData: FormData) {
  return companySchema.safeParse({
    id: formData.get("id") || null,
    legalName: formData.get("legalName"),
    address: formData.get("address") || null,
    phone: formData.get("phone") || null,
    email: formData.get("email") || null,
    taxId: formData.get("taxId") || null,
    quotationFooter: formData.get("quotationFooter") || null,
    isDefault: formData.get("isDefault") === "on" || formData.get("isDefault") === "true",
  });
}

export async function saveCompanySettingsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("managePricingRules");

  const parsed = parseCompanyForm(formData);
  if (!parsed.success) return { ok: false as const, error: "VALIDATION" as const };

  const { createCompany, updateCompany } = await import("@/server/domains/settings/company");
  const id = parsed.data.id?.trim() || "";
  const saved = id
    ? await updateCompany(id, parsed.data)
    : await createCompany(parsed.data);

  revalidatePath("/settings/company");
  revalidatePath("/orders");
  return { ok: true as const, id: saved.id };
}

/** @deprecated use saveCompanySettingsAction */
export async function updateCompanySettingsAction(formData: FormData) {
  return saveCompanySettingsAction(formData);
}

export async function deleteCompanySettingsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("managePricingRules");

  const id = String(formData.get("id") ?? "").trim();
  if (!id) return { ok: false as const, error: "VALIDATION" as const };
  const { deleteCompany } = await import("@/server/domains/settings/company");
  try {
    await deleteCompany(id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "ERROR";
    if (message === "LAST_COMPANY" || message === "NOT_FOUND") {
      return { ok: false as const, error: message };
    }
    throw error;
  }
  revalidatePath("/settings/company");
  revalidatePath("/orders");
  return { ok: true as const };
}

/** Company-wide XXL / 3XL / 4XL uplift vs base norms (+% materials / +% operations). */
export async function updateOversizeCoeffsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const materialPct = Number(formData.get("materialPct"));
  const operationPct = Number(formData.get("operationPct"));
  if (
    Number.isNaN(materialPct) ||
    Number.isNaN(operationPct) ||
    materialPct < 0 ||
    operationPct < 0 ||
    materialPct > 200 ||
    operationPct > 200
  ) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const { OVERSIZE_CODES, pctToCoeff } = await import("@/lib/size-coeffs");
  const materialCoeff = pctToCoeff(materialPct);
  const operationCoeff = pctToCoeff(operationPct);

  for (const sizeCode of OVERSIZE_CODES) {
    const existing = await prisma.sizeRule.findFirst({
      where: { sizeCode, status: "ACTIVE" },
    });
    if (existing) {
      await prisma.sizeRule.update({
        where: { id: existing.id },
        data: { materialCoeff, operationCoeff },
      });
    } else {
      await prisma.sizeRule.create({
        data: {
          sizeCode,
          materialCoeff,
          operationCoeff,
          surchargePercent: 0,
          appliesTo: "SELECTED",
          status: "ACTIVE",
        },
      });
    }
  }

  revalidatePath("/products");
  revalidatePath("/orders");
  revalidatePath("/settings/pricing");
  return { ok: true as const };
}
