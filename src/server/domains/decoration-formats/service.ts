import { prisma } from "@/server/db/client";
import {
  DEFAULT_DECORATION_FORMATS,
  DEFAULT_DECORATION_FORMAT_QTY_TIERS,
  DEFAULT_EMBROIDERY_FORMATS,
  DEFAULT_EMBROIDERY_FORMAT_QTY_TIERS,
  defaultQtyTiersForKind,
  mapDecorationFormatTiers,
  resolveDecorationFormatRate,
  type DecorationFormatKind,
} from "@/lib/decoration-format-pricing";

export type DecorationFormatCatalogRow = {
  id: string;
  kind: DecorationFormatKind;
  nameUk: string;
  detailUk: string | null;
  quoteIndividually: boolean;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED";
  tiers: Array<{ minQuantity: number; unitRate: number }>;
};

function mapCatalogRow(row: {
  id: string;
  kind?: DecorationFormatKind | string | null;
  nameUk: string;
  detailUk?: string | null;
  quoteIndividually?: boolean | null;
  sortOrder: number;
  status: "ACTIVE" | "ARCHIVED";
  tiers: Array<{ minQuantity: number; unitRate: unknown }>;
}): DecorationFormatCatalogRow {
  return {
    id: row.id,
    kind: row.kind === "EMBROIDERY" ? "EMBROIDERY" : "DTF",
    nameUk: row.nameUk,
    detailUk: row.detailUk ?? null,
    quoteIndividually: Boolean(row.quoteIndividually),
    sortOrder: row.sortOrder,
    status: row.status,
    tiers: row.tiers.map((tier) => ({
      minQuantity: tier.minQuantity,
      unitRate: Number(tier.unitRate),
    })),
  };
}

async function seedDtfFormats() {
  for (let i = 0; i < DEFAULT_DECORATION_FORMATS.length; i++) {
    const row = DEFAULT_DECORATION_FORMATS[i]!;
    await prisma.decorationFormat.create({
      data: {
        kind: "DTF",
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

async function seedEmbroideryFormats() {
  for (let i = 0; i < DEFAULT_EMBROIDERY_FORMATS.length; i++) {
    const row = DEFAULT_EMBROIDERY_FORMATS[i]!;
    await prisma.decorationFormat.create({
      data: {
        kind: "EMBROIDERY",
        nameUk: row.nameUk,
        detailUk: row.detailUk,
        quoteIndividually: false,
        sortOrder: i + 1,
        status: "ACTIVE",
        tiers: {
          create: DEFAULT_EMBROIDERY_FORMAT_QTY_TIERS.map((minQuantity, ti) => ({
            minQuantity,
            unitRate: row.rates[ti]!,
          })),
        },
      },
    });
  }
}

export async function ensureDecorationFormatsCatalog() {
  const delegate = (prisma as { decorationFormat?: { count: (args?: unknown) => Promise<number> } })
    .decorationFormat;
  if (!delegate) {
    throw new Error(
      "Prisma client missing decorationFormat — restart next dev after prisma generate",
    );
  }

  const dtfCount = await prisma.decorationFormat.count({ where: { kind: "DTF" } });
  if (dtfCount === 0) {
    const legacyCount = await prisma.decorationFormat.count();
    if (legacyCount === 0) {
      await seedDtfFormats();
    }
  }

  const embroideryCount = await prisma.decorationFormat.count({
    where: { kind: "EMBROIDERY" },
  });
  if (embroideryCount === 0) {
    await seedEmbroideryFormats();
  }
}

function fallbackCatalog(kind?: DecorationFormatKind): DecorationFormatCatalogRow[] {
  const dtf = DEFAULT_DECORATION_FORMATS.map((row, index) => ({
    id: `fallback_dtf_${index}`,
    kind: "DTF" as const,
    nameUk: row.nameUk,
    detailUk: null,
    quoteIndividually: false,
    sortOrder: index + 1,
    status: "ACTIVE" as const,
    tiers: DEFAULT_DECORATION_FORMAT_QTY_TIERS.map((minQuantity, ti) => ({
      minQuantity,
      unitRate: row.rates[ti]!,
    })),
  }));
  const embroidery = DEFAULT_EMBROIDERY_FORMATS.map((row, index) => ({
    id: `fallback_emb_${index}`,
    kind: "EMBROIDERY" as const,
    nameUk: row.nameUk,
    detailUk: row.detailUk,
    quoteIndividually: false,
    sortOrder: index + 1,
    status: "ACTIVE" as const,
    tiers: DEFAULT_EMBROIDERY_FORMAT_QTY_TIERS.map((minQuantity, ti) => ({
      minQuantity,
      unitRate: row.rates[ti]!,
    })),
  }));
  if (kind === "DTF") return dtf;
  if (kind === "EMBROIDERY") return embroidery;
  return [...dtf, ...embroidery];
}

export async function getDecorationFormatsCatalog(opts?: {
  includeArchived?: boolean;
  kind?: DecorationFormatKind;
}): Promise<DecorationFormatCatalogRow[]> {
  try {
    await ensureDecorationFormatsCatalog();
    const rows = await prisma.decorationFormat.findMany({
      where: {
        ...(opts?.includeArchived ? {} : { status: "ACTIVE" }),
        ...(opts?.kind ? { kind: opts.kind } : {}),
      },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { nameUk: "asc" }],
      include: {
        tiers: { orderBy: { minQuantity: "asc" } },
      },
    });
    return rows.map(mapCatalogRow);
  } catch (error) {
    console.error("[decoration-formats] catalog load failed:", error);
    return fallbackCatalog(opts?.kind);
  }
}

export type DecorationFormatMatrixInput = {
  /** Existing id when updating; omit / empty for new rows. */
  id?: string | null;
  kind?: DecorationFormatKind;
  nameUk: string;
  detailUk?: string | null;
  quoteIndividually?: boolean;
  sortOrder?: number;
  status?: "ACTIVE" | "ARCHIVED";
  tiers: Array<{ minQuantity: number; unitRate: number }>;
};

export async function saveDecorationFormatsMatrix(
  rows: DecorationFormatMatrixInput[],
  kind: DecorationFormatKind = "DTF",
) {
  const cleaned = rows
    .map((row, index) => {
      const nameUk = row.nameUk.trim();
      if (!nameUk) return null;
      const quoteIndividually = Boolean(row.quoteIndividually);
      const detailUk = String(row.detailUk ?? "").trim() || null;
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
      if (tiers.length === 0 && !quoteIndividually) return null;
      const byMin = new Map<number, number>();
      for (const tier of tiers) byMin.set(tier.minQuantity, quoteIndividually ? 0 : tier.unitRate);
      const uniqueTiers = [...byMin.entries()]
        .map(([minQuantity, unitRate]) => ({ minQuantity, unitRate }))
        .sort((a, b) => a.minQuantity - b.minQuantity);
      const mins =
        uniqueTiers.length > 0
          ? uniqueTiers
          : defaultQtyTiersForKind(kind).map((minQuantity) => ({ minQuantity, unitRate: 0 }));
      return {
        id: row.id?.trim() || null,
        nameUk,
        detailUk,
        quoteIndividually,
        sortOrder: row.sortOrder ?? index + 1,
        status: row.status === "ARCHIVED" ? ("ARCHIVED" as const) : ("ACTIVE" as const),
        tiers: mins,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null);

  await prisma.$transaction(async (tx) => {
    const existing = await tx.decorationFormat.findMany({
      where: { kind },
      select: { id: true },
    });
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
            kind,
            nameUk: row.nameUk,
            detailUk: row.detailUk,
            quoteIndividually: row.quoteIndividually,
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
            kind,
            nameUk: row.nameUk,
            detailUk: row.detailUk,
            quoteIndividually: row.quoteIndividually,
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
): Promise<{
  nameUk: string;
  detailUk: string | null;
  kind: DecorationFormatKind;
  unitRate: number;
  quoteIndividually: boolean;
} | null> {
  const format = await prisma.decorationFormat.findUnique({
    where: { id: formatId },
    include: { tiers: { orderBy: { minQuantity: "asc" } } },
  });
  if (!format || format.status !== "ACTIVE") return null;
  const kind: DecorationFormatKind = format.kind === "EMBROIDERY" ? "EMBROIDERY" : "DTF";
  if (format.quoteIndividually) {
    return {
      nameUk: format.nameUk,
      detailUk: format.detailUk,
      kind,
      unitRate: 0,
      quoteIndividually: true,
    };
  }
  const tiers = mapDecorationFormatTiers(format.tiers);
  const unitRate = resolveDecorationFormatRate({ quantity, tiers });
  return {
    nameUk: format.nameUk,
    detailUk: format.detailUk,
    kind,
    unitRate,
    quoteIndividually: false,
  };
}
