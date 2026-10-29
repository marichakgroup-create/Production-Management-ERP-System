import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolClient } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaClientVersion?: string;
};

/**
 * Bump when Prisma schema changes so HMR drops the cached singleton.
 * After `prisma generate`, a long-lived `next dev` may still need a full
 * process restart — Node keeps the old `@prisma/client` module in memory.
 */
const PRISMA_CLIENT_VERSION = "20261029150000_decoration_comment_file_qty";

/** Delegates that must exist after party contacts / legal details / decorations. */
const REQUIRED_DELEGATES = [
  "clientContact",
  "supplierContact",
  "clientLegalDetail",
  "decorationFormat",
  "decorationFormatTier",
  "fixedCostSettings",
  "fixedCostArticle",
  "screenPrintPriceCell",
  "screenPrintCoefficient",
  "sizeChartVariant",
] as const;

function materialClientHasTagColor(): boolean {
  try {
    return "tagColor" in (Prisma.MaterialScalarFieldEnum ?? {});
  } catch {
    return false;
  }
}

function decorationHasQuantityField(): boolean {
  try {
    return "quantity" in (Prisma.OrderItemDecorationScalarFieldEnum ?? {});
  } catch {
    return false;
  }
}

function clientHasCurrentDelegates(client: PrismaClient | undefined): boolean {
  if (!client) return false;
  return (
    REQUIRED_DELEGATES.every((name) => name in client) &&
    materialClientHasTagColor() &&
    decorationHasQuantityField()
  );
}

function dropCachedClient(reason: string) {
  const stale = globalForPrisma.prisma;
  const stalePool = globalForPrisma.pgPool;
  globalForPrisma.prisma = undefined;
  globalForPrisma.pgPool = undefined;
  if (stale || stalePool) {
    console.warn(`[prisma] Recreating client (${reason})`);
  }
  void stale?.$disconnect().catch(() => undefined);
  void stalePool?.end().catch(() => undefined);
}

/**
 * Prisma's pg adapter can fire concurrent queries on one PoolClient inside
 * transactions / nested includes. pg@8.20+ warns; pg@9 will throw.
 * Serialize query() on each checked-out client — pool-level parallelism stays.
 */
function serializeClientQueries(client: PoolClient): PoolClient {
  const originalQuery = client.query.bind(client) as (...args: unknown[]) => unknown;
  let tail: Promise<unknown> = Promise.resolve();

  const serialized = ((...args: unknown[]) => {
    const run = () => originalQuery(...args);
    const result = tail.then(run, run);
    tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }) as typeof client.query;

  client.query = serialized;
  return client;
}

function createPool(connectionString: string): Pool {
  const pool = new Pool({
    connectionString,
    max: 10,
    // Fail fast instead of hanging the whole Next request forever.
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    ssl: connectionString.includes("supabase.com")
      ? { rejectUnauthorized: false }
      : undefined,
  });

  const connect = pool.connect.bind(pool);
  pool.connect = ((onConnect?: (err: Error | undefined, client?: PoolClient) => void) => {
    if (typeof onConnect === "function") {
      return connect((err, client) => {
        onConnect(err, client ? serializeClientQueries(client) : client);
      });
    }
    return connect().then(serializeClientQueries);
  }) as typeof pool.connect;

  return pool;
}

function createPrismaClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }

  const pool = globalForPrisma.pgPool ?? createPool(connectionString);

  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.pgPool = pool;
  }

  const adapter = new PrismaPg(pool);
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  const versionMismatch = globalForPrisma.prismaClientVersion !== PRISMA_CLIENT_VERSION;
  const delegatesStale = !clientHasCurrentDelegates(globalForPrisma.prisma);

  if (globalForPrisma.prisma && (versionMismatch || delegatesStale)) {
    dropCachedClient(versionMismatch ? "schema fingerprint changed" : "missing delegates");
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
    globalForPrisma.prisma = createPrismaClient();
    if (!clientHasCurrentDelegates(globalForPrisma.prisma)) {
      dropCachedClient("constructed client still missing delegates");
      throw new Error(
        "Prisma client loaded without current schema fields. " +
          "The Node process still has a stale @prisma/client — fully restart `npm run dev`.",
      );
    }
  }

  return globalForPrisma.prisma;
}

/**
 * Lazy proxy so importing calc helpers / scripts does not require DATABASE_URL
 * until the first real DB call. Freshness is checked on every access so HMR
 * cannot keep serving a post-generate-stale singleton forever.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, prop, _receiver) {
    const client = getPrismaClient();
    const value = Reflect.get(client, prop, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
  has(_target, prop) {
    return Reflect.has(getPrismaClient(), prop);
  },
});
