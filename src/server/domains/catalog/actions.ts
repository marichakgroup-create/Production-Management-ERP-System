"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/server/auth";
import { assertSessionPermission, accessHas, getCurrentUserAccess } from "@/server/auth/access";
import {
  archiveDecoration,
  archiveDecorations,
  archiveOperation,
  archiveOperations,
  createDecoration,
  createOperation,
  updateDecoration,
  updateOperation,
} from "@/server/domains/catalog/operations";
import {
  archiveMaterial,
  archiveMaterials,
  createMaterial,
  duplicateMaterial,
  getFabricPricingGlobals,
  listCompositionNames,
  listMaterials,
  listSupplierNames,
  listUnits,
  resyncFabricPurchasePrices,
  updateMaterial,
  updateMaterialAvailableColors,
} from "@/server/domains/catalog/materials";
import { prisma } from "@/server/db/client";
import { materialFormSchema } from "@/server/domains/catalog/schemas";
import {
  DEFAULT_FABRIC_DELIVERY_RATES,
  normalizeFabricDeliveryType,
} from "@/lib/fabric-delivery-types";
import { parseMaterialUrlsJson } from "@/lib/material-links";
import {
  decorationFormSchema,
  operationFormSchema,
} from "@/server/domains/catalog/operation-schemas";

export async function getMaterialsAction(search?: string) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return listMaterials({ search });
}

export async function getUnitsAction() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return listUnits();
}

export async function listSupplierNamesAction() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return listSupplierNames();
}

export async function getSupplierPaletteAction(supplierNameUk: string) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  const { getSupplierRememberedPalette } = await import("@/server/domains/catalog/suppliers");
  const colors = await getSupplierRememberedPalette(supplierNameUk);
  return { ok: true as const, colors };
}

export async function listCompositionNamesAction() {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  return listCompositionNames();
}

/** Full material payload for the edit form (avoids stale/incomplete table-row props). */
export async function getMaterialForEditAction(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  const [row, fabricGlobals] = await Promise.all([
    prisma.material.findUnique({
      where: { id },
      include: { unitOfMeasure: true },
    }),
    getFabricPricingGlobals(),
  ]);

  if (!row || row.status === "ARCHIVED") {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }

  const tagRows = await prisma.$queryRaw<Array<{ tag_color: string | null }>>`
    SELECT tag_color FROM materials WHERE id = ${id}
  `;
  const tagColor = tagRows[0]?.tag_color ?? row.tagColor ?? null;

  return {
    ok: true as const,
    fabricGlobals,
    material: {
      id: row.id,
      nameUk: row.nameUk,
      type: row.type,
      unitOfMeasureId: row.unitOfMeasureId,
      purchasePrice: Number(row.purchasePrice),
      defaultWastePercent: Number(row.defaultWastePercent),
      supplierCode: row.supplierCode ?? "",
      colorOrAttribute: row.colorOrAttribute ?? "",
      note: row.note ?? "",
      referenceUrls: Array.isArray(row.referenceUrls) ? row.referenceUrls : [],
      updatedAt: row.updatedAt.toISOString(),
      tagColor,
      densityGsm: row.densityGsm ?? "",
      composition: row.composition ?? "",
      metersPerKg: row.metersPerKg != null ? Number(row.metersPerKg) : null,
      priceKgUsd: row.priceKgUsd != null ? Number(row.priceKgUsd) : null,
      priceKgUsdCargo: row.priceKgUsdCargo != null ? Number(row.priceKgUsdCargo) : null,
      priceKgUsdVat: row.priceKgUsdVat != null ? Number(row.priceKgUsdVat) : null,
      priceMeterUahNoVat:
        row.priceMeterUahNoVat != null ? Number(row.priceMeterUahNoVat) : null,
      priceMeterUahVat: row.priceMeterUahVat != null ? Number(row.priceMeterUahVat) : null,
      priceMeterUahCutVat:
        row.priceMeterUahCutVat != null ? Number(row.priceMeterUahCutVat) : null,
      fabricKindUk: row.fabricKindUk ?? "",
      widthCm: row.widthCm ?? "",
      wholesaleNote: row.wholesaleNote ?? "",
      rollWeightKg: row.rollWeightKg != null ? Number(row.rollWeightKg) : null,
      metersPerRoll: row.metersPerRoll != null ? Number(row.metersPerRoll) : null,
      minWholesaleMeters:
        row.minWholesaleMeters != null ? Number(row.minWholesaleMeters) : null,
      costVatOverride: row.costVatOverride,
      deliveryType: row.deliveryType,
      unitsPerPack: row.unitsPerPack,
      unitsPerKg: row.unitsPerKg != null ? Number(row.unitsPerKg) : null,
      purchasePackPrice:
        row.purchasePackPrice != null ? Number(row.purchasePackPrice) : null,
      packDeliveryCostUah:
        row.packDeliveryCostUah != null ? Number(row.packDeliveryCostUah) : null,
    },
  };
}

export async function createMaterialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const parsed = materialFormSchema.safeParse(materialFormData(formData));

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await syncFabricGlobalsFromForm(formData);

  const result = await createMaterial(parsed.data);

  const offersRaw = formData.get("supplierOffersJson");
  if (typeof offersRaw === "string" && offersRaw.trim()) {
    try {
      const { upsertMaterialSupplierOffer } = await import(
        "@/server/domains/catalog/suppliers"
      );
      const { splitColorLabels } = await import("@/lib/trim-colors");
      const drafts = JSON.parse(offersRaw) as Array<{
        isPrimary?: boolean;
        supplierName?: string;
        deliveryType?: string;
        cargoUsdPerKg?: string;
        npStandardUsdPerKg?: string;
        npVolumeUsdPerKg?: string;
        priceKgUsd?: string;
        priceKgUsdVat?: string;
        priceMeterUahNoVat?: string;
        priceMeterUahVat?: string;
        priceMeterUahCutVat?: string;
        minWholesaleMeters?: string;
        wholesaleNote?: string;
        purchasePackPrice?: string;
        packDeliveryCostUah?: string;
        availableColors?: string;
      }>;
      if (Array.isArray(drafts)) {
        const metersPerKg = formData.get("metersPerKg")
          ? Number(formData.get("metersPerKg"))
          : null;
        // Primary first so catalog mirror is correct, then alternatives.
        const ordered = [...drafts].sort(
          (a, b) => Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary)),
        );
        for (const draft of ordered) {
          const name = String(draft.supplierName ?? "").trim();
          if (!name) continue;
          await upsertMaterialSupplierOffer(result.material.id, {
            supplierNameUk: name,
            isPrimary: Boolean(draft.isPrimary),
            metersPerKg:
              metersPerKg != null && Number.isFinite(metersPerKg) ? metersPerKg : null,
            deliveryType: draft.deliveryType || null,
            cargoUsdPerKg: draft.cargoUsdPerKg ? Number(draft.cargoUsdPerKg) : null,
            npStandardUsdPerKg: draft.npStandardUsdPerKg
              ? Number(draft.npStandardUsdPerKg)
              : null,
            npVolumeUsdPerKg: draft.npVolumeUsdPerKg
              ? Number(draft.npVolumeUsdPerKg)
              : null,
            priceKgUsd: draft.priceKgUsd ? Number(draft.priceKgUsd) : null,
            priceKgUsdVat: draft.priceKgUsdVat ? Number(draft.priceKgUsdVat) : null,
            priceMeterUahNoVat: draft.priceMeterUahNoVat
              ? Number(draft.priceMeterUahNoVat)
              : null,
            priceMeterUahVat: draft.priceMeterUahVat
              ? Number(draft.priceMeterUahVat)
              : null,
            priceMeterUahCutVat: draft.priceMeterUahCutVat
              ? Number(draft.priceMeterUahCutVat)
              : null,
            minWholesaleMeters: draft.minWholesaleMeters
              ? Number(draft.minWholesaleMeters)
              : null,
            wholesaleNote: draft.wholesaleNote || null,
            purchasePackPrice: draft.purchasePackPrice
              ? Number(draft.purchasePackPrice)
              : null,
            packDeliveryCostUah: draft.packDeliveryCostUah
              ? Number(draft.packDeliveryCostUah)
              : null,
            availableColors: splitColorLabels(String(draft.availableColors ?? "")),
          });
        }
      }
    } catch {
      // Material already created; offers can still be edited later.
    }
  }

  revalidatePath("/settings/resources");
  revalidatePath("/settings/pricing");
  revalidatePath("/orders");
  return {
    ok: true as const,
    materialId: result.material.id,
    hasDuplicates: result.duplicates.length > 0,
    material: {
      id: result.material.id,
      nameUk: result.material.nameUk,
      unit: result.material.unitOfMeasure.code,
      price: Number(result.material.purchasePrice),
      defaultWaste: Number(result.material.defaultWastePercent),
      materialType: result.material.type,
      priceMeterUahNoVat:
        result.material.priceMeterUahNoVat != null
          ? Number(result.material.priceMeterUahNoVat)
          : null,
      priceMeterUahVat:
        result.material.priceMeterUahVat != null
          ? Number(result.material.priceMeterUahVat)
          : null,
      priceMeterUahCutVat:
        result.material.priceMeterUahCutVat != null
          ? Number(result.material.priceMeterUahCutVat)
          : null,
      metersPerRoll:
        result.material.metersPerRoll != null ? Number(result.material.metersPerRoll) : null,
      minWholesaleMeters:
        result.material.minWholesaleMeters != null
          ? Number(result.material.minWholesaleMeters)
          : null,
      costVatOverride: result.material.costVatOverride,
      availableColors: result.material.availableColors ?? [],
    },
  };
}

export async function updateMaterialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const id = String(formData.get("id") || "");
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  const parsed = materialFormSchema.safeParse(materialFormData(formData));

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  await syncFabricGlobalsFromForm(formData);

  const result = await updateMaterial(id, parsed.data, {
    preservePurchaseTerms: formData.get("pricingManagedSeparately") === "1",
  });
  revalidatePath("/settings/resources");
  revalidatePath("/settings/pricing");
  revalidatePath("/orders");
  revalidatePath("/products");
  return { ok: true as const, materialId: result.material.id };
}

export async function updateMaterialAvailableColorsAction(
  materialId: string,
  colors: string[],
) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  const access = await getCurrentUserAccess();
  if (
    !access ||
    (!accessHas(access, "createInlineCatalog") && !accessHas(access, "manageOrders"))
  ) {
    throw new Error("FORBIDDEN");
  }

  if (!materialId) return { ok: false as const, error: "VALIDATION" as const };

  const updated = await updateMaterialAvailableColors(materialId, colors);
  revalidatePath("/settings/resources");
  revalidatePath("/orders");
  revalidatePath("/products");
  return {
    ok: true as const,
    materialId: updated.id,
    availableColors: updated.availableColors,
  };
}

/**
 * Persist course (+ CARGO only) from the material form into shared PricingSettings.
 * НП стандарт / НП обʼємні — лише з «Ціноутворення» (НП стандарт завжди 0.4 $/кг).
 */
async function syncFabricGlobalsFromForm(formData: FormData) {
  const access = await getCurrentUserAccess();
  if (!access) return;
  if (
    !accessHas(access, "createInlineCatalog") &&
    !accessHas(access, "managePricingRules")
  ) {
    return;
  }

  const usdUahRate = Number(formData.get("usdUahRate"));
  const deliveryRate = Number(formData.get("fabricCargoUsdPerKg"));
  const deliveryType = normalizeFabricDeliveryType(formData.get("deliveryType"));
  if (!Number.isFinite(usdUahRate) || usdUahRate <= 0) return;
  if (!Number.isFinite(deliveryRate) || deliveryRate < 0) return;

  const existing = await prisma.pricingSettings.findFirst();
  if (!existing) return;

  // Do not let a material tariff overwrite company НП rates (was corrupting 0.4 → 1.7).
  const nextCargo =
    deliveryType === "CARGO"
      ? deliveryRate
      : Number(existing.fabricCargoUsdPerKg);
  const nextNpStandard = Number(
    existing.npStandardUsdPerKg ?? DEFAULT_FABRIC_DELIVERY_RATES.NP_STANDARD,
  );
  const nextNpVolume = Number(
    existing.npVolumeUsdPerKg ?? DEFAULT_FABRIC_DELIVERY_RATES.NP_VOLUME,
  );

  const sameRate = Number(existing.usdUahRate) === usdUahRate;
  const sameCargo = Number(existing.fabricCargoUsdPerKg) === nextCargo;
  const sameNpStandard = Number(existing.npStandardUsdPerKg ?? 0.4) === nextNpStandard;
  const sameNpVolume = Number(existing.npVolumeUsdPerKg ?? 0.8) === nextNpVolume;
  if (sameRate && sameCargo && sameNpStandard && sameNpVolume) return;

  await prisma.pricingSettings.update({
    where: { id: existing.id },
    data: {
      usdUahRate,
      fabricCargoUsdPerKg: nextCargo,
      npStandardUsdPerKg: nextNpStandard,
      npVolumeUsdPerKg: nextNpVolume,
    },
  });
  await resyncFabricPurchasePrices();
}

function materialFormData(formData: FormData) {
  return {
    nameUk: formData.get("nameUk"),
    type: formData.get("type"),
    categoryId: formData.get("categoryId") || null,
    unitOfMeasureId: formData.get("unitOfMeasureId"),
    purchasePrice: formData.get("purchasePrice"),
    defaultWastePercent: formData.get("defaultWastePercent") || 0,
    supplierCode: formData.get("supplierCode") || null,
    colorOrAttribute: formData.get("colorOrAttribute") || null,
    note: formData.get("note") || null,
    referenceUrls: parseMaterialUrlsJson(formData.get("referenceUrlsJson")),
    tagColor: formData.get("tagColor") || null,
    densityGsm: formData.get("densityGsm") || null,
    composition: formData.get("composition") || null,
    metersPerKg: formData.get("metersPerKg"),
    priceKgUsd: formData.get("priceKgUsd"),
    priceKgUsdCargo: formData.get("priceKgUsdCargo"),
    priceKgUsdVat: formData.get("priceKgUsdVat"),
    priceMeterUahNoVat: formData.get("priceMeterUahNoVat"),
    priceMeterUahVat: formData.get("priceMeterUahVat"),
    priceMeterUahCutVat: formData.get("priceMeterUahCutVat"),
    fabricKindUk: formData.get("fabricKindUk") || null,
    widthCm: formData.get("widthCm") || null,
    wholesaleNote: formData.get("wholesaleNote") || null,
    rollWeightKg: formData.get("rollWeightKg"),
    metersPerRoll: formData.get("metersPerRoll"),
    minWholesaleMeters: formData.get("minWholesaleMeters"),
    costVatOverride: formData.get("costVatOverride") || null,
    deliveryType: formData.get("deliveryType") || "CARGO",
    unitsPerPack: formData.get("unitsPerPack"),
    unitsPerKg: formData.get("unitsPerKg"),
    purchasePackPrice: formData.get("purchasePackPrice"),
    packDeliveryCostUah: formData.get("packDeliveryCostUah"),
  };
}

export async function archiveMaterialAction(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("archiveRecords");

  await archiveMaterial(id);
  revalidatePath("/settings/resources");
  return { ok: true as const };
}

export async function duplicateMaterialAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const materialId = String(formData.get("materialId") ?? "").trim();
  const nameUk = String(formData.get("nameUk") ?? "").trim();
  if (!materialId) return { ok: false as const, error: "NOT_FOUND" as const };
  if (!nameUk) return { ok: false as const, error: "NAME_REQUIRED" as const };

  try {
    const copy = await duplicateMaterial(materialId, { nameUk });
    revalidatePath("/settings/resources");
    return { ok: true as const, materialId: copy.id };
  } catch (error) {
    if (error instanceof Error && error.message === "MATERIAL_NOT_FOUND") {
      return { ok: false as const, error: "NOT_FOUND" as const };
    }
    throw error;
  }
}

export async function createOperationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  let rateTiers: unknown = [];
  const rateTiersRaw = formData.get("rateTiersJson");
  if (typeof rateTiersRaw === "string" && rateTiersRaw.trim()) {
    try {
      rateTiers = JSON.parse(rateTiersRaw);
    } catch {
      rateTiers = [];
    }
  }

  const parsed = operationFormSchema.safeParse({
    nameUk: formData.get("nameUk"),
    categoryId: formData.get("categoryId") || null,
    calculationMethod: formData.get("calculationMethod") || "UNIT_RATE",
    baseRate: formData.get("baseRate") || null,
    shiftCost: formData.get("shiftCost") || null,
    standardOutputPerShift: formData.get("standardOutputPerShift") || null,
    note: formData.get("note") || null,
    rateTiers,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const operation = await createOperation(parsed.data);
  revalidatePath("/settings/operations");
  revalidatePath("/orders");
  return {
    ok: true as const,
    operationId: operation.id,
    operation: {
      id: operation.id,
      nameUk: operation.nameUk,
      method: operation.calculationMethod,
      unitRate: operation.baseRate != null ? Number(operation.baseRate) : null,
      shiftCost: operation.shiftCost != null ? Number(operation.shiftCost) : null,
      standardOutput:
        operation.standardOutputPerShift != null
          ? Number(operation.standardOutputPerShift)
          : null,
      rateTiers: (operation.rateTiers ?? []).map((tier) => ({
        minQuantity: tier.minQuantity,
        ratePerUnit: Number(tier.ratePerUnit),
      })),
    },
  };
}

export async function updateOperationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const id = String(formData.get("id") || "");
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  let rateTiers: unknown = [];
  const rateTiersRaw = formData.get("rateTiersJson");
  if (typeof rateTiersRaw === "string" && rateTiersRaw.trim()) {
    try {
      rateTiers = JSON.parse(rateTiersRaw);
    } catch {
      rateTiers = [];
    }
  }

  const parsed = operationFormSchema.safeParse({
    nameUk: formData.get("nameUk"),
    categoryId: formData.get("categoryId") || null,
    calculationMethod: formData.get("calculationMethod") || "UNIT_RATE",
    baseRate: formData.get("baseRate") || null,
    shiftCost: formData.get("shiftCost") || null,
    standardOutputPerShift: formData.get("standardOutputPerShift") || null,
    note: formData.get("note") || null,
    rateTiers,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const operation = await updateOperation(id, parsed.data);
  revalidatePath("/settings/operations");
  revalidatePath("/orders");
  revalidatePath("/products");
  return { ok: true as const, operationId: operation.id };
}

export async function archiveOperationAction(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("archiveRecords");
  await archiveOperation(id);
  revalidatePath("/settings/operations");
  return { ok: true as const };
}

export async function createDecorationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const parsed = decorationFormSchema.safeParse({
    nameUk: formData.get("nameUk"),
    calculationUnit: formData.get("calculationUnit"),
    setupCost: formData.get("setupCost") || 0,
    unitRate: formData.get("unitRate") || 0,
    note: formData.get("note") || null,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const decoration = await createDecoration(parsed.data);
  revalidatePath("/settings/applications");
  revalidatePath("/orders");
  return {
    ok: true as const,
    decorationId: decoration.id,
    decoration: {
      id: decoration.id,
      nameUk: decoration.nameUk,
      setupCost: Number(decoration.setupCost),
      unitRate: Number(decoration.unitRate),
    },
  };
}

export async function updateDecorationAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("createInlineCatalog");

  const id = String(formData.get("id") || "");
  if (!id) return { ok: false as const, error: "VALIDATION" as const };

  const parsed = decorationFormSchema.safeParse({
    nameUk: formData.get("nameUk"),
    calculationUnit: formData.get("calculationUnit"),
    setupCost: formData.get("setupCost") || 0,
    unitRate: formData.get("unitRate") || 0,
    note: formData.get("note") || null,
  });

  if (!parsed.success) {
    return { ok: false as const, error: "VALIDATION" as const };
  }

  const decoration = await updateDecoration(id, parsed.data);
  revalidatePath("/settings/applications");
  revalidatePath("/orders");
  revalidatePath("/products");
  return { ok: true as const, decorationId: decoration.id };
}

export async function archiveDecorationAction(id: string) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("archiveRecords");
  await archiveDecoration(id);
  revalidatePath("/settings/applications");
  return { ok: true as const };
}

function parseIds(formData: FormData) {
  return formData
    .getAll("ids")
    .map(String)
    .filter(Boolean);
}

export async function bulkArchiveMaterialsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("archiveRecords");

  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false as const, error: "EMPTY" as const };

  const result = await archiveMaterials(ids);
  revalidatePath("/settings/resources");
  revalidatePath("/orders");
  return { ok: true as const, count: result.count };
}

export async function bulkArchiveOperationsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("archiveRecords");

  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false as const, error: "EMPTY" as const };

  const result = await archiveOperations(ids);
  revalidatePath("/settings/operations");
  revalidatePath("/orders");
  return { ok: true as const, count: result.count };
}

export async function bulkArchiveDecorationsAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) throw new Error("UNAUTHORIZED");
  await assertSessionPermission("archiveRecords");

  const ids = parseIds(formData);
  if (ids.length === 0) return { ok: false as const, error: "EMPTY" as const };

  const result = await archiveDecorations(ids);
  revalidatePath("/settings/applications");
  revalidatePath("/orders");
  return { ok: true as const, count: result.count };
}

export async function upsertMaterialSupplierOfferAction(formData: FormData) {
  await assertSessionPermission("createInlineCatalog");
  const materialId = String(formData.get("materialId") ?? "");
  if (!materialId) return { ok: false as const, error: "INVALID" as const };

  const { upsertMaterialSupplierOffer } = await import("@/server/domains/catalog/suppliers");
  const { splitColorLabels } = await import("@/lib/trim-colors");
  const colorsRaw = String(formData.get("availableColors") ?? "");
  await upsertMaterialSupplierOffer(materialId, {
    supplierNameUk: String(formData.get("supplierNameUk") ?? "") || null,
    isPrimary: formData.get("isPrimary") === "1",
    metersPerKg: formData.get("metersPerKg")
      ? Number(formData.get("metersPerKg"))
      : null,
    deliveryType: String(formData.get("deliveryType") ?? "") || null,
    cargoUsdPerKg: formData.get("cargoUsdPerKg")
      ? Number(formData.get("cargoUsdPerKg"))
      : null,
    npStandardUsdPerKg: formData.get("npStandardUsdPerKg")
      ? Number(formData.get("npStandardUsdPerKg"))
      : null,
    npVolumeUsdPerKg: formData.get("npVolumeUsdPerKg")
      ? Number(formData.get("npVolumeUsdPerKg"))
      : null,
    purchasePackPrice: formData.get("purchasePackPrice")
      ? Number(formData.get("purchasePackPrice"))
      : null,
    packDeliveryCostUah: formData.get("packDeliveryCostUah")
      ? Number(formData.get("packDeliveryCostUah"))
      : null,
    priceKgUsd: formData.get("priceKgUsd") ? Number(formData.get("priceKgUsd")) : null,
    priceKgUsdVat: formData.get("priceKgUsdVat")
      ? Number(formData.get("priceKgUsdVat"))
      : null,
    priceMeterUahNoVat: formData.get("priceMeterUahNoVat")
      ? Number(formData.get("priceMeterUahNoVat"))
      : null,
    priceMeterUahVat: formData.get("priceMeterUahVat")
      ? Number(formData.get("priceMeterUahVat"))
      : null,
    priceMeterUahCutVat: formData.get("priceMeterUahCutVat")
      ? Number(formData.get("priceMeterUahCutVat"))
      : null,
    rollWeightKg: formData.get("rollWeightKg")
      ? Number(formData.get("rollWeightKg"))
      : null,
    metersPerRoll: formData.get("metersPerRoll")
      ? Number(formData.get("metersPerRoll"))
      : null,
    minWholesaleMeters: formData.get("minWholesaleMeters")
      ? Number(formData.get("minWholesaleMeters"))
      : null,
    wholesaleNote: String(formData.get("wholesaleNote") ?? "") || null,
    availableColors: splitColorLabels(colorsRaw),
  });

  const usdUahRate = Number(formData.get("usdUahRate"));
  if (Number.isFinite(usdUahRate) && usdUahRate > 0) {
    const existing = await prisma.pricingSettings.findFirst();
    if (existing && Number(existing.usdUahRate) !== usdUahRate) {
      await prisma.pricingSettings.update({
        where: { id: existing.id },
        data: { usdUahRate },
      });
      await resyncFabricPurchasePrices();
    }
  }

  revalidatePath("/settings/resources");
  revalidatePath("/settings/pricing");
  revalidatePath("/products");
  revalidatePath("/orders");
  return { ok: true as const };
}

export async function setPrimaryMaterialSupplierOfferAction(formData: FormData) {
  await assertSessionPermission("createInlineCatalog");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "INVALID" as const };

  const { setPrimaryMaterialSupplierOffer } = await import("@/server/domains/catalog/suppliers");
  try {
    await setPrimaryMaterialSupplierOffer(id);
  } catch {
    return { ok: false as const, error: "NOT_FOUND" as const };
  }
  revalidatePath("/settings/resources");
  revalidatePath("/products");
  revalidatePath("/orders");
  return { ok: true as const };
}

export async function deleteMaterialSupplierOfferAction(formData: FormData) {
  await assertSessionPermission("createInlineCatalog");
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false as const, error: "INVALID" as const };
  const { deleteMaterialSupplierOffer } = await import("@/server/domains/catalog/suppliers");
  try {
    await deleteMaterialSupplierOffer(id);
  } catch {
    return { ok: false as const, error: "PRIMARY_OFFER" as const };
  }
  revalidatePath("/settings/resources");
  return { ok: true as const };
}

export async function listMaterialSupplierOffersAction(materialId: string) {
  await assertSessionPermission("createInlineCatalog");
  const { listMaterialSupplierOffers } = await import("@/server/domains/catalog/suppliers");
  const { getFabricPricingGlobals } = await import("@/server/domains/catalog/materials");
  const [offers, globals] = await Promise.all([
    listMaterialSupplierOffers(materialId),
    getFabricPricingGlobals(),
  ]);
  return {
    ok: true as const,
    usdUahRate: globals.usdUahRate,
    defaultCargoUsdPerKg: globals.fabricCargoUsdPerKg,
    offers: offers.map((row) => ({
      id: row.id,
      isPrimary: row.isPrimary,
      supplierName: row.supplier.nameUk,
      availableColors: row.availableColors ?? [],
      deliveryType: row.deliveryType,
      cargoUsdPerKg: row.cargoUsdPerKg != null ? Number(row.cargoUsdPerKg) : null,
      npStandardUsdPerKg:
        row.npStandardUsdPerKg != null ? Number(row.npStandardUsdPerKg) : null,
      npVolumeUsdPerKg:
        row.npVolumeUsdPerKg != null ? Number(row.npVolumeUsdPerKg) : null,
      purchasePackPrice:
        row.purchasePackPrice != null ? Number(row.purchasePackPrice) : null,
      packDeliveryCostUah:
        row.packDeliveryCostUah != null ? Number(row.packDeliveryCostUah) : null,
      priceKgUsd: row.priceKgUsd != null ? Number(row.priceKgUsd) : null,
      priceKgUsdVat: row.priceKgUsdVat != null ? Number(row.priceKgUsdVat) : null,
      priceMeterUahNoVat:
        row.priceMeterUahNoVat != null ? Number(row.priceMeterUahNoVat) : null,
      priceMeterUahVat: row.priceMeterUahVat != null ? Number(row.priceMeterUahVat) : null,
      priceMeterUahCutVat:
        row.priceMeterUahCutVat != null ? Number(row.priceMeterUahCutVat) : null,
      minWholesaleMeters:
        row.minWholesaleMeters != null ? Number(row.minWholesaleMeters) : null,
      wholesaleNote: row.wholesaleNote,
      purchaseHint:
        row.priceMeterUahCutVat != null
          ? Number(row.priceMeterUahCutVat)
          : row.priceMeterUahNoVat != null
            ? Number(row.priceMeterUahNoVat)
            : null,
    })),
  };
}
