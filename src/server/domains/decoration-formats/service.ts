import { prisma } from "@/server/db/client";
import {
  DEFAULT_DECORATION_FORMATS,
  DEFAULT_DECORATION_FORMAT_QTY_TIERS,
  mapDecorationFormatTiers,
  resolveDecorationFormatRate,
} from "@/lib/decoration-format-pricing";

export type DecorationFormatCatalogRow = {
  id: string;
  nameUk: string;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED";
  tiers: Array<{ minQuantity: number; unitRate: number }>;
};

export async function ensureDecorationFormatsCatalog() {
  const delegate = (prisma as { decorationFormat?: { count: () => Promise<number> } })
    .decorationFormat;
  if (!delegate) {
    throw new Error(
      "Prisma client missing decorationFormat — restart next dev after prisma generate",
    );
  }
  const count = await delegate.count();
  if (count > 0) return;

  for (let i = 0; i < DEFAULT_DECORATION_FORMATS.length; i++) {
    const row = DEFAULT_DECORATION_FORMATS[i]!;
    await prisma.decorationFormat.create({
      data: {
        nameUk: row.nameUk,
        sortOrder: i + 1,
        status: "ACTIVE",
        tiers: {
          create: DEFAULT_DECORATION_FORMAT_QTY_TIERS.map((minQuantity, ti) => ({
            minQuantity,
            unitRate: row.rates[ti]!,
          })),
        },
      },
    });
  }
}

export async function getDecorationFormatsCatalog(opts?: {
  includeArchived?: boolean;
}): Promise<DecorationFormatCatalogRow[]> {
  try {
    await ensureDecorationFormatsCatalog();
    const rows = await prisma.decorationFormat.findMany({
      where: opts?.includeArchived ? undefined : { status: "ACTIVE" },
      orderBy: [{ sortOrder: "asc" }, { nameUk: "asc" }],
      include: {
        tiers: { orderBy: { minQuantity: "asc" } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      nameUk: row.nameUk,
      sortOrder: row.sortOrder,
      status: row.status,
      tiers: row.tiers.map((tier) => ({
        minQuantity: tier.minQuantity,
        unitRate: Number(tier.unitRate),
      })),
    }));
  } catch (error) {
    console.error("[decoration-formats] catalog load failed:", error);
    return DEFAULT_DECORATION_FORMATS.map((row, index) => ({
      id: `fallback_${index}`,
      nameUk: row.nameUk,
      sortOrder: index + 1,
      status: "ACTIVE" as const,
      tiers: DEFAULT_DECORATION_FORMAT_QTY_TIERS.map((minQuantity, ti) => ({
        minQuantity,
        unitRate: row.rates[ti]!,
      })),
    }));
  }
}

export type DecorationFormatMatrixInput = {
  /** Existing id when updating; omit / empty for new rows. */
  id?: string | null;
  nameUk: string;
  sortOrder?: number;
  status?: "ACTIVE" | "ARCHIVED";
  tiers: Array<{ minQuantity: number; unitRate: number }>;
};

export async function saveDecorationFormatsMatrix(rows: DecorationFormatMatrixInput[]) {
  const cleaned = rows
    .map((row, index) => {
      const nameUk = row.nameUk.trim();
      if (!nameUk) return null;
      const tiers = (row.tiers ?? [])
        .map((tier) => ({
          minQuantity: Math.floor(Number(tier.minQuantity)),
          unitRate: Number(tier.unitRate),
        }))
        .filter(
          (tier) =>
            tier.minQuantity > 0 &&
            Number.isFinite(tier.unitRate) &&
            tier.unitRate >= 0,
        );
      if (tiers.length === 0) return null;
      const byMin = new Map<number, number>();
      for (const tier of tiers) byMin.set(tier.minQuantity, tier.unitRate);
      const uniqueTiers = [...byMin.entries()]
        .map(([minQuantity, unitRate]) => ({ minQuantity, unitRate }))
        .sort((a, b) => a.minQuantity - b.minQuantity);
      return {
        id: row.id?.trim() || null,
        nameUk,
        sortOrder: row.sortOrder ?? index + 1,
        status: row.status === "ARCHIVED" ? ("ARCHIVED" as const) : ("ACTIVE" as const),
        tiers: uniqueTiers,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.decorationFormat.findMany({ select: { id: true } });
    const keepIds = new Set(cleaned.map((row) => row.id).filter(Boolean) as string[]);
    const toArchive = existing.filter((row) => !keepIds.has(row.id));
    if (toArchive.length > 0) {
      await tx.decorationFormat.updateMany({
        where: { id: { in: toArchive.map((row) => row.id) } },
        data: { status: "ARCHIVED" },
      });
    }

    for (let i = 0; i < cleaned.length; i++) {
      const row = cleaned[i]!;
      const sortOrder = i + 1;
      if (row.id && keepIds.has(row.id)) {
        await tx.decorationFormat.update({
          where: { id: row.id },
          data: {
            nameUk: row.nameUk,
            sortOrder,
            status: row.status,
          },
        });
        await tx.decorationFormatTier.deleteMany({ where: { formatId: row.id } });
        await tx.decorationFormatTier.createMany({
          data: row.tiers.map((tier) => ({
            formatId: row.id!,
            minQuantity: tier.minQuantity,
            unitRate: tier.unitRate,
          })),
        });
      } else {
        await tx.decorationFormat.create({
          data: {
            nameUk: row.nameUk,
            sortOrder,
            status: row.status,
            tiers: {
              create: row.tiers.map((tier) => ({
                minQuantity: tier.minQuantity,
                unitRate: tier.unitRate,
              })),
            },
          },
        });
      }
    }
  });
}

export async function resolveFormatUnitRate(
  formatId: string,
  quantity: number,
): Promise<{ nameUk: string; unitRate: number } | null> {
  const format = await prisma.decorationFormat.findUnique({
    where: { id: formatId },
    include: { tiers: { orderBy: { minQuantity: "asc" } } },
  });
  if (!format || format.status !== "ACTIVE") return null;
  const tiers = mapDecorationFormatTiers(format.tiers);
  const unitRate = resolveDecorationFormatRate({ quantity, tiers });
  return { nameUk: format.nameUk, unitRate };
}
