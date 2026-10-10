import "dotenv/config";
import { config } from "dotenv";
import { hash } from "bcryptjs";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { calculateCosting } from "../src/server/domains/calculation/engine";
import {
  INTL_MEN_VARIANT_DESCRIPTION,
  INTL_UNISEX_VARIANT_DESCRIPTION,
  INTL_WOMEN_VARIANT_DESCRIPTION,
  KIDS_HEIGHT_VARIANT_DESCRIPTION,
  UA_CHEST_VARIANT_DESCRIPTION,
  UA_HEIGHT_GUIDE,
  intlMenDescriptionUk,
  intlUnisexDescriptionUk,
  intlWomenDescriptionUk,
  kidsHeightDescriptionUk,
  uaChestDescriptionUk,
} from "../src/server/domains/size-charts/size-instructions";
import { seedCrmCatalog } from "./catalog/seed-catalog";
import { testNameVariants, withTestMarker } from "./catalog/test-marker";

config({ path: ".env.local" });
config({ path: ".env" });

const SEED_ORDER_PREFIX = "ЗМ-SEED-";

async function upsertCategory(
  prisma: PrismaClient,
  kind: string,
  nameUk: string,
) {
  return prisma.category.upsert({
    where: { kind_nameUk: { kind, nameUk } },
    update: { status: "ACTIVE" },
    create: { kind, nameUk },
  });
}

async function upsertMaterial(
  prisma: PrismaClient,
  data: {
    nameUk: string;
    type: "FABRIC" | "OTHER_MATERIAL" | "TRIM";
    categoryId: string | null;
    unitOfMeasureId: string;
    purchasePrice: number;
    defaultWastePercent: number;
    supplierCode?: string;
    colorOrAttribute?: string;
    note?: string;
    status?: "ACTIVE" | "ARCHIVED";
    densityGsm?: string | null;
    composition?: string | null;
    metersPerKg?: number | null;
    priceKgUsd?: number | null;
    priceKgUsdCargo?: number | null;
    priceKgUsdVat?: number | null;
    priceMeterUahNoVat?: number | null;
    priceMeterUahVat?: number | null;
    priceMeterUahCutVat?: number | null;
    fabricKindUk?: string | null;
    widthCm?: string | null;
    wholesaleNote?: string | null;
    rollWeightKg?: number | null;
    metersPerRoll?: number | null;
    /** Extra name variants to rematch (e.g. old "name · dens · supplier"). */
    legacyNames?: string[];
    availableColors?: string[];
  },
) {
  const legacyOnly = [
    ...new Set((data.legacyNames ?? []).flatMap((name) => testNameVariants(name))),
  ].filter(Boolean);

  let existing =
    data.type === "FABRIC"
      ? await prisma.material.findFirst({
          where: {
            type: "FABRIC",
            nameUk: data.nameUk,
            supplierCode: data.supplierCode ?? null,
            densityGsm: data.densityGsm ?? null,
          },
        })
      : await prisma.material.findFirst({
          where: { nameUk: { in: testNameVariants(data.nameUk) } },
        });

  // Exact legacy concatenated title only — never bare name (would merge suppliers)
  if (!existing && legacyOnly.length > 0) {
    existing = await prisma.material.findFirst({
      where: { nameUk: { in: legacyOnly } },
    });
  }

  // Rematch leftover "name · density · supplier" rows without merging densities/suppliers
  if (!existing && data.type === "FABRIC") {
    const candidates = await prisma.material.findMany({
      where: {
        type: "FABRIC",
        ...(data.supplierCode ? { supplierCode: data.supplierCode } : {}),
        OR: [
          { nameUk: { startsWith: `${data.nameUk} ·` } },
          ...(data.densityGsm
            ? [{ densityGsm: data.densityGsm }, { nameUk: { contains: data.densityGsm } }]
            : []),
        ],
      },
      take: 20,
    });
    existing =
      candidates.find((row) => {
        const densOk =
          (row.densityGsm ?? "") === (data.densityGsm ?? "") ||
          (data.densityGsm != null && row.nameUk.includes(`${data.densityGsm}`));
        const supplierOk =
          !data.supplierCode ||
          row.supplierCode === data.supplierCode ||
          row.nameUk.includes(data.supplierCode);
        const nameOk =
          row.nameUk === data.nameUk ||
          row.nameUk.startsWith(`${data.nameUk} ·`) ||
          legacyOnly.includes(row.nameUk);
        return densOk && supplierOk && nameOk;
      }) ?? null;
  }

  const fabricFields = {
    densityGsm: data.densityGsm ?? null,
    composition: data.composition ?? null,
    metersPerKg: data.metersPerKg ?? null,
    priceKgUsd: data.priceKgUsd ?? null,
    priceKgUsdCargo: data.priceKgUsdCargo ?? null,
    priceKgUsdVat: data.priceKgUsdVat ?? null,
    priceMeterUahNoVat: data.priceMeterUahNoVat ?? null,
    priceMeterUahVat: data.priceMeterUahVat ?? null,
    priceMeterUahCutVat: data.priceMeterUahCutVat ?? null,
    fabricKindUk: data.fabricKindUk ?? null,
    widthCm: data.widthCm ?? null,
    wholesaleNote: data.wholesaleNote ?? null,
    rollWeightKg: data.rollWeightKg ?? null,
    metersPerRoll: data.metersPerRoll ?? null,
  };
  if (existing) {
    return prisma.material.update({
      where: { id: existing.id },
      data: {
        nameUk: data.nameUk,
        type: data.type,
        categoryId: data.categoryId,
        unitOfMeasureId: data.unitOfMeasureId,
        purchasePrice: data.purchasePrice,
        defaultWastePercent: data.defaultWastePercent,
        supplierCode: data.supplierCode ?? null,
        colorOrAttribute: data.colorOrAttribute ?? null,
        note: data.note ?? null,
        status: data.status ?? "ACTIVE",
        availableColors: data.availableColors ?? [],
        ...fabricFields,
      },
      include: { unitOfMeasure: true },
    });
  }
  return prisma.material.create({
    data: {
      nameUk: data.nameUk,
      type: data.type,
      categoryId: data.categoryId,
      unitOfMeasureId: data.unitOfMeasureId,
      purchasePrice: data.purchasePrice,
      defaultWastePercent: data.defaultWastePercent,
      supplierCode: data.supplierCode ?? null,
      colorOrAttribute: data.colorOrAttribute ?? null,
      note: data.note ?? null,
      status: data.status ?? "ACTIVE",
      availableColors: data.availableColors ?? [],
      ...fabricFields,
    },
    include: { unitOfMeasure: true },
  });
}

async function upsertOperation(
  prisma: PrismaClient,
  data: {
    nameUk: string;
    categoryId: string | null;
    calculationMethod: "UNIT_RATE" | "SHIFT_OUTPUT" | "QUANTITY_TIER";
    baseRate?: number | null;
    shiftCost?: number | null;
    standardOutputPerShift?: number | null;
    note?: string;
  },
) {
  const variants = testNameVariants(data.nameUk);
  const existing = await prisma.operation.findFirst({
    where: { nameUk: { in: variants } },
  });
  if (existing) {
    return prisma.operation.update({
      where: { id: existing.id },
      data: {
        nameUk: data.nameUk,
        categoryId: data.categoryId,
        calculationMethod: data.calculationMethod,
        baseRate: data.baseRate ?? null,
        shiftCost: data.shiftCost ?? null,
        standardOutputPerShift: data.standardOutputPerShift ?? null,
        note: data.note ?? null,
        status: "ACTIVE",
      },
    });
  }
  return prisma.operation.create({
    data: {
      nameUk: data.nameUk,
      categoryId: data.categoryId,
      calculationMethod: data.calculationMethod,
      baseRate: data.baseRate ?? null,
      shiftCost: data.shiftCost ?? null,
      standardOutputPerShift: data.standardOutputPerShift ?? null,
      note: data.note ?? null,
    },
  });
}

/** Detach from products/orders, then hard-delete catalog operations. */
async function hardDeleteOperations(prisma: PrismaClient, ids: string[]) {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return;

  const productOps = await prisma.productOperation.findMany({
    where: { operationId: { in: unique } },
    select: { id: true },
  });
  const productOpIds = productOps.map((row) => row.id);
  if (productOpIds.length) {
    await prisma.productOperationSizeScope.deleteMany({
      where: { productOperationId: { in: productOpIds } },
    });
    await prisma.productOperationRateTier.deleteMany({
      where: { productOperationId: { in: productOpIds } },
    });
    await prisma.productOperation.deleteMany({ where: { id: { in: productOpIds } } });
  }

  await prisma.orderItemOperation.updateMany({
    where: { operationId: { in: unique } },
    data: { operationId: null },
  });
  await prisma.operationRateTier.deleteMany({ where: { operationId: { in: unique } } });
  await prisma.operation.deleteMany({ where: { id: { in: unique } } });
}

async function purgeCatalogOperations(prisma: PrismaClient, names: string[]) {
  const variants = [...new Set(names.flatMap((name) => testNameVariants(name)))];
  if (!variants.length) return;
  const rows = await prisma.operation.findMany({
    where: { nameUk: { in: variants } },
    select: { id: true },
  });
  // Also drop order BOM lines that were snapshots of these fake/demo ops
  await prisma.orderItemOperation.deleteMany({
    where: { nameSnapshot: { in: variants } },
  });
  await hardDeleteOperations(
    prisma,
    rows.map((row) => row.id),
  );
}

async function upsertDecoration(
  prisma: PrismaClient,
  data: {
    nameUk: string;
    calculationUnit: string;
    setupCost: number;
    unitRate: number;
    note?: string;
    tiers?: Array<{ minQuantity: number; maxQuantity: number | null; unitRate: number }>;
  },
) {
  const variants = testNameVariants(data.nameUk);
  const existing = await prisma.decorationMethod.findFirst({
    where: { nameUk: { in: variants } },
  });
  const method = existing
    ? await prisma.decorationMethod.update({
        where: { id: existing.id },
        data: {
          nameUk: data.nameUk,
          calculationUnit: data.calculationUnit,
          setupCost: data.setupCost,
          unitRate: data.unitRate,
          note: data.note ?? null,
          status: "ACTIVE",
        },
      })
    : await prisma.decorationMethod.create({
        data: {
          nameUk: data.nameUk,
          calculationUnit: data.calculationUnit,
          setupCost: data.setupCost,
          unitRate: data.unitRate,
          note: data.note ?? null,
        },
      });

  if (data.tiers) {
    await prisma.decorationQuantityTier.deleteMany({ where: { decorationMethodId: method.id } });
    await prisma.decorationQuantityTier.createMany({
      data: data.tiers.map((tier) => ({
        decorationMethodId: method.id,
        minQuantity: tier.minQuantity,
        maxQuantity: tier.maxQuantity,
        unitRate: tier.unitRate,
      })),
    });
  }

  return method;
}

async function upsertClient(
  prisma: PrismaClient,
  data: {
    companyName: string;
    contactPerson: string;
    phone: string;
    email: string;
    legalDetails: string;
    note?: string;
  },
) {
  const variants = testNameVariants(data.companyName);
  const existing = await prisma.client.findFirst({
    where: {
      OR: [{ companyName: { in: variants } }, { email: data.email }],
    },
  });
  if (existing) {
    return prisma.client.update({
      where: { id: existing.id },
      data: {
        companyName: data.companyName,
        contactPerson: data.contactPerson,
        phone: data.phone,
        email: data.email,
        legalDetails: data.legalDetails,
        note: data.note ?? null,
        status: "ACTIVE",
      },
    });
  }
  return prisma.client.create({ data });
}

type SizeQty = { sizeCode: string; sizeNameUk: string; quantity: number };

function buildVersionSnapshot(args: {
  nameUk: string;
  totalQuantity: number;
  sizes: SizeQty[];
  materials: Array<{
    id: string;
    nameSnapshot: string;
    unitCodeSnapshot: string;
    consumptionPerUnit: number;
    wastePercent: number;
    purchasePrice: number;
  }>;
  operations: Array<{
    id: string;
    nameSnapshot: string;
    calculationMethod: "UNIT_RATE" | "SHIFT_OUTPUT" | "QUANTITY_TIER";
    unitRate: number | null;
    shiftCost: number | null;
    standardOutput: number | null;
  }>;
  decorations: Array<{
    id: string;
    nameSnapshot: string;
    setupCost: number;
    unitRate: number;
  }>;
  additionalCosts: Array<{ id: string; nameUk: string; amount: number; isPerUnit: boolean }>;
  pricing: {
    pricingMethod: "MARGIN" | "MARKUP";
    targetRatePercent: number;
    minimumMarginPercent: number;
  };
  manualSellingPricePerUnit?: number | null;
}) {
  const calc = calculateCosting({
    sizes: args.sizes.map((s) => ({
      sizeCode: s.sizeCode,
      quantity: s.quantity,
      materialCoeff: 1,
      operationCoeff: 1,
    })),
    materials: args.materials.map((row) => ({
      id: row.id,
      consumptionPerUnit: row.consumptionPerUnit,
      wastePercent: row.wastePercent,
      purchasePrice: row.purchasePrice,
      applySizeCoeff: true,
    })),
    operations: args.operations.map((row) => ({
      id: row.id,
      method: row.calculationMethod,
      unitRate: row.unitRate,
      shiftCost: row.shiftCost,
      standardOutput: row.standardOutput,
      applySizeCoeff: true,
    })),
    decorations: args.decorations.map((row) => ({
      id: row.id,
      setupCost: row.setupCost,
      unitRate: row.unitRate,
    })),
    additionalCosts: args.additionalCosts.map((row) => ({
      id: row.id,
      amount: row.amount,
      isPerUnit: row.isPerUnit,
    })),
    pricingMethod: args.pricing.pricingMethod,
    targetRatePercent: args.pricing.targetRatePercent,
    manualSellingPricePerUnit: args.manualSellingPricePerUnit ?? null,
  });

  return {
    snapshot: {
      item: {
        nameUk: args.nameUk,
        totalQuantity: args.totalQuantity,
        sizes: args.sizes,
        materials: args.materials,
        operations: args.operations,
        decorations: args.decorations,
        additionalCosts: args.additionalCosts,
      },
      calc,
      pricing: args.pricing,
      manualSellingPricePerUnit: args.manualSellingPricePerUnit ?? null,
    } as Prisma.InputJsonValue,
    totals: {
      costPerUnit: Number(calc.costPerUnit),
      totalCost: Number(calc.totalCost),
      sellingPricePerUnit: Number(calc.sellingPricePerUnit),
      totalSellingValue: Number(calc.totalSellingValue),
      profitAmount: Number(calc.profitAmount),
      marginPercent: Number(calc.marginPercent),
    },
  };
}

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for seeding");
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  const passwordHash = await hash("ChangeMe123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: { name: "Адміністратор", role: "ADMINISTRATOR", isActive: true, permissions: [] },
    create: {
      email: "admin@example.com",
      login: "admin",
      name: "Адміністратор",
      passwordHash,
      role: "ADMINISTRATOR",
      permissions: [],
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@example.com" },
    update: {
      name: "Андрій Менеджер",
      role: "MANAGER",
      isActive: true,
      // Compose-only: orders + clients. Calc / catalogs / costs — admin.
      permissions: ["manageOrders", "manageClients"],
    },
    create: {
      email: "manager@example.com",
      login: "manager",
      name: "Андрій Менеджер",
      passwordHash,
      role: "MANAGER",
      permissions: ["manageOrders", "manageClients"],
    },
  });

  const units = [
    { code: "m", nameUk: "м.п." },
    { code: "m2", nameUk: "м²" },
    { code: "pcs", nameUk: "шт" },
    { code: "kg", nameUk: "кг" },
    { code: "cone", nameUk: "бобіна", status: "ARCHIVED" as const },
  ];
  for (const unit of units) {
    const status = "status" in unit && unit.status ? unit.status : "ACTIVE";
    await prisma.unitOfMeasure.upsert({
      where: { code: unit.code },
      update: { nameUk: unit.nameUk, status },
      create: { code: unit.code, nameUk: unit.nameUk, status },
    });
  }

  const unitByCode = Object.fromEntries(
    (await prisma.unitOfMeasure.findMany()).map((u) => [u.code, u]),
  );

  const sizeVariants = [
    {
      id: "scv_intl_unisex",
      code: "INTL_UNISEX",
      nameUk: "Міжнародна унісекс",
      description: INTL_UNISEX_VARIANT_DESCRIPTION,
      sortOrder: 1,
    },
    {
      id: "scv_ua_chest",
      code: "UA_CHEST_HALF",
      nameUk: "Українська 1/2 обхв. грудей",
      description: `${UA_CHEST_VARIANT_DESCRIPTION} ${UA_HEIGHT_GUIDE}`,
      sortOrder: 2,
    },
    {
      id: "scv_kids_height",
      code: "KIDS_HEIGHT",
      nameUk: "Дитяча · зріст",
      description: KIDS_HEIGHT_VARIANT_DESCRIPTION,
      sortOrder: 3,
    },
    {
      id: "scv_intl_men_ua",
      code: "INTL_MEN_UA",
      nameUk: "Міжнар / Чол. укр.",
      description: INTL_MEN_VARIANT_DESCRIPTION,
      sortOrder: 4,
    },
    {
      id: "scv_intl_women_ua",
      code: "INTL_WOMEN_UA",
      nameUk: "Міжнар / Жін. укр.",
      description: INTL_WOMEN_VARIANT_DESCRIPTION,
      sortOrder: 5,
    },
  ];
  for (const variant of sizeVariants) {
    await prisma.sizeChartVariant.upsert({
      where: { code: variant.code },
      update: {
        nameUk: variant.nameUk,
        description: variant.description,
        sortOrder: variant.sortOrder,
        status: "ACTIVE",
      },
      create: variant,
    });
  }
  const variantByCode = Object.fromEntries(
    (await prisma.sizeChartVariant.findMany()).map((row) => [row.code, row]),
  );
  const sizes = [
    // Міжнародна унісекс
    { variant: "INTL_UNISEX", code: "2XS", nameUk: "2XS", sortOrder: 0 },
    { variant: "INTL_UNISEX", code: "XS", nameUk: "XS", sortOrder: 1 },
    { variant: "INTL_UNISEX", code: "S", nameUk: "S", sortOrder: 2 },
    { variant: "INTL_UNISEX", code: "M", nameUk: "M", sortOrder: 3 },
    { variant: "INTL_UNISEX", code: "L", nameUk: "L", sortOrder: 4 },
    { variant: "INTL_UNISEX", code: "XL", nameUk: "XL", sortOrder: 5 },
    { variant: "INTL_UNISEX", code: "XXL", nameUk: "2XL", sortOrder: 6 },
    { variant: "INTL_UNISEX", code: "3XL", nameUk: "3XL", sortOrder: 7 },
    { variant: "INTL_UNISEX", code: "4XL", nameUk: "4XL", sortOrder: 8 },
    { variant: "INTL_UNISEX", code: "5XL", nameUk: "5XL", sortOrder: 9 },
    { variant: "INTL_UNISEX", code: "6XL", nameUk: "6XL", sortOrder: 10 },
    // Українська 1/2 обхв. грудей
    ...Array.from({ length: 18 }, (_, i) => {
      const n = 36 + i * 2;
      return {
        variant: "UA_CHEST_HALF",
        code: String(n),
        nameUk: String(n),
        sortOrder: i + 1,
      };
    }),
    // Дитяча · зріст
    ...Array.from({ length: 10 }, (_, i) => {
      const n = 110 + i * 6;
      return {
        variant: "KIDS_HEIGHT",
        code: String(n),
        nameUk: String(n),
        sortOrder: i + 1,
      };
    }),
    // Міжнар / Чол. укр.
    { variant: "INTL_MEN_UA", code: "2XS", nameUk: "2XS · 38", sortOrder: 1 },
    { variant: "INTL_MEN_UA", code: "XS", nameUk: "XS · 40", sortOrder: 2 },
    { variant: "INTL_MEN_UA", code: "S", nameUk: "S · 42–44", sortOrder: 3 },
    { variant: "INTL_MEN_UA", code: "M", nameUk: "M · 46–48", sortOrder: 4 },
    { variant: "INTL_MEN_UA", code: "L", nameUk: "L · 50–52", sortOrder: 5 },
    { variant: "INTL_MEN_UA", code: "XL", nameUk: "XL · 54–56", sortOrder: 6 },
    { variant: "INTL_MEN_UA", code: "2XL", nameUk: "2XL · 58–60", sortOrder: 7 },
    { variant: "INTL_MEN_UA", code: "3XL", nameUk: "3XL · 62–64", sortOrder: 8 },
    { variant: "INTL_MEN_UA", code: "4XL", nameUk: "4XL · 66–68", sortOrder: 9 },
    { variant: "INTL_MEN_UA", code: "5XL", nameUk: "5XL · 70–72", sortOrder: 10 },
    // Міжнар / Жін. укр.
    { variant: "INTL_WOMEN_UA", code: "2XS", nameUk: "2XS · 36", sortOrder: 1 },
    { variant: "INTL_WOMEN_UA", code: "XS", nameUk: "XS · 38", sortOrder: 2 },
    { variant: "INTL_WOMEN_UA", code: "S", nameUk: "S · 40–42", sortOrder: 3 },
    { variant: "INTL_WOMEN_UA", code: "M", nameUk: "M · 44–46", sortOrder: 4 },
    { variant: "INTL_WOMEN_UA", code: "L", nameUk: "L · 48–50", sortOrder: 5 },
    { variant: "INTL_WOMEN_UA", code: "XL", nameUk: "XL · 52–54", sortOrder: 6 },
    { variant: "INTL_WOMEN_UA", code: "2XL", nameUk: "2XL · 56–58", sortOrder: 7 },
    { variant: "INTL_WOMEN_UA", code: "3XL", nameUk: "3XL · 60–62", sortOrder: 8 },
    { variant: "INTL_WOMEN_UA", code: "4XL", nameUk: "4XL · 64–66", sortOrder: 9 },
    { variant: "INTL_WOMEN_UA", code: "5XL", nameUk: "5XL · 68–70", sortOrder: 10 },
  ];
  for (const size of sizes) {
    const variantId = variantByCode[size.variant]!.id;
    const descriptionUk =
      size.variant === "UA_CHEST_HALF"
        ? uaChestDescriptionUk(size.code)
        : size.variant === "INTL_MEN_UA"
          ? intlMenDescriptionUk(size.code)
          : size.variant === "INTL_WOMEN_UA"
            ? intlWomenDescriptionUk(size.code)
            : size.variant === "INTL_UNISEX"
              ? intlUnisexDescriptionUk(size.code)
              : size.variant === "KIDS_HEIGHT"
                ? kidsHeightDescriptionUk(size.code)
                : null;
    await prisma.size.upsert({
      where: {
        variantId_code: { variantId, code: size.code },
      },
      update: {
        nameUk: size.nameUk,
        sortOrder: size.sortOrder,
        status: "ACTIVE",
        descriptionUk,
      },
      create: {
        code: size.code,
        nameUk: size.nameUk,
        sortOrder: size.sortOrder,
        variantId,
        descriptionUk,
      },
    });
  }
  const intlVariantId = variantByCode.INTL_UNISEX!.id;
  const sizeByCode = Object.fromEntries(
    (
      await prisma.size.findMany({ where: { variantId: intlVariantId } })
    ).map((s) => [s.code, s]),
  );

  await prisma.pricingSettings.deleteMany();
  await prisma.pricingSettings.create({
    data: {
      pricingMethod: "MARGIN",
      targetMarginPercent: 0,
      minimumMarginPercent: 15,
      managerMaxDiscountPercent: 5,
      roundingRule: "ROUND_2",
      usdUahRate: 45,
      fabricCargoUsdPerKg: 1.7,
      npStandardUsdPerKg: 0.4,
      npVolumeUsdPerKg: 0.8,
      inputVatRatePercent: 20,
      materialCostVatMode: "NET",
    },
  });

  await prisma.companySettings.deleteMany();
  await prisma.companySettings.create({
    data: {
      legalName: "ТОВ «Текстиль Пром»",
      address: "м. Київ, вул. Індустріальна, 12",
      phone: "+380 44 500 12 34",
      email: "sales@tekstyl-prom.ua",
      taxId: "41234567",
      quotationFooter:
        "Рахунок дійсний 14 календарних днів. Виробництво стартує після погодження макетів і 50% передоплати.",
    },
  });

  await prisma.fixedCostArticle.deleteMany();
  await prisma.fixedCostSettings.deleteMany();
  await prisma.fixedCostSettings.create({
    data: {
      workingDaysPerMonth: 21,
      sewerCount: 5,
      dailySewerPay: 1500,
    },
  });
  // Owner sheet «Таблиця 1» — статті ПВ (сума 100 850 → коеф. 1,6 при 21 дні / 5 швей / 1500 ₴).
  await prisma.fixedCostArticle.createMany({
    data: [
      { nameUk: "Оренда майстерні", monthlyAmount: 20000, isActive: true, sortOrder: 1 },
      { nameUk: "Ком посл. майстерня", monthlyAmount: 7000, isActive: true, sortOrder: 2 },
      { nameUk: "Оренда офісу", monthlyAmount: 3000, isActive: true, sortOrder: 3 },
      { nameUk: "Ком посл. офіс", monthlyAmount: 1100, isActive: true, sortOrder: 4 },
      { nameUk: "Оренда серверу бух.", monthlyAmount: 750, isActive: true, sortOrder: 5 },
      { nameUk: "Бух посл. Новіцька", monthlyAmount: 7000, isActive: true, sortOrder: 6 },
      { nameUk: "Бух посл. Сергій", monthlyAmount: 4000, isActive: true, sortOrder: 7 },
      { nameUk: "ЄСВ Наталя", monthlyAmount: 1800, isActive: true, sortOrder: 8 },
      { nameUk: "Єдиний податок Сергій", monthlyAmount: 1600, isActive: true, sortOrder: 9 },
      { nameUk: "Військовий збір Сергій", monthlyAmount: 800, isActive: true, sortOrder: 10 },
      { nameUk: "ЄСВ Сергій", monthlyAmount: 1800, isActive: true, sortOrder: 11 },
      { nameUk: "Податки працівники ЄСВ", monthlyAmount: 1950, isActive: true, sortOrder: 12 },
      { nameUk: "Податки працівники ЄСВ", monthlyAmount: 1950, isActive: true, sortOrder: 13 },
      { nameUk: "працівники Військовий збір", monthlyAmount: 450, isActive: true, sortOrder: 14 },
      { nameUk: "працівники Військовий збір", monthlyAmount: 450, isActive: true, sortOrder: 15 },
      { nameUk: "працівники ПДФО", monthlyAmount: 1600, isActive: true, sortOrder: 16 },
      { nameUk: "працівники ПДФО", monthlyAmount: 1600, isActive: true, sortOrder: 17 },
      { nameUk: "Різне", monthlyAmount: 4000, isActive: true, sortOrder: 18 },
      { nameUk: "ЗП водій", monthlyAmount: 10000, isActive: true, sortOrder: 19 },
      { nameUk: "ЗП СЕО", monthlyAmount: 30000, isActive: true, sortOrder: 20 },
    ],
  });

  // --- Operation categories ---
  const catCut = await upsertCategory(prisma, "operation", "Розкрій");
  const catSew = await upsertCategory(prisma, "operation", "Пошив");
  await upsertCategory(prisma, "operation", "Оздоблення");
  const catPack = await upsertCategory(prisma, "operation", "Пакування");

  // --- Operations (ставки по моделях — з CSV через rateOverride) ---
  const opCut = await upsertOperation(prisma, {
    nameUk: "Розкрій",
    categoryId: catCut.id,
    calculationMethod: "UNIT_RATE",
    baseRate: 5,
    note: "Базова ставка; на моделі — вартість крою оптимального тиражу з каталогу CRM",
  });
  const opSew = await upsertOperation(prisma, {
    nameUk: "Пошив",
    categoryId: catSew.id,
    calculationMethod: "UNIT_RATE",
    baseRate: 30,
    note: "Базова ставка грн/шт; на моделі — «Вартість роботи грн/шт» з каталогу CRM",
  });
  const opPack = await upsertOperation(prisma, {
    nameUk: "Пакування",
    categoryId: catPack.id,
    calculationMethod: "UNIT_RATE",
    baseRate: 4,
    note: "З колонки пакування в каталозі моделей CRM",
  });
  // Demo ops + fake «Постійні витрати» as operation — remove from catalog & BOMs
  // (real PV comes from fixed-costs directory, not an operation line).
  await purgeCatalogOperations(prisma, [
    "Вшивання коміра / планки",
    "ВТО",
    "Контроль якості",
    "Контроль якості + пакування",
    "ВТО та пакування",
    "Пошиття основне",
    "Постійні витрати",
  ]);
  {
    const leftoverPv = await prisma.operation.findMany({
      where: { nameUk: { contains: "остійні витрат", mode: "insensitive" } },
      select: { id: true },
    });
    if (leftoverPv.length) {
      await hardDeleteOperations(
        prisma,
        leftoverPv.map((row) => row.id),
      );
    }
  }

  // --- Decorations (демо-набір, у CSV немає → [ТЕСТ]) ---
  const print1c = await upsertDecoration(prisma, {
    nameUk: withTestMarker("Шовкодрук 1 колір (груди)"),
    calculationUnit: "PLACEMENT",
    setupCost: 450,
    unitRate: 22,
    note: "Пластизоль, до A4 · демо-запис до CSV",
    tiers: [
      { minQuantity: 1, maxQuantity: 49, unitRate: 28 },
      { minQuantity: 50, maxQuantity: 199, unitRate: 22 },
      { minQuantity: 200, maxQuantity: null, unitRate: 16 },
    ],
  });
  const embroidery = await upsertDecoration(prisma, {
    nameUk: withTestMarker("Вишивка логотипу (до 8 тис. стібків)"),
    calculationUnit: "PLACEMENT",
    setupCost: 250,
    unitRate: 45,
    note: "Ліва грудь / рукав · демо-запис до CSV",
  });
  const dtf = await upsertDecoration(prisma, {
    nameUk: withTestMarker("DTF друк (повноколір)"),
    calculationUnit: "AREA",
    setupCost: 180,
    unitRate: 35,
    note: "До A3, термоперенос · демо-запис до CSV",
  });

  // Older unlabeled demo decorations → [ТЕСТ] + archive duplicates
  const legacyDemoDecorations = [
    "Шовкодрук, 2 кольори",
    "Вишивка (до 8 000 стібків)",
    "DTF-перенесення",
  ];
  for (const nameUk of legacyDemoDecorations) {
    const existing = await prisma.decorationMethod.findFirst({
      where: { nameUk: { in: testNameVariants(nameUk) } },
    });
    if (existing) {
      await prisma.decorationMethod.update({
        where: { id: existing.id },
        data: {
          nameUk: withTestMarker(nameUk),
          status: "ARCHIVED",
          note: "Демо до CSV · замінено поточним демо-набором",
        },
      });
    }
  }

  // --- Application formats (format × tirage matrix) ---
  {
    const qtyTiers = [20, 50, 100, 200] as const;
    const formats: Array<{ nameUk: string; rates: [number, number, number, number] }> = [
      { nameUk: "До 5 × 5 см", rates: [45, 35, 29, 25] },
      { nameUk: "До 10 × 10 см", rates: [55, 48, 43, 40] },
      { nameUk: "A6 — до 10 × 15 см", rates: [60, 55, 48, 45] },
      { nameUk: "A5 — до 15 × 21 см", rates: [80, 75, 68, 65] },
      { nameUk: "½ A4 — до 10 × 30 см", rates: [90, 85, 78, 75] },
      { nameUk: "A4 — до 21 × 30 см", rates: [110, 100, 95, 90] },
      { nameUk: "A3 — до 30 × 42 см", rates: [190, 175, 160, 150] },
    ];
    const existingFormats = await prisma.decorationFormat.count();
    if (existingFormats === 0) {
      for (let i = 0; i < formats.length; i++) {
        const row = formats[i]!;
        await prisma.decorationFormat.create({
          data: {
            nameUk: row.nameUk,
            sortOrder: i + 1,
            status: "ACTIVE",
            tiers: {
              create: qtyTiers.map((minQuantity, ti) => ({
                minQuantity,
                unitRate: row.rates[ti]!,
              })),
            },
          },
        });
      }
    }
  }

  // --- Size / quantity rules ---
  await prisma.sizeRule.deleteMany();
  await prisma.sizeRule.createMany({
    data: [
      {
        sizeCode: "3XL",
        materialCoeff: 1.15,
        operationCoeff: 1.2,
        surchargePercent: 0,
        appliesTo: "SELECTED",
      },
      {
        sizeCode: "4XL",
        materialCoeff: 1.15,
        operationCoeff: 1.2,
        surchargePercent: 0,
        appliesTo: "SELECTED",
      },
      {
        sizeCode: "5XL",
        materialCoeff: 1.15,
        operationCoeff: 1.2,
        surchargePercent: 0,
        appliesTo: "SELECTED",
      },
      {
        sizeCode: "6XL",
        materialCoeff: 1.15,
        operationCoeff: 1.2,
        surchargePercent: 0,
        appliesTo: "SELECTED",
      },
    ],
  });

  await prisma.quantityTierRule.deleteMany();
  await prisma.quantityTierRule.createMany({
    data: [
      {
        nameUk: "Знижка від 100 шт (собівартість операцій)",
        scope: "OPERATION",
        minQuantity: 100,
        maxQuantity: 299,
        coefficient: 0.95,
      },
      {
        nameUk: "Знижка від 300 шт (собівартість операцій)",
        scope: "OPERATION",
        minQuantity: 300,
        maxQuantity: null,
        coefficient: 0.9,
      },
    ],
  });

  // --- CRM catalog: fabrics, trims, models ---
  const catalog = await seedCrmCatalog({
    prisma,
    upsertMaterial,
    upsertCategory,
    unitByCode,
    sizeByCode,
    opCutId: opCut.id,
    opSewId: opSew.id,
    opPackId: opPack.id,
    decorations: {
      print1cId: print1c.id,
      embroideryId: embroidery.id,
      dtfId: dtf.id,
    },
  });
  const products = catalog.products;

  // Strip mistaken [ТЕСТ] from CRM / SEED etalon product names (CSV = production)
  const wronglyMarked = await prisma.product.findMany({
    where: {
      status: "ACTIVE",
      nameUk: { startsWith: "[ТЕСТ]" },
      OR: [
        { internalCode: { startsWith: "CRM-" } },
        { internalCode: { in: ["SEED-TS-BASIC", "SEED-POLO", "SEED-HOODIE"] } },
      ],
    },
    select: { id: true, nameUk: true },
  });
  for (const row of wronglyMarked) {
    const cleaned = row.nameUk.replace(/^\[ТЕСТ\]\s*/u, "").trim();
    if (cleaned && cleaned !== row.nameUk) {
      await prisma.product.update({
        where: { id: row.id },
        data: { nameUk: cleaned },
      });
    }
  }

  // --- Clients (демо до CSV → [ТЕСТ]) ---
  const clientAgro = await upsertClient(prisma, {
    companyName: withTestMarker("ТОВ «Агро Логотип»"),
    contactPerson: "Марина Коваль",
    phone: "+380 67 111 22 33",
    email: "procurement@agro-logo.ua",
    legalDetails: "ЄДРПОУ 39011223, м. Львів",
    note: "Демо-клієнт до CSV · регулярні замовлення футболок під івенти",
  });
  const clientClinic = await upsertClient(prisma, {
    companyName: withTestMarker("Клініка «Добробут Мед»"),
    contactPerson: "Ігор Семенюк",
    phone: "+380 50 444 55 66",
    email: "office@dobrobut-med.ua",
    legalDetails: "ЄДРПОУ 40112233, м. Київ",
    note: "Демо-клієнт до CSV",
  });
  const clientIt = await upsertClient(prisma, {
    companyName: withTestMarker("ТОВ «Нова ІТ»"),
    contactPerson: "Оксана Гнатюк",
    phone: "+380 93 777 88 99",
    email: "hr@nova-it.ua",
    legalDetails: "ЄДРПОУ 41223344, м. Харків",
    note: "Демо-клієнт до CSV · брендинг для онбордингу",
  });

  // Older unlabeled demo clients → [ТЕСТ]
  const legacyDemoClients = [
    "Craft Brew Group",
    "МедЛаб Україна",
    "ТОВ «Нова Логістика»",
    "ТОВ «Тест Сервіс»",
  ];
  for (const companyName of legacyDemoClients) {
    const existing = await prisma.client.findFirst({
      where: { companyName: { in: testNameVariants(companyName) } },
    });
    if (existing) {
      await prisma.client.update({
        where: { id: existing.id },
        data: {
          companyName: withTestMarker(companyName),
          note: existing.note
            ? `${existing.note} · демо до CSV`
            : "Демо-клієнт до CSV",
        },
      });
    }
  }

  // --- Rebuild seed orders (idempotent) ---
  const oldSeedOrders = await prisma.order.findMany({
    where: { number: { startsWith: SEED_ORDER_PREFIX } },
    select: { id: true },
  });
  if (oldSeedOrders.length > 0) {
    const ids = oldSeedOrders.map((o) => o.id);
    await prisma.activityEvent.deleteMany({
      where: { entityType: "order", entityId: { in: ids } },
    });
    const versionIds = (
      await prisma.calculationVersion.findMany({
        where: { orderItem: { orderId: { in: ids } } },
        select: { id: true },
      })
    ).map((v) => v.id);
    if (versionIds.length) {
      await prisma.quotation.deleteMany({ where: { calculationVersionId: { in: versionIds } } });
    }
    await prisma.order.deleteMany({ where: { id: { in: ids } } });
  }

  const pricing = {
    pricingMethod: "MARGIN" as const,
    targetRatePercent: 30,
    minimumMarginPercent: 15,
  };

  const daysFromNow = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(12, 0, 0, 0);
    return d;
  };

  async function createSeedOrder(args: {
    number: string;
    clientId: string;
    managerId: string;
    title: string;
    status: "DRAFT" | "CALCULATION" | "PENDING_APPROVAL" | "APPROVED" | "HANDED_TO_PRODUCTION" | "CLOSED" | "CANCELLED";
    deadline: Date | null;
    comment?: string;
    approvedDate?: Date | null;
    lines: Array<{
      productCode: string;
      sizes: SizeQty[];
      comment?: string;
      versions?: Array<{
        label: string;
        comment?: string;
        isApproved?: boolean;
        manualSellingPricePerUnit?: number | null;
        createQuotation?: boolean;
      }>;
      withSpecification?: boolean;
    }>;
    activity?: Array<{
      action: string;
      userId: string;
      daysAgo: number;
      payload?: Prisma.InputJsonValue;
    }>;
  }) {
    const order = await prisma.order.create({
      data: {
        number: args.number,
        clientId: args.clientId,
        managerId: args.managerId,
        title: withTestMarker(args.title),
        status: args.status,
        deadline: args.deadline,
        comment: args.comment ?? null,
        approvedDate: args.approvedDate ?? null,
      },
    });

    for (const line of args.lines) {
      const product = await prisma.product.findUniqueOrThrow({
        where: { internalCode: line.productCode },
        include: {
          materials: { include: { material: { include: { unitOfMeasure: true } } } },
          operations: { include: { operation: true } },
          decorations: { include: { decorationMethod: true } },
          additionalCosts: true,
        },
      });

      const totalQuantity = line.sizes.reduce((s, x) => s + x.quantity, 0);

      const item = await prisma.orderItem.create({
        data: {
          orderId: order.id,
          productId: product.id,
          sourceProductId: product.id,
          nameUk: product.nameUk,
          totalQuantity,
          comment: line.comment ?? null,
          sizes: {
            create: line.sizes.map((s) => ({
              sizeCode: s.sizeCode,
              sizeNameUk: s.sizeNameUk,
              quantity: s.quantity,
            })),
          },
          materials: {
            create: product.materials.map((row, index) => ({
              materialId: row.materialId,
              nameSnapshot: row.material.nameUk,
              unitCodeSnapshot: row.material.unitOfMeasure.code,
              consumptionPerUnit: row.consumptionPerUnit,
              wastePercent: row.wastePercent ?? row.material.defaultWastePercent,
              purchasePrice: row.material.purchasePrice,
              sortOrder: index,
            })),
          },
          operations: {
            create: product.operations.map((row, index) => ({
              operationId: row.operationId,
              nameSnapshot: row.operation.nameUk,
              calculationMethod: row.operation.calculationMethod,
              unitRate:
                row.rateOverride ??
                (row.operation.calculationMethod === "UNIT_RATE" ? row.operation.baseRate : null),
              shiftCost: row.operation.shiftCost,
              standardOutput: row.standardOverride ?? row.operation.standardOutputPerShift,
              sortOrder: index,
            })),
          },
          decorations: {
            create: product.decorations.map((row, index) => ({
              decorationMethodId: row.decorationMethodId,
              nameSnapshot: row.decorationMethod.nameUk,
              setupCost: row.decorationMethod.setupCost,
              unitRate: row.decorationMethod.unitRate,
              sortOrder: index,
            })),
          },
          additionalCosts: {
            create: product.additionalCosts.map((row) => ({
              nameUk: row.nameUk,
              amount: row.amount,
              isPerUnit: row.isPerUnit,
            })),
          },
        },
        include: {
          sizes: true,
          materials: true,
          operations: true,
          decorations: true,
          additionalCosts: true,
        },
      });

      let approvedVersionId: string | null = null;

      for (const [index, ver] of (line.versions ?? []).entries()) {
        const built = buildVersionSnapshot({
          nameUk: item.nameUk,
          totalQuantity: item.totalQuantity,
          sizes: item.sizes.map((s) => ({
            sizeCode: s.sizeCode,
            sizeNameUk: s.sizeNameUk,
            quantity: s.quantity,
          })),
          materials: item.materials.map((m) => ({
            id: m.id,
            nameSnapshot: m.nameSnapshot,
            unitCodeSnapshot: m.unitCodeSnapshot,
            consumptionPerUnit: Number(m.consumptionPerUnit),
            wastePercent: Number(m.wastePercent),
            purchasePrice: Number(m.purchasePrice),
          })),
          operations: item.operations.map((o) => ({
            id: o.id,
            nameSnapshot: o.nameSnapshot,
            calculationMethod: o.calculationMethod,
            unitRate: o.unitRate != null ? Number(o.unitRate) : null,
            shiftCost: o.shiftCost != null ? Number(o.shiftCost) : null,
            standardOutput: o.standardOutput != null ? Number(o.standardOutput) : null,
          })),
          decorations: item.decorations.map((d) => ({
            id: d.id,
            nameSnapshot: d.nameSnapshot,
            setupCost: Number(d.setupCost),
            unitRate: Number(d.unitRate),
          })),
          additionalCosts: item.additionalCosts.map((c) => ({
            id: c.id,
            nameUk: c.nameUk,
            amount: Number(c.amount),
            isPerUnit: c.isPerUnit,
          })),
          pricing,
          manualSellingPricePerUnit: ver.manualSellingPricePerUnit ?? null,
        });

        const version = await prisma.calculationVersion.create({
          data: {
            orderItemId: item.id,
            versionNumber: index + 1,
            label: ver.label,
            comment: ver.comment ?? null,
            isApproved: Boolean(ver.isApproved),
            snapshotJson: built.snapshot,
            costPerUnit: built.totals.costPerUnit,
            totalCost: built.totals.totalCost,
            sellingPricePerUnit: built.totals.sellingPricePerUnit,
            totalSellingValue: built.totals.totalSellingValue,
            profitAmount: built.totals.profitAmount,
            marginPercent: built.totals.marginPercent,
            authorId: args.managerId,
          },
        });

        if (ver.isApproved) approvedVersionId = version.id;

        if (ver.createQuotation) {
          await prisma.quotation.create({
            data: {
              calculationVersionId: version.id,
              number: `КП-${args.number}-${index + 1}`,
            },
          });
        }
      }

      if (line.withSpecification && approvedVersionId) {
        const approved = await prisma.calculationVersion.findUniqueOrThrow({
          where: { id: approvedVersionId },
        });
        await prisma.productionSpecification.create({
          data: {
            orderItemId: item.id,
            calculationVersionId: approved.id,
            snapshotJson: approved.snapshotJson as Prisma.InputJsonValue,
          },
        });
      }
    }

    for (const event of args.activity ?? []) {
      const createdAt = new Date();
      createdAt.setDate(createdAt.getDate() - event.daysAgo);
      await prisma.activityEvent.create({
        data: {
          entityType: "order",
          entityId: order.id,
          action: event.action,
          userId: event.userId,
          payload: event.payload,
          createdAt,
        },
      });
    }

    return order;
  }

  // 1) Draft — empty calc path
  await createSeedOrder({
    number: `${SEED_ORDER_PREFIX}001`,
    clientId: clientAgro.id,
    managerId: manager.id,
    title: "Чернетка: пробна партія футболок",
    status: "DRAFT",
    deadline: daysFromNow(21),
    comment: "Очікуємо підтвердження тиражів від маркетингу",
    lines: [
      {
        productCode: "SEED-TS-BASIC",
        sizes: [
          { sizeCode: "M", sizeNameUk: "M", quantity: 20 },
          { sizeCode: "L", sizeNameUk: "L", quantity: 20 },
        ],
        comment: "Макет ще не фінальний",
      },
    ],
    activity: [
      {
        action: "created",
        userId: manager.id,
        daysAgo: 1,
        payload: { number: `${SEED_ORDER_PREFIX}001` },
      },
    ],
  });

  // 2) Calculation — one draft version
  await createSeedOrder({
    number: `${SEED_ORDER_PREFIX}002`,
    clientId: clientIt.id,
    managerId: manager.id,
    title: "Розрахунок: поло для конференції",
    status: "CALCULATION",
    deadline: daysFromNow(30),
    lines: [
      {
        productCode: "SEED-POLO",
        sizes: [
          { sizeCode: "S", sizeNameUk: "S", quantity: 15 },
          { sizeCode: "M", sizeNameUk: "M", quantity: 40 },
          { sizeCode: "L", sizeNameUk: "L", quantity: 35 },
          { sizeCode: "XL", sizeNameUk: "XL", quantity: 10 },
        ],
        versions: [
          {
            label: "Базовий розрахунок",
            comment: "Вишивка на лівій груді",
            createQuotation: true,
          },
        ],
      },
    ],
    activity: [
      { action: "created", userId: manager.id, daysAgo: 3, payload: { number: `${SEED_ORDER_PREFIX}002` } },
      {
        action: "version_saved",
        userId: manager.id,
        daysAgo: 2,
        payload: { versionNumber: 1, label: "Базовий розрахунок" },
      },
    ],
  });

  // 3) Pending approval — two versions
  await createSeedOrder({
    number: `${SEED_ORDER_PREFIX}003`,
    clientId: clientClinic.id,
    managerId: manager.id,
    title: "На погодженні: уніформа клініки",
    status: "PENDING_APPROVAL",
    deadline: daysFromNow(14),
    lines: [
      {
        productCode: "SEED-TS-BASIC",
        sizes: [
          { sizeCode: "S", sizeNameUk: "S", quantity: 30 },
          { sizeCode: "M", sizeNameUk: "M", quantity: 50 },
          { sizeCode: "L", sizeNameUk: "L", quantity: 40 },
          { sizeCode: "XL", sizeNameUk: "XL", quantity: 20 },
        ],
        versions: [
          { label: "v1 — друк 1 колір", comment: "Стандартна маржа 30%" },
          {
            label: "v2 — знижка для клієнта",
            comment: "Ручна ціна після переговорів",
            manualSellingPricePerUnit: 295,
            createQuotation: true,
          },
        ],
      },
    ],
    activity: [
      { action: "created", userId: manager.id, daysAgo: 5, payload: { number: `${SEED_ORDER_PREFIX}003` } },
      { action: "version_saved", userId: manager.id, daysAgo: 4, payload: { versionNumber: 1 } },
      { action: "version_saved", userId: manager.id, daysAgo: 2, payload: { versionNumber: 2 } },
      {
        action: "status_changed",
        userId: manager.id,
        daysAgo: 1,
        payload: {
          from: "CALCULATION",
          to: "PENDING_APPROVAL",
          fromLabel: "Розрахунок",
          toLabel: "На погодженні",
        },
      },
    ],
  });

  // 4) Approved — ready for production handover
  await createSeedOrder({
    number: `${SEED_ORDER_PREFIX}004`,
    clientId: clientAgro.id,
    managerId: manager.id,
    title: "Погоджено: мерч агрофоруму",
    status: "APPROVED",
    deadline: daysFromNow(10),
    approvedDate: daysFromNow(-1),
    lines: [
      {
        productCode: "SEED-TS-BASIC",
        sizes: [
          { sizeCode: "M", sizeNameUk: "M", quantity: 80 },
          { sizeCode: "L", sizeNameUk: "L", quantity: 70 },
          { sizeCode: "XL", sizeNameUk: "XL", quantity: 30 },
        ],
        versions: [
          {
            label: "Фінальна КП",
            isApproved: true,
            createQuotation: true,
            comment: "Клієнт погодив шовкодрук",
          },
        ],
      },
      {
        productCode: "SEED-HOODIE",
        sizes: [
          { sizeCode: "L", sizeNameUk: "L", quantity: 20 },
          { sizeCode: "XL", sizeNameUk: "XL", quantity: 15 },
        ],
        versions: [
          {
            label: "Худі для спікерів",
            isApproved: true,
            comment: "DTF на спині",
          },
        ],
      },
    ],
    activity: [
      { action: "created", userId: manager.id, daysAgo: 8, payload: { number: `${SEED_ORDER_PREFIX}004` } },
      { action: "version_saved", userId: manager.id, daysAgo: 6, payload: { versionNumber: 1 } },
      {
        action: "version_approved",
        userId: admin.id,
        daysAgo: 1,
        payload: { versionNumber: 1 },
      },
    ],
  });

  // 5) In production — locked specification
  await createSeedOrder({
    number: `${SEED_ORDER_PREFIX}005`,
    clientId: clientIt.id,
    managerId: manager.id,
    title: "У виробництві: худі для офісу",
    status: "HANDED_TO_PRODUCTION",
    deadline: daysFromNow(7),
    approvedDate: daysFromNow(-5),
    lines: [
      {
        productCode: "SEED-HOODIE",
        sizes: [
          { sizeCode: "M", sizeNameUk: "M", quantity: 25 },
          { sizeCode: "L", sizeNameUk: "L", quantity: 35 },
          { sizeCode: "XL", sizeNameUk: "XL", quantity: 20 },
          { sizeCode: "XXL", sizeNameUk: "XXL", quantity: 10 },
        ],
        versions: [
          {
            label: "Затверджена специфікація",
            isApproved: true,
            createQuotation: true,
            comment: "Передано в цех 1",
          },
        ],
        withSpecification: true,
      },
    ],
    activity: [
      { action: "created", userId: manager.id, daysAgo: 12, payload: { number: `${SEED_ORDER_PREFIX}005` } },
      { action: "version_approved", userId: admin.id, daysAgo: 5, payload: { versionNumber: 1 } },
      {
        action: "handed_to_production",
        userId: admin.id,
        daysAgo: 4,
        payload: { number: `${SEED_ORDER_PREFIX}005`, itemCount: 1 },
      },
    ],
  });

  // 6) Closed
  await createSeedOrder({
    number: `${SEED_ORDER_PREFIX}006`,
    clientId: clientClinic.id,
    managerId: manager.id,
    title: "Закрито: партія поло для персоналу",
    status: "CLOSED",
    deadline: daysFromNow(-20),
    approvedDate: daysFromNow(-35),
    lines: [
      {
        productCode: "SEED-POLO",
        sizes: [
          { sizeCode: "M", sizeNameUk: "M", quantity: 40 },
          { sizeCode: "L", sizeNameUk: "L", quantity: 40 },
        ],
        versions: [
          {
            label: "Виконано",
            isApproved: true,
            comment: "Відвантажено",
          },
        ],
        withSpecification: true,
      },
    ],
    activity: [
      { action: "created", userId: manager.id, daysAgo: 40, payload: { number: `${SEED_ORDER_PREFIX}006` } },
      { action: "handed_to_production", userId: admin.id, daysAgo: 30, payload: { itemCount: 1 } },
      {
        action: "status_changed",
        userId: admin.id,
        daysAgo: 20,
        payload: {
          from: "HANDED_TO_PRODUCTION",
          to: "CLOSED",
          fromLabel: "У виробництві",
          toLabel: "Закрито",
        },
      },
    ],
  });

  // 7) Cancelled
  await createSeedOrder({
    number: `${SEED_ORDER_PREFIX}007`,
    clientId: clientAgro.id,
    managerId: manager.id,
    title: "Скасовано: зайвий тираж",
    status: "CANCELLED",
    deadline: daysFromNow(5),
    comment: "Клієнт скасував через зміну бюджету",
    lines: [
      {
        productCode: "SEED-TS-BASIC",
        sizes: [{ sizeCode: "L", sizeNameUk: "L", quantity: 50 }],
        versions: [{ label: "Попередній розрахунок" }],
      },
    ],
    activity: [
      { action: "created", userId: manager.id, daysAgo: 6, payload: { number: `${SEED_ORDER_PREFIX}007` } },
      {
        action: "status_changed",
        userId: manager.id,
        daysAgo: 2,
        payload: {
          from: "CALCULATION",
          to: "CANCELLED",
          fromLabel: "Розрахунок",
          toLabel: "Скасовано",
        },
      },
    ],
  });

  await prisma.activityEvent.create({
    data: {
      entityType: "client",
      entityId: clientIt.id,
      action: "created",
      userId: manager.id,
      payload: { companyName: clientIt.companyName },
    },
  });
  await prisma.activityEvent.create({
    data: {
      entityType: "product",
      entityId: products["SEED-TS-BASIC"].id,
      action: "created",
      userId: admin.id,
      payload: { internalCode: "SEED-TS-BASIC" },
    },
  });

  console.log("Seed completed — minimal production-like dataset.");
  console.log("");
  console.log("Users:");
  console.log("  Admin:   admin@example.com / ChangeMe123!");
  console.log("  Manager: manager@example.com / ChangeMe123!");
  console.log("");
  console.log(
    `CRM catalog: ${catalog.stats.fabrics} fabrics (+${catalog.stats.fabricsSkipped} skipped), ` +
      `${catalog.stats.trims} trims (+${catalog.stats.trimsSkipped} skipped), ` +
      `${catalog.stats.models} models; 3 clients, 7 orders (ЗМ-SEED-001…007).`,
  );
  if (catalog.skippedNotes.length) {
    console.log(`Skipped rows: ${catalog.skippedNotes.length} (see seed log / settings banners).`);
  }
  console.log("Statuses covered: DRAFT → CALCULATION → PENDING_APPROVAL → APPROVED → PRODUCTION → CLOSED → CANCELLED.");

  await prisma.$disconnect();
  await pool.end();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
