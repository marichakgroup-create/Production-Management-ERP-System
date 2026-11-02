import { prisma } from "@/server/db/client";
import { materialFormSchema, type MaterialFormValues } from "./schemas";
import { Prisma, type MaterialCostVatMode, type MaterialType, type RecordStatus } from "@prisma/client";
import {
  DEFAULT_FABRIC_PRICING_GLOBALS,
  deriveFabricPricing,
  type FabricPricingGlobals,
} from "@/lib/fabric-pricing";
import {
  deliveryRateUsdPerKg,
  normalizeFabricDeliveryType,
  type FabricDeliveryTypeCode,
} from "@/lib/fabric-delivery-types";
import { deriveTrimUnitPriceFromSupplier } from "@/lib/trim-pack-pricing";

function prismaMaterialHasField(field: string): boolean {
  try {
    return field in (Prisma.MaterialScalarFieldEnum ?? {});
  } catch {
    return false;
  }
}

/** Direct column read — works even when a stale Prisma client omits tagColor. */
async function readMaterialTagColors(ids: string[]): Promise<Map<string, string | null>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const map = new Map<string, string | null>();
  if (!unique.length) return map;
  const rows = await prisma.$queryRaw<Array<{ id: string; tag_color: string | null }>>`
    SELECT id, tag_color FROM materials WHERE id IN (${Prisma.join(unique)})
  `;
  for (const row of rows) {
    map.set(row.id, row.tag_color);
  }
  return map;
}

async function writeMaterialTagColor(id: string, tagColor: string | null | undefined) {
  await prisma.$executeRaw`
    UPDATE materials SET tag_color = ${tagColor ?? null} WHERE id = ${id}
  `;
}

export async function getFabricPricingGlobals(): Promise<FabricPricingGlobals> {
  const pricing = await prisma.pricingSettings.findFirst();
  return {
    usdUahRate: Number(pricing?.usdUahRate ?? DEFAULT_FABRIC_PRICING_GLOBALS.usdUahRate),
    fabricCargoUsdPerKg: Number(
      pricing?.fabricCargoUsdPerKg ?? DEFAULT_FABRIC_PRICING_GLOBALS.fabricCargoUsdPerKg,
    ),
    npStandardUsdPerKg: Number(
      pricing?.npStandardUsdPerKg ?? DEFAULT_FABRIC_PRICING_GLOBALS.npStandardUsdPerKg,
    ),
    npVolumeUsdPerKg: Number(
      pricing?.npVolumeUsdPerKg ?? DEFAULT_FABRIC_PRICING_GLOBALS.npVolumeUsdPerKg,
    ),
    materialCostVatMode: (pricing?.materialCostVatMode ??
      DEFAULT_FABRIC_PRICING_GLOBALS.materialCostVatMode) as MaterialCostVatMode,
  };
}

function globalsForDeliveryType(
  globals: FabricPricingGlobals,
  deliveryType: FabricDeliveryTypeCode | null | undefined,
): FabricPricingGlobals {
  return {
    ...globals,
    fabricCargoUsdPerKg: deliveryRateUsdPerKg(deliveryType, globals),
  };
}

function fabricDataFromForm(
  data: MaterialFormValues,
  globals: FabricPricingGlobals,
) {
  const deliveryType = normalizeFabricDeliveryType(data.deliveryType);

  if (data.type !== "FABRIC") {
    const unitsPerPack =
      data.unitsPerPack != null && data.unitsPerPack > 0 ? Math.floor(data.unitsPerPack) : null;
    const unitsPerKg =
      data.unitsPerKg != null && Number(data.unitsPerKg) > 0 ? Number(data.unitsPerKg) : null;
    const purchasePackPrice =
      unitsPerPack != null && data.purchasePackPrice != null ? data.purchasePackPrice : null;
    const packDeliveryCostUah =
      unitsPerPack != null && data.packDeliveryCostUah != null ? data.packDeliveryCostUah : null;
    const priceKgUsd =
      unitsPerKg != null && data.priceKgUsd != null && Number(data.priceKgUsd) >= 0
        ? Number(data.priceKgUsd)
        : null;
    const purchasePrice = deriveTrimUnitPriceFromSupplier({
      unitsPerPack,
      purchasePackPrice,
      packDeliveryCostUah,
      unitsPerKg,
      priceKgUsd,
      usdUahRate: globals.usdUahRate,
      fallbackUnitPrice: data.purchasePrice,
    });
    const cutPrice =
      data.priceMeterUahCutVat != null &&
      Number.isFinite(data.priceMeterUahCutVat) &&
      data.priceMeterUahCutVat > 0
        ? data.priceMeterUahCutVat
        : null;
    const minWholesale =
      cutPrice != null &&
      data.minWholesaleMeters != null &&
      Number.isFinite(data.minWholesaleMeters) &&
      data.minWholesaleMeters > 0
        ? data.minWholesaleMeters
        : null;
    const unitMeterPrice =
      data.priceMeterUahNoVat != null &&
      Number.isFinite(data.priceMeterUahNoVat) &&
      data.priceMeterUahNoVat > 0
        ? data.priceMeterUahNoVat
        : purchasePrice > 0
          ? purchasePrice
          : null;

    return {
      densityGsm: data.densityGsm || null,
      composition: data.composition || null,
      metersPerKg: null,
      priceKgUsd,
      priceKgUsdCargo: null,
      priceKgUsdVat: null,
      priceMeterUahNoVat: unitMeterPrice,
      priceMeterUahVat: unitMeterPrice,
      priceMeterUahCutVat: cutPrice,
      fabricKindUk: null,
      widthCm: null,
      wholesaleNote: data.wholesaleNote || null,
      rollWeightKg: null,
      metersPerRoll: null,
      minWholesaleMeters: minWholesale,
      costVatOverride: data.costVatOverride ?? null,
      deliveryType: "CARGO" as FabricDeliveryTypeCode,
      unitsPerPack,
      unitsPerKg,
      purchasePackPrice,
      packDeliveryCostUah,
      purchasePrice,
    };
  }

  const pricingGlobals = globalsForDeliveryType(globals, deliveryType);
  const derived = deriveFabricPricing(
    {
      metersPerKg: data.metersPerKg,
      priceKgUsd: data.priceKgUsd,
      priceKgUsdCargo: data.priceKgUsdCargo,
      priceKgUsdVat: data.priceKgUsdVat,
      priceMeterUahNoVat: data.priceMeterUahNoVat,
      priceMeterUahVat: data.priceMeterUahVat,
      priceMeterUahCutVat: data.priceMeterUahCutVat,
      rollWeightKg: data.rollWeightKg,
      metersPerRoll: data.metersPerRoll,
      minWholesaleMeters: data.minWholesaleMeters,
      costVatOverride: data.costVatOverride,
    },
    pricingGlobals,
  );

  const purchasePrice =
    derived.purchasePrice > 0 ? derived.purchasePrice : data.purchasePrice;
  const unitsPerPack =
    data.unitsPerPack != null && data.unitsPerPack > 0 ? Math.floor(data.unitsPerPack) : null;
  const unitsPerKg =
    data.unitsPerKg != null && Number(data.unitsPerKg) > 0 ? Number(data.unitsPerKg) : null;
  const purchasePackPrice =
    unitsPerPack != null && data.purchasePackPrice != null ? data.purchasePackPrice : null;
  const packDeliveryCostUah =
    unitsPerPack != null && data.packDeliveryCostUah != null ? data.packDeliveryCostUah : null;
  const meterPrice =
    derived.priceMeterUahNoVat != null && derived.priceMeterUahNoVat > 0
      ? derived.priceMeterUahNoVat
      : purchasePrice > 0
        ? purchasePrice
        : null;

  return {
    densityGsm: data.densityGsm || null,
    composition: data.composition || null,
    metersPerKg: data.metersPerKg ?? null,
    priceKgUsd: data.priceKgUsd ?? null,
    priceKgUsdCargo: derived.priceKgUsdCargo,
    priceKgUsdVat: data.priceKgUsdVat ?? null,
    priceMeterUahNoVat: meterPrice,
    priceMeterUahVat: derived.priceMeterUahVat ?? meterPrice,
    priceMeterUahCutVat: data.priceMeterUahCutVat ?? null,
    fabricKindUk: data.fabricKindUk || null,
    widthCm: data.widthCm || null,
    wholesaleNote: data.wholesaleNote || null,
    rollWeightKg: data.rollWeightKg ?? null,
    metersPerRoll: derived.metersPerRoll,
    minWholesaleMeters: data.minWholesaleMeters ?? derived.minWholesaleMeters,
    costVatOverride: data.costVatOverride ?? null,
    deliveryType,
    unitsPerPack,
    unitsPerKg,
    purchasePackPrice,
    packDeliveryCostUah,
    purchasePrice,
  };
}

export async function listMaterials(params?: {
  search?: string;
  status?: RecordStatus;
}) {
  const search = params?.search?.trim();
  const rows = await prisma.material.findMany({
    where: {
      status: params?.status ?? "ACTIVE",
      ...(search
        ? {
            OR: [
              { nameUk: { contains: search, mode: "insensitive" } },
              { supplierCode: { contains: search, mode: "insensitive" } },
              { composition: { contains: search, mode: "insensitive" } },
              { fabricKindUk: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    include: {
      unitOfMeasure: true,
      category: true,
      supplierOffers: {
        include: { supplier: true },
        orderBy: [{ isPrimary: "desc" as const }, { updatedAt: "desc" as const }],
      },
    },
    orderBy: { nameUk: "asc" },
  });
  const tags = await readMaterialTagColors(rows.map((row) => row.id));
  return rows.map((row) => ({
    ...row,
    tagColor: tags.get(row.id) ?? row.tagColor ?? null,
  }));
}

export async function findLikelyMaterialDuplicates(input: {
  nameUk: string;
  unitOfMeasureId: string;
  excludeId?: string;
}) {
  return prisma.material.findMany({
    where: {
      nameUk: { equals: input.nameUk, mode: "insensitive" },
      unitOfMeasureId: input.unitOfMeasureId,
      ...(input.excludeId ? { id: { not: input.excludeId } } : {}),
    },
    take: 5,
  });
}

export async function createMaterial(raw: MaterialFormValues) {
  const data = materialFormSchema.parse(raw);
  const globals = await getFabricPricingGlobals();
  const fabric = fabricDataFromForm(data, globals);

  const duplicates = await findLikelyMaterialDuplicates({
    nameUk: data.nameUk,
    unitOfMeasureId: data.unitOfMeasureId,
  });

  const material = await prisma.material.create({
    data: {
      nameUk: data.nameUk,
      type: data.type as MaterialType,
      category: data.categoryId ? { connect: { id: data.categoryId } } : undefined,
      unitOfMeasure: { connect: { id: data.unitOfMeasureId } },
      purchasePrice: fabric.purchasePrice,
      defaultWastePercent: data.defaultWastePercent,
      supplierCode: data.supplierCode || null,
      colorOrAttribute: data.colorOrAttribute || null,
      availableColors: data.availableColors ?? [],
      note: data.note || null,
      referenceUrls: data.referenceUrls ?? [],
      ...(prismaMaterialHasField("tagColor")
        ? { tagColor: data.tagColor || null }
        : {}),
      densityGsm: fabric.densityGsm,
      composition: fabric.composition,
      metersPerKg: fabric.metersPerKg,
      priceKgUsd: fabric.priceKgUsd,
      priceKgUsdCargo: fabric.priceKgUsdCargo,
      priceKgUsdVat: fabric.priceKgUsdVat,
      priceMeterUahNoVat: fabric.priceMeterUahNoVat,
      priceMeterUahVat: fabric.priceMeterUahVat,
      priceMeterUahCutVat: fabric.priceMeterUahCutVat,
      fabricKindUk: fabric.fabricKindUk,
      widthCm: fabric.widthCm,
      wholesaleNote: fabric.wholesaleNote,
      rollWeightKg: fabric.rollWeightKg,
      metersPerRoll: fabric.metersPerRoll,
      minWholesaleMeters: fabric.minWholesaleMeters,
      costVatOverride: fabric.costVatOverride,
      deliveryType: fabric.deliveryType,
      unitsPerPack: fabric.unitsPerPack,
      ...(prismaMaterialHasField("unitsPerKg")
        ? { unitsPerKg: fabric.unitsPerKg }
        : {}),
      purchasePackPrice: fabric.purchasePackPrice,
      packDeliveryCostUah: fabric.packDeliveryCostUah,
    },
    include: {
      unitOfMeasure: true,
      category: true,
    },
  });

  if (!prismaMaterialHasField("tagColor") || !prismaMaterialHasField("unitsPerKg")) {
    await prisma.$executeRaw`
      UPDATE materials
      SET units_per_kg = ${fabric.unitsPerKg}
      WHERE id = ${material.id}
    `;
  }
  await writeMaterialTagColor(material.id, data.tagColor || null);

  if (data.supplierCode) {
    const { syncPrimarySupplierOfferFromMaterial } = await import(
      "@/server/domains/catalog/suppliers"
    );
    const cargoUsdPerKg = deliveryRateUsdPerKg(fabric.deliveryType, globals);
    await syncPrimarySupplierOfferFromMaterial({
      materialId: material.id,
      supplierNameUk: data.supplierCode,
      metersPerKg: fabric.metersPerKg != null ? Number(fabric.metersPerKg) : null,
      priceKgUsd: fabric.priceKgUsd != null ? Number(fabric.priceKgUsd) : null,
      priceKgUsdCargo:
        fabric.priceKgUsdCargo != null ? Number(fabric.priceKgUsdCargo) : null,
      priceKgUsdVat: fabric.priceKgUsdVat != null ? Number(fabric.priceKgUsdVat) : null,
      priceMeterUahNoVat:
        fabric.priceMeterUahNoVat != null
          ? Number(fabric.priceMeterUahNoVat)
          : data.type !== "FABRIC"
            ? Number(fabric.purchasePrice)
            : null,
      priceMeterUahVat:
        fabric.priceMeterUahVat != null ? Number(fabric.priceMeterUahVat) : null,
      priceMeterUahCutVat:
        fabric.priceMeterUahCutVat != null ? Number(fabric.priceMeterUahCutVat) : null,
      rollWeightKg: fabric.rollWeightKg != null ? Number(fabric.rollWeightKg) : null,
      metersPerRoll: fabric.metersPerRoll != null ? Number(fabric.metersPerRoll) : null,
      minWholesaleMeters:
        fabric.minWholesaleMeters != null ? Number(fabric.minWholesaleMeters) : null,
      wholesaleNote: fabric.wholesaleNote,
      cargoUsdPerKg: data.type === "FABRIC" ? cargoUsdPerKg : 0,
      globals: globalsForDeliveryType(globals, fabric.deliveryType),
    });
  }

  return { material, duplicates };
}

export async function updateMaterial(
  id: string,
  raw: MaterialFormValues,
  options?: { preservePurchaseTerms?: boolean },
) {
  const data = materialFormSchema.parse(raw);
  const globals = await getFabricPricingGlobals();
  const fabric = fabricDataFromForm(data, globals);
  const preserve = options?.preservePurchaseTerms === true && data.type === "FABRIC";

  const duplicates = await findLikelyMaterialDuplicates({
    nameUk: data.nameUk,
    unitOfMeasureId: data.unitOfMeasureId,
    excludeId: id,
  });

  const material = await prisma.material.update({
    where: { id },
    data: {
      nameUk: data.nameUk,
      type: data.type as MaterialType,
      category: data.categoryId
        ? { connect: { id: data.categoryId } }
        : { disconnect: true },
      unitOfMeasure: { connect: { id: data.unitOfMeasureId } },
      defaultWastePercent: data.defaultWastePercent,
      colorOrAttribute: data.colorOrAttribute || null,
      availableColors: data.availableColors ?? [],
      note: data.note || null,
      referenceUrls: data.referenceUrls ?? [],
      ...(prismaMaterialHasField("tagColor")
        ? { tagColor: data.tagColor || null }
        : {}),
      densityGsm: fabric.densityGsm,
      composition: fabric.composition,
      metersPerKg: fabric.metersPerKg,
      fabricKindUk: fabric.fabricKindUk,
      widthCm: fabric.widthCm,
      rollWeightKg: fabric.rollWeightKg,
      metersPerRoll: fabric.metersPerRoll,
      minWholesaleMeters: fabric.minWholesaleMeters,
      costVatOverride: fabric.costVatOverride,
      deliveryType: fabric.deliveryType,
      unitsPerPack: fabric.unitsPerPack,
      ...(prismaMaterialHasField("unitsPerKg")
        ? { unitsPerKg: fabric.unitsPerKg }
        : {}),
      purchasePackPrice: fabric.purchasePackPrice,
      packDeliveryCostUah: fabric.packDeliveryCostUah,
      ...(preserve
        ? {}
        : {
            purchasePrice: fabric.purchasePrice,
            supplierCode: data.supplierCode || null,
            priceKgUsd: fabric.priceKgUsd,
            priceKgUsdCargo: fabric.priceKgUsdCargo,
            priceKgUsdVat: fabric.priceKgUsdVat,
            priceMeterUahNoVat: fabric.priceMeterUahNoVat,
            priceMeterUahVat: fabric.priceMeterUahVat,
            priceMeterUahCutVat: fabric.priceMeterUahCutVat,
            wholesaleNote: fabric.wholesaleNote,
          }),
    },
    include: {
      unitOfMeasure: true,
      category: true,
    },
  });

  // Stale Prisma runtime may omit newer columns — write units via SQL when needed.
  if (!prismaMaterialHasField("unitsPerKg")) {
    await prisma.$executeRaw`
      UPDATE materials SET units_per_kg = ${fabric.unitsPerKg} WHERE id = ${id}
    `;
  }
  // Always persist tag via SQL so the catalog row stays in sync.
  await writeMaterialTagColor(id, data.tagColor || null);

  if (!preserve && data.type === "FABRIC" && data.supplierCode) {
    const { syncPrimarySupplierOfferFromMaterial } = await import(
      "@/server/domains/catalog/suppliers"
    );
    const cargoUsdPerKg = deliveryRateUsdPerKg(fabric.deliveryType, globals);
    await syncPrimarySupplierOfferFromMaterial({
      materialId: material.id,
      supplierNameUk: data.supplierCode,
      metersPerKg: fabric.metersPerKg != null ? Number(fabric.metersPerKg) : null,
      priceKgUsd: fabric.priceKgUsd != null ? Number(fabric.priceKgUsd) : null,
      priceKgUsdCargo:
        fabric.priceKgUsdCargo != null ? Number(fabric.priceKgUsdCargo) : null,
      priceKgUsdVat: fabric.priceKgUsdVat != null ? Number(fabric.priceKgUsdVat) : null,
      priceMeterUahNoVat:
        fabric.priceMeterUahNoVat != null ? Number(fabric.priceMeterUahNoVat) : null,
      priceMeterUahVat:
        fabric.priceMeterUahVat != null ? Number(fabric.priceMeterUahVat) : null,
      priceMeterUahCutVat:
        fabric.priceMeterUahCutVat != null ? Number(fabric.priceMeterUahCutVat) : null,
      rollWeightKg: fabric.rollWeightKg != null ? Number(fabric.rollWeightKg) : null,
      metersPerRoll: fabric.metersPerRoll != null ? Number(fabric.metersPerRoll) : null,
      minWholesaleMeters:
        fabric.minWholesaleMeters != null ? Number(fabric.minWholesaleMeters) : null,
      wholesaleNote: fabric.wholesaleNote,
      cargoUsdPerKg,
      globals: globalsForDeliveryType(globals, fabric.deliveryType),
    });
  }

  return { material, duplicates };
}

export async function updateMaterialAvailableColors(id: string, colors: string[]) {
  const { mergeColorLists } = await import("@/lib/trim-colors");
  const availableColors = mergeColorLists(colors);
  return prisma.material.update({
    where: { id },
    data: { availableColors },
    select: { id: true, availableColors: true },
  });
}

/** Recompute purchasePrice for all fabrics after company VAT policy / rate change. */
export async function resyncFabricPurchasePrices() {
  const globals = await getFabricPricingGlobals();
  const fabrics = await prisma.material.findMany({
    where: { type: "FABRIC", status: "ACTIVE" },
  });

  let count = 0;
  for (const row of fabrics) {
    const hasKgBasis =
      row.priceKgUsd != null &&
      Number(row.priceKgUsd) > 0 &&
      row.metersPerKg != null &&
      Number(row.metersPerKg) > 0;
    // Material COGS only — cargo is tracked separately as delivery.
    const derived = deriveFabricPricing(
      {
        metersPerKg: row.metersPerKg != null ? Number(row.metersPerKg) : null,
        priceKgUsd: row.priceKgUsd != null ? Number(row.priceKgUsd) : null,
        priceKgUsdCargo: row.priceKgUsdCargo != null ? Number(row.priceKgUsdCargo) : null,
        priceKgUsdVat: row.priceKgUsdVat != null ? Number(row.priceKgUsdVat) : null,
        priceMeterUahNoVat: hasKgBasis
          ? null
          : row.priceMeterUahNoVat != null
            ? Number(row.priceMeterUahNoVat)
            : null,
        priceMeterUahVat: hasKgBasis
          ? null
          : row.priceMeterUahVat != null
            ? Number(row.priceMeterUahVat)
            : null,
        priceMeterUahCutVat:
          row.priceMeterUahCutVat != null ? Number(row.priceMeterUahCutVat) : null,
        rollWeightKg: row.rollWeightKg != null ? Number(row.rollWeightKg) : null,
        metersPerRoll: row.metersPerRoll != null ? Number(row.metersPerRoll) : null,
        minWholesaleMeters:
          row.minWholesaleMeters != null ? Number(row.minWholesaleMeters) : null,
        costVatOverride: row.costVatOverride,
      },
      globals,
    );
    if (derived.purchasePrice <= 0) continue;
    await prisma.material.update({
      where: { id: row.id },
      data: {
        purchasePrice: derived.purchasePrice,
        priceKgUsdCargo: derived.priceKgUsdCargo,
        priceMeterUahNoVat: derived.priceMeterUahNoVat,
        priceMeterUahVat: derived.priceMeterUahVat,
        metersPerRoll: derived.metersPerRoll,
      },
    });
    count += 1;
  }
  return { count };
}

/** Clone material + primary supplier offers under a new name. */
export async function duplicateMaterial(
  sourceId: string,
  options?: { nameUk?: string },
) {
  const source = await prisma.material.findUnique({
    where: { id: sourceId },
    include: {
      supplierOffers: {
        include: { supplier: true },
        orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
      },
    },
  });
  if (!source || source.status === "ARCHIVED") {
    throw new Error("MATERIAL_NOT_FOUND");
  }

  const preferred =
    options?.nameUk?.replace(/\s+/g, " ").trim() || `${source.nameUk} (копія)`;
  let nameUk = preferred;
  const taken = await prisma.material.findFirst({
    where: {
      nameUk: { equals: nameUk, mode: "insensitive" },
      unitOfMeasureId: source.unitOfMeasureId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (taken) {
    nameUk = `${preferred} ${Date.now().toString(36)}`;
  }

  const copy = await prisma.material.create({
    data: {
      nameUk,
      type: source.type,
      categoryId: source.categoryId,
      unitOfMeasureId: source.unitOfMeasureId,
      purchasePrice: source.purchasePrice,
      defaultWastePercent: source.defaultWastePercent,
      supplierCode: source.supplierCode,
      colorOrAttribute: source.colorOrAttribute,
      availableColors: source.availableColors,
      note: source.note,
      referenceUrls: source.referenceUrls ?? [],
      tagColor: source.tagColor,
      densityGsm: source.densityGsm,
      composition: source.composition,
      metersPerKg: source.metersPerKg,
      priceKgUsd: source.priceKgUsd,
      priceKgUsdCargo: source.priceKgUsdCargo,
      priceKgUsdVat: source.priceKgUsdVat,
      priceMeterUahNoVat: source.priceMeterUahNoVat,
      priceMeterUahVat: source.priceMeterUahVat,
      priceMeterUahCutVat: source.priceMeterUahCutVat,
      fabricKindUk: source.fabricKindUk,
      widthCm: source.widthCm,
      wholesaleNote: source.wholesaleNote,
      rollWeightKg: source.rollWeightKg,
      metersPerRoll: source.metersPerRoll,
      minWholesaleMeters: source.minWholesaleMeters,
      costVatOverride: source.costVatOverride,
      deliveryType: source.deliveryType,
      unitsPerPack: source.unitsPerPack,
      unitsPerKg: source.unitsPerKg,
      purchasePackPrice: source.purchasePackPrice,
      packDeliveryCostUah: source.packDeliveryCostUah,
      status: "ACTIVE",
    },
  });

  for (const offer of source.supplierOffers) {
    await prisma.materialSupplier.create({
      data: {
        materialId: copy.id,
        supplierId: offer.supplierId,
        isPrimary: offer.isPrimary,
        metersPerKg: offer.metersPerKg,
        deliveryType: offer.deliveryType,
        cargoUsdPerKg: offer.cargoUsdPerKg,
        npStandardUsdPerKg: offer.npStandardUsdPerKg,
        npVolumeUsdPerKg: offer.npVolumeUsdPerKg,
        priceKgUsd: offer.priceKgUsd,
        priceKgUsdCargo: offer.priceKgUsdCargo,
        priceKgUsdVat: offer.priceKgUsdVat,
        priceMeterUahNoVat: offer.priceMeterUahNoVat,
        priceMeterUahVat: offer.priceMeterUahVat,
        priceMeterUahCutVat: offer.priceMeterUahCutVat,
        rollWeightKg: offer.rollWeightKg,
        metersPerRoll: offer.metersPerRoll,
        minWholesaleMeters: offer.minWholesaleMeters,
        wholesaleNote: offer.wholesaleNote,
        availableColors: offer.availableColors,
        purchasePackPrice: offer.purchasePackPrice,
        packDeliveryCostUah: offer.packDeliveryCostUah,
      },
    });
  }

  return copy;
}

export async function archiveMaterial(id: string) {
  return prisma.material.update({
    where: { id },
    data: { status: "ARCHIVED" },
  });
}

export async function archiveMaterials(ids: string[]) {
  if (ids.length === 0) return { count: 0 };
  return prisma.material.updateMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
}

export async function listUnits() {
  return prisma.unitOfMeasure.findMany({
    where: { status: "ACTIVE" },
    orderBy: { code: "asc" },
  });
}

/** Distinct supplier names from active materials (for fabric form select). */
export async function listSupplierNames() {
  const rows = await prisma.material.findMany({
    where: { status: "ACTIVE", supplierCode: { not: null } },
    select: { supplierCode: true },
    distinct: ["supplierCode"],
    orderBy: { supplierCode: "asc" },
  });
  return rows
    .map((row) => row.supplierCode?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}

/** Distinct compositions from active materials (fabrics and trim). */
export async function listCompositionNames() {
  const rows = await prisma.material.findMany({
    where: { status: "ACTIVE", composition: { not: null } },
    select: { composition: true },
    distinct: ["composition"],
    orderBy: { composition: "asc" },
  });
  return rows
    .map((row) => row.composition?.replace(/\s+/g, " ").trim())
    .filter((value): value is string => Boolean(value));
}
