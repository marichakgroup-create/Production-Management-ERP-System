import { prisma } from "@/server/db/client";
import {
  deriveFabricPricing,
  type FabricPricingGlobals,
} from "@/lib/fabric-pricing";
import { getFabricPricingGlobals } from "@/server/domains/catalog/materials";
import { mergeColorLists } from "@/lib/trim-colors";
import { normalizeFabricDeliveryType } from "@/lib/fabric-delivery-types";
import { resolveSupplierDeliveryRate } from "@/lib/supplier-delivery-rates";
import {
  deriveTrimUnitPriceFromSupplier,
  hasTrimKgQuote,
  hasTrimPackQuote,
} from "@/lib/trim-pack-pricing";

function optionalRate(value: number | null | undefined): number | null {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
  return Number(value);
}

export async function listSuppliers(params?: { search?: string }) {
  const search = params?.search?.trim();
  return prisma.supplier.findMany({
    where: {
      status: "ACTIVE",
      ...(search
        ? {
            OR: [
              { nameUk: { contains: search, mode: "insensitive" as const } },
              { contactPerson: { contains: search, mode: "insensitive" as const } },
              { phone: { contains: search, mode: "insensitive" as const } },
              { email: { contains: search, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    include: {
      _count: { select: { materialOffers: true } },
    },
    orderBy: { nameUk: "asc" },
  });
}

export type SupplierContactInput = {
  nameUk: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  note?: string | null;
  defaultCargoUsdPerKg?: number | null;
};

export async function createSupplierContact(input: SupplierContactInput) {
  const nameUk = input.nameUk.replace(/\s+/g, " ").trim();
  if (!nameUk) throw new Error("NAME_REQUIRED");
  return prisma.supplier.create({
    data: {
      nameUk,
      contactPerson: input.contactPerson?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      website: input.website?.trim() || null,
      note: input.note?.trim() || null,
      defaultCargoUsdPerKg:
        input.defaultCargoUsdPerKg != null && Number.isFinite(input.defaultCargoUsdPerKg)
          ? input.defaultCargoUsdPerKg
          : null,
    },
  });
}

export async function updateSupplierContact(id: string, input: SupplierContactInput) {
  const nameUk = input.nameUk.replace(/\s+/g, " ").trim();
  if (!nameUk) throw new Error("NAME_REQUIRED");
  return prisma.supplier.update({
    where: { id },
    data: {
      nameUk,
      contactPerson: input.contactPerson?.trim() || null,
      phone: input.phone?.trim() || null,
      email: input.email?.trim() || null,
      website: input.website?.trim() || null,
      note: input.note?.trim() || null,
      ...(input.defaultCargoUsdPerKg !== undefined
        ? {
            defaultCargoUsdPerKg:
              input.defaultCargoUsdPerKg != null && Number.isFinite(input.defaultCargoUsdPerKg)
                ? input.defaultCargoUsdPerKg
                : null,
          }
        : {}),
    },
  });
}

export async function archiveSuppliers(ids: string[]) {
  if (ids.length === 0) return { count: 0 };
  return prisma.supplier.updateMany({
    where: { id: { in: ids }, status: "ACTIVE" },
    data: { status: "ARCHIVED" },
  });
}

export async function findOrCreateSupplier(input: {
  nameUk: string;
  defaultCargoUsdPerKg?: number | null;
}) {
  const nameUk = input.nameUk.replace(/\s+/g, " ").trim();
  if (!nameUk) return null;

  const existing = await prisma.supplier.findFirst({
    where: { nameUk: { equals: nameUk, mode: "insensitive" } },
  });
  if (existing) {
    if (
      input.defaultCargoUsdPerKg != null &&
      existing.defaultCargoUsdPerKg == null
    ) {
      return prisma.supplier.update({
        where: { id: existing.id },
        data: { defaultCargoUsdPerKg: input.defaultCargoUsdPerKg },
      });
    }
    return existing;
  }

  return prisma.supplier.create({
    data: {
      nameUk,
      defaultCargoUsdPerKg: input.defaultCargoUsdPerKg ?? null,
    },
  });
}

export type MaterialSupplierOfferInput = {
  supplierId?: string | null;
  supplierNameUk?: string | null;
  isPrimary?: boolean;
  metersPerKg?: number | null;
  deliveryType?: string | null;
  cargoUsdPerKg?: number | null;
  npStandardUsdPerKg?: number | null;
  npVolumeUsdPerKg?: number | null;
  /** Trim pack quote (₴) — with material.unitsPerPack derives unit price. */
  purchasePackPrice?: number | null;
  packDeliveryCostUah?: number | null;
  priceKgUsd?: number | null;
  priceKgUsdVat?: number | null;
  priceMeterUahNoVat?: number | null;
  priceMeterUahVat?: number | null;
  priceMeterUahCutVat?: number | null;
  rollWeightKg?: number | null;
  metersPerRoll?: number | null;
  minWholesaleMeters?: number | null;
  wholesaleNote?: string | null;
  availableColors?: string[] | null;
};

/** Upsert primary offer from material form fields (supplier name + prices on Material). */
export async function syncPrimarySupplierOfferFromMaterial(input: {
  materialId: string;
  supplierNameUk?: string | null;
  metersPerKg?: number | null;
  cargoUsdPerKg?: number | null;
  priceKgUsd?: number | null;
  priceKgUsdCargo?: number | null;
  priceKgUsdVat?: number | null;
  priceMeterUahNoVat?: number | null;
  priceMeterUahVat?: number | null;
  priceMeterUahCutVat?: number | null;
  rollWeightKg?: number | null;
  metersPerRoll?: number | null;
  minWholesaleMeters?: number | null;
  wholesaleNote?: string | null;
  globals?: FabricPricingGlobals;
}) {
  const supplier = await findOrCreateSupplier({
    nameUk: input.supplierNameUk ?? "",
    defaultCargoUsdPerKg: null,
  });
  if (!supplier) return null;

  const globals = input.globals ?? (await getFabricPricingGlobals());
  const cargoUsdPerKg =
    input.cargoUsdPerKg != null && Number.isFinite(input.cargoUsdPerKg)
      ? Number(input.cargoUsdPerKg)
      : input.priceKgUsd != null && input.priceKgUsdCargo != null
        ? Number(input.priceKgUsdCargo) - Number(input.priceKgUsd)
        : globals.fabricCargoUsdPerKg;

  const derived = deriveFabricPricing(
    {
      metersPerKg: input.metersPerKg,
      priceKgUsd: input.priceKgUsd,
      priceKgUsdCargo: input.priceKgUsdCargo,
      priceKgUsdVat: input.priceKgUsdVat,
      priceMeterUahNoVat: input.priceMeterUahNoVat,
      priceMeterUahVat: input.priceMeterUahVat,
      priceMeterUahCutVat: input.priceMeterUahCutVat,
      rollWeightKg: input.rollWeightKg,
      metersPerRoll: input.metersPerRoll,
      minWholesaleMeters: input.minWholesaleMeters,
    },
    {
      ...globals,
      fabricCargoUsdPerKg:
        cargoUsdPerKg >= 0 ? cargoUsdPerKg : globals.fabricCargoUsdPerKg,
    },
  );

  await prisma.materialSupplier.updateMany({
    where: { materialId: input.materialId, isPrimary: true },
    data: { isPrimary: false },
  });

  const offer = await prisma.materialSupplier.upsert({
    where: {
      materialId_supplierId: {
        materialId: input.materialId,
        supplierId: supplier.id,
      },
    },
    create: {
      materialId: input.materialId,
      supplierId: supplier.id,
      isPrimary: true,
      metersPerKg: input.metersPerKg ?? null,
      cargoUsdPerKg: cargoUsdPerKg >= 0 ? cargoUsdPerKg : null,
      priceKgUsd: input.priceKgUsd ?? null,
      priceKgUsdCargo: derived.priceKgUsdCargo,
      priceKgUsdVat: input.priceKgUsdVat ?? null,
      priceMeterUahNoVat: derived.priceMeterUahNoVat,
      priceMeterUahVat: derived.priceMeterUahVat,
      priceMeterUahCutVat: input.priceMeterUahCutVat ?? null,
      rollWeightKg: input.rollWeightKg ?? null,
      metersPerRoll: derived.metersPerRoll,
      minWholesaleMeters: input.minWholesaleMeters ?? derived.minWholesaleMeters,
      wholesaleNote: input.wholesaleNote ?? null,
    },
    update: {
      isPrimary: true,
      metersPerKg: input.metersPerKg ?? null,
      cargoUsdPerKg: cargoUsdPerKg >= 0 ? cargoUsdPerKg : null,
      priceKgUsd: input.priceKgUsd ?? null,
      priceKgUsdCargo: derived.priceKgUsdCargo,
      priceKgUsdVat: input.priceKgUsdVat ?? null,
      priceMeterUahNoVat: derived.priceMeterUahNoVat,
      priceMeterUahVat: derived.priceMeterUahVat,
      priceMeterUahCutVat: input.priceMeterUahCutVat ?? null,
      rollWeightKg: input.rollWeightKg ?? null,
      metersPerRoll: derived.metersPerRoll,
      minWholesaleMeters: input.minWholesaleMeters ?? derived.minWholesaleMeters,
      wholesaleNote: input.wholesaleNote ?? null,
    },
    include: { supplier: true },
  });

  await prisma.material.update({
    where: { id: input.materialId },
    data: {
      supplierCode: supplier.nameUk,
      purchasePrice: derived.purchasePrice > 0 ? derived.purchasePrice : undefined,
      priceKgUsdCargo: derived.priceKgUsdCargo,
      priceMeterUahNoVat: derived.priceMeterUahNoVat,
      priceMeterUahVat: derived.priceMeterUahVat,
      metersPerRoll: derived.metersPerRoll,
      minWholesaleMeters: input.minWholesaleMeters ?? derived.minWholesaleMeters,
    },
  });

  return offer;
}

export async function listMaterialSupplierOffers(materialId: string) {
  return prisma.materialSupplier.findMany({
    where: { materialId },
    include: { supplier: true },
    orderBy: [{ isPrimary: "desc" }, { updatedAt: "desc" }],
  });
}

export async function upsertMaterialSupplierOffer(
  materialId: string,
  offer: MaterialSupplierOfferInput,
) {
  const supplier =
    offer.supplierId
      ? await prisma.supplier.findUniqueOrThrow({ where: { id: offer.supplierId } })
      : await findOrCreateSupplier({ nameUk: offer.supplierNameUk ?? "" });
  if (!supplier) throw new Error("SUPPLIER_REQUIRED");

  const material = await prisma.material.findUnique({ where: { id: materialId } });
  if (!material) throw new Error("MATERIAL_NOT_FOUND");

  const globals = await getFabricPricingGlobals();
  const isFabric = material.type === "FABRIC";

  const purchasePackPrice = optionalRate(offer.purchasePackPrice);
  const deliveryType = normalizeFabricDeliveryType(offer.deliveryType);
  const cargoUsdPerKg = optionalRate(offer.cargoUsdPerKg);
  const npStandardUsdPerKg = optionalRate(offer.npStandardUsdPerKg);
  const npVolumeUsdPerKg = optionalRate(offer.npVolumeUsdPerKg);
  // Typed rates are always $/кг. Legacy fixed ₴/уп. stays on packDeliveryCostUah only.
  const packDeliveryCostUah = optionalRate(offer.packDeliveryCostUah);
  const priceKgUsd = optionalRate(offer.priceKgUsd);

  const unitsPerPack = material.unitsPerPack;
  const unitsPerKg =
    material.unitsPerKg != null && Number(material.unitsPerKg) > 0
      ? Number(material.unitsPerKg)
      : null;
  const unitPrice = deriveTrimUnitPriceFromSupplier({
    unitsPerPack,
    purchasePackPrice,
    packDeliveryCostUah,
    unitsPerKg,
    priceKgUsd,
    usdUahRate: globals.usdUahRate,
    fallbackUnitPrice: optionalRate(offer.priceMeterUahNoVat) ?? 0,
  });
  const hasDerived =
    hasTrimKgQuote({
      unitsPerKg,
      priceKgUsd,
      usdUahRate: globals.usdUahRate,
    }) ||
    hasTrimPackQuote({ unitsPerPack, purchasePackPrice, packDeliveryCostUah }) ||
    optionalRate(offer.priceMeterUahNoVat) != null;
  const unitPriceOrNull = hasDerived ? unitPrice : optionalRate(offer.priceMeterUahNoVat);

  if (!isFabric) {
    if (offer.isPrimary) {
      await prisma.materialSupplier.updateMany({
        where: { materialId, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const cutPrice =
      offer.priceMeterUahCutVat != null &&
      Number.isFinite(offer.priceMeterUahCutVat) &&
      offer.priceMeterUahCutVat > 0
        ? offer.priceMeterUahCutVat
        : null;
    const minWholesale =
      cutPrice != null &&
      offer.minWholesaleMeters != null &&
      Number.isFinite(offer.minWholesaleMeters) &&
      offer.minWholesaleMeters > 0
        ? offer.minWholesaleMeters
        : null;

    const row = await prisma.materialSupplier.upsert({
      where: {
        materialId_supplierId: { materialId, supplierId: supplier.id },
      },
      create: {
        materialId,
        supplierId: supplier.id,
        isPrimary: offer.isPrimary ?? false,
        deliveryType,
        cargoUsdPerKg,
        npStandardUsdPerKg,
        npVolumeUsdPerKg,
        purchasePackPrice: priceKgUsd != null ? null : purchasePackPrice,
        packDeliveryCostUah: priceKgUsd != null ? null : packDeliveryCostUah,
        priceKgUsd,
        priceMeterUahNoVat: unitPriceOrNull,
        priceMeterUahVat: unitPriceOrNull,
        priceMeterUahCutVat: cutPrice,
        minWholesaleMeters: minWholesale,
        wholesaleNote: offer.wholesaleNote ?? null,
        availableColors: offer.availableColors ?? [],
      },
      update: {
        isPrimary: offer.isPrimary ?? false,
        deliveryType,
        cargoUsdPerKg,
        npStandardUsdPerKg,
        npVolumeUsdPerKg,
        purchasePackPrice: priceKgUsd != null ? null : purchasePackPrice,
        packDeliveryCostUah: priceKgUsd != null ? null : packDeliveryCostUah,
        priceKgUsd,
        priceMeterUahNoVat: unitPriceOrNull,
        priceMeterUahVat: unitPriceOrNull,
        priceMeterUahCutVat: cutPrice,
        minWholesaleMeters: minWholesale,
        wholesaleNote: offer.wholesaleNote ?? null,
        ...(offer.availableColors !== undefined
          ? { availableColors: offer.availableColors ?? [] }
          : {}),
      },
      include: { supplier: true },
    });

    if (row.isPrimary && unitPriceOrNull != null) {
      await prisma.material.update({
        where: { id: materialId },
        data: {
          supplierCode: supplier.nameUk,
          purchasePrice: unitPriceOrNull,
          purchasePackPrice: priceKgUsd != null ? null : purchasePackPrice,
          packDeliveryCostUah: priceKgUsd != null ? null : packDeliveryCostUah,
          priceKgUsd,
          priceMeterUahNoVat: unitPriceOrNull,
          priceMeterUahVat: unitPriceOrNull,
          priceMeterUahCutVat: cutPrice,
          minWholesaleMeters: minWholesale,
          wholesaleNote: offer.wholesaleNote ?? undefined,
          ...(offer.availableColors !== undefined
            ? { availableColors: mergeColorLists(offer.availableColors ?? []) }
            : {}),
        },
      });
    }

    if (offer.availableColors !== undefined) {
      await rememberSupplierPalette(supplier.id, offer.availableColors ?? []);
    }

    return row;
  }

  const resolved = resolveSupplierDeliveryRate(
    {
      deliveryType,
      cargoUsdPerKg,
      npStandardUsdPerKg,
      npVolumeUsdPerKg,
    },
    globals,
  );

  const derived = deriveFabricPricing(
    {
      metersPerKg: offer.metersPerKg,
      priceKgUsd: offer.priceKgUsd,
      priceKgUsdVat: offer.priceKgUsdVat,
      priceMeterUahNoVat: offer.priceMeterUahNoVat,
      priceMeterUahVat: offer.priceMeterUahVat,
      priceMeterUahCutVat: offer.priceMeterUahCutVat,
      rollWeightKg: offer.rollWeightKg,
      metersPerRoll: offer.metersPerRoll,
      minWholesaleMeters: offer.minWholesaleMeters,
    },
    { ...globals, fabricCargoUsdPerKg: resolved.rateUsdPerKg },
  );

  if (offer.isPrimary) {
    await prisma.materialSupplier.updateMany({
      where: { materialId, isPrimary: true },
      data: { isPrimary: false },
    });
  }

  const cutPrice =
    offer.priceMeterUahCutVat != null &&
    Number.isFinite(offer.priceMeterUahCutVat) &&
    offer.priceMeterUahCutVat > 0
      ? offer.priceMeterUahCutVat
      : null;
  const minWholesale =
    cutPrice != null &&
    offer.minWholesaleMeters != null &&
    Number.isFinite(offer.minWholesaleMeters) &&
    offer.minWholesaleMeters > 0
      ? offer.minWholesaleMeters
      : null;

  const row = await prisma.materialSupplier.upsert({
    where: {
      materialId_supplierId: { materialId, supplierId: supplier.id },
    },
    create: {
      materialId,
      supplierId: supplier.id,
      isPrimary: offer.isPrimary ?? false,
      metersPerKg: offer.metersPerKg ?? null,
      deliveryType: resolved.type,
      cargoUsdPerKg,
      npStandardUsdPerKg,
      npVolumeUsdPerKg,
      priceKgUsd: offer.priceKgUsd ?? null,
      priceKgUsdCargo: derived.priceKgUsdCargo,
      priceKgUsdVat: offer.priceKgUsdVat ?? null,
      priceMeterUahNoVat: derived.priceMeterUahNoVat,
      priceMeterUahVat: derived.priceMeterUahVat,
      priceMeterUahCutVat: cutPrice,
      rollWeightKg: offer.rollWeightKg ?? null,
      metersPerRoll: derived.metersPerRoll,
      minWholesaleMeters: minWholesale,
      wholesaleNote: offer.wholesaleNote ?? null,
      availableColors: offer.availableColors ?? [],
    },
    update: {
      isPrimary: offer.isPrimary ?? false,
      metersPerKg: offer.metersPerKg ?? null,
      deliveryType: resolved.type,
      cargoUsdPerKg,
      npStandardUsdPerKg,
      npVolumeUsdPerKg,
      priceKgUsd: offer.priceKgUsd ?? null,
      priceKgUsdCargo: derived.priceKgUsdCargo,
      priceKgUsdVat: offer.priceKgUsdVat ?? null,
      priceMeterUahNoVat: derived.priceMeterUahNoVat,
      priceMeterUahVat: derived.priceMeterUahVat,
      priceMeterUahCutVat: cutPrice,
      rollWeightKg: offer.rollWeightKg ?? null,
      metersPerRoll: derived.metersPerRoll,
      minWholesaleMeters: minWholesale,
      wholesaleNote: offer.wholesaleNote ?? null,
      ...(offer.availableColors !== undefined
        ? { availableColors: offer.availableColors ?? [] }
        : {}),
    },
    include: { supplier: true },
  });

  if (row.isPrimary) {
    await prisma.material.update({
      where: { id: materialId },
      data: {
        supplierCode: supplier.nameUk,
        deliveryType: resolved.type,
        purchasePrice: derived.purchasePrice,
        metersPerKg: offer.metersPerKg ?? undefined,
        priceKgUsd: offer.priceKgUsd ?? undefined,
        priceKgUsdCargo: derived.priceKgUsdCargo,
        priceKgUsdVat: offer.priceKgUsdVat ?? undefined,
        priceMeterUahNoVat: derived.priceMeterUahNoVat,
        priceMeterUahVat: derived.priceMeterUahVat,
        priceMeterUahCutVat: cutPrice,
        metersPerRoll: derived.metersPerRoll,
        minWholesaleMeters: minWholesale,
        wholesaleNote: offer.wholesaleNote ?? undefined,
        ...(offer.availableColors !== undefined
          ? { availableColors: mergeColorLists(offer.availableColors ?? []) }
          : {}),
      },
    });
  }

  if (offer.availableColors !== undefined) {
    // Per-material palette only — never copy onto other SKUs of the same supplier.
    await rememberSupplierPalette(
      supplier.id,
      mergeColorLists(offer.availableColors ?? []),
    );
  }

  return row;
}

/**
 * Optional prefill for a new offer from this supplier’s last saved palette.
 * Full pick-list lives in the UI (sharedColorPickList); never mutates other materials.
 */
export async function getSupplierRememberedPalette(supplierNameUk: string) {
  const nameUk = supplierNameUk.replace(/\s+/g, " ").trim();
  if (!nameUk) return [] as string[];

  const supplier = await prisma.supplier.findFirst({
    where: { nameUk: { equals: nameUk, mode: "insensitive" } },
    select: { id: true, defaultAvailableColors: true },
  });
  if (!supplier) return [];

  if ((supplier.defaultAvailableColors?.length ?? 0) > 0) {
    return mergeColorLists(supplier.defaultAvailableColors);
  }

  const offers = await prisma.materialSupplier.findMany({
    where: { supplierId: supplier.id },
    orderBy: { updatedAt: "desc" },
    take: 30,
    select: { availableColors: true },
  });
  return mergeColorLists(...offers.map((row) => row.availableColors ?? []));
}

async function rememberSupplierPalette(supplierId: string, colors: string[]) {
  const next = mergeColorLists(colors);
  await prisma.supplier.update({
    where: { id: supplierId },
    data: { defaultAvailableColors: next },
  });
}

export async function deleteMaterialSupplierOffer(id: string) {
  const row = await prisma.materialSupplier.findUnique({ where: { id } });
  if (!row) return;
  if (row.isPrimary) throw new Error("PRIMARY_OFFER");
  await prisma.materialSupplier.delete({ where: { id } });
}

/** Promote an existing offer to primary and mirror its terms onto Material. */
export async function setPrimaryMaterialSupplierOffer(offerId: string) {
  const row = await prisma.materialSupplier.findUnique({
    where: { id: offerId },
    include: { supplier: true },
  });
  if (!row) throw new Error("NOT_FOUND");

  await prisma.materialSupplier.updateMany({
    where: { materialId: row.materialId, isPrimary: true },
    data: { isPrimary: false },
  });

  const primary = await prisma.materialSupplier.update({
    where: { id: offerId },
    data: { isPrimary: true },
    include: { supplier: true },
  });

  const globals = await getFabricPricingGlobals();
  const resolved = resolveSupplierDeliveryRate(
    {
      deliveryType: primary.deliveryType,
      cargoUsdPerKg:
        primary.cargoUsdPerKg != null ? Number(primary.cargoUsdPerKg) : null,
      npStandardUsdPerKg:
        primary.npStandardUsdPerKg != null ? Number(primary.npStandardUsdPerKg) : null,
      npVolumeUsdPerKg:
        primary.npVolumeUsdPerKg != null ? Number(primary.npVolumeUsdPerKg) : null,
    },
    globals,
  );
  const derived = deriveFabricPricing(
    {
      metersPerKg: primary.metersPerKg != null ? Number(primary.metersPerKg) : null,
      priceKgUsd: primary.priceKgUsd != null ? Number(primary.priceKgUsd) : null,
      priceKgUsdCargo:
        primary.priceKgUsdCargo != null ? Number(primary.priceKgUsdCargo) : null,
      priceKgUsdVat: primary.priceKgUsdVat != null ? Number(primary.priceKgUsdVat) : null,
      priceMeterUahNoVat:
        primary.priceMeterUahNoVat != null ? Number(primary.priceMeterUahNoVat) : null,
      priceMeterUahVat:
        primary.priceMeterUahVat != null ? Number(primary.priceMeterUahVat) : null,
      priceMeterUahCutVat:
        primary.priceMeterUahCutVat != null ? Number(primary.priceMeterUahCutVat) : null,
      rollWeightKg: primary.rollWeightKg != null ? Number(primary.rollWeightKg) : null,
      metersPerRoll: primary.metersPerRoll != null ? Number(primary.metersPerRoll) : null,
      minWholesaleMeters:
        primary.minWholesaleMeters != null ? Number(primary.minWholesaleMeters) : null,
    },
    { ...globals, fabricCargoUsdPerKg: resolved.rateUsdPerKg },
  );

  await prisma.material.update({
    where: { id: row.materialId },
    data: {
      supplierCode: primary.supplier.nameUk,
      deliveryType: resolved.type,
      purchasePrice: derived.purchasePrice > 0 ? derived.purchasePrice : undefined,
      metersPerKg: primary.metersPerKg ?? undefined,
      priceKgUsd: primary.priceKgUsd ?? undefined,
      priceKgUsdCargo: derived.priceKgUsdCargo,
      priceKgUsdVat: primary.priceKgUsdVat ?? undefined,
      priceMeterUahNoVat: derived.priceMeterUahNoVat,
      priceMeterUahVat: derived.priceMeterUahVat,
      priceMeterUahCutVat: primary.priceMeterUahCutVat ?? undefined,
      metersPerRoll: derived.metersPerRoll,
      minWholesaleMeters: primary.minWholesaleMeters ?? derived.minWholesaleMeters,
      wholesaleNote: primary.wholesaleNote,
    },
  });

  return primary;
}
