import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolClient } from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaClientVersion?: string;
};

/**
 * Bump when Prisma schema changes so dev HMR does not keep a stale client.
 * Also bump after `prisma generate` if a previous bump raced ahead of generation.
 */
const PRISMA_CLIENT_VERSION = "20261010094000_decoration_formats_pool";

function materialClientHasTagColor(): boolean {
  try {
    return "tagColor" in (Prisma.MaterialScalarFieldEnum ?? {});
  } catch {
    return false;
  }
}

function clientHasCurrentDelegates(client: PrismaClient | undefined): boolean {
  if (!client) return false;
  return (
    "fixedCostSettings" in client &&
    "fixedCostArticle" in client &&
    "screenPrintPriceCell" in client &&
    "screenPrintCoefficient" in client &&
    "sizeChartVariant" in client &&
    "decorationFormat" in client &&
    "decorationFormatTier" in client &&
    materialClientHasTagColor()
  );
}

function shouldRecreateClient(): boolean {
  if (globalForPrisma.prismaClientVersion !== PRISMA_CLIENT_VERSION) return true;
  if (!clientHasCurrentDelegates(globalForPrisma.prisma)) return true;
  if (!materialClientHasTagColor()) return true;
  return false;
}

if (shouldRecreateClient()) {
  const stale = globalForPrisma.prisma;
  const stalePool = globalForPrisma.pgPool;
  globalForPrisma.prisma = undefined;
  globalForPrisma.pgPool = undefined;
  globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
  // Drop cached instance from a previous schema; ignore disconnect errors in HMR.
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
  if (!globalForPrisma.prisma) {
    globalForPrisma.prisma = createPrismaClient();
  }
  return globalForPrisma.prisma;
}

/**
 * Lazy proxy so importing calc helpers / scripts does not require DATABASE_URL
 * until the first real DB call.
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
