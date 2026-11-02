import { createRequire } from "node:module";
import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool, type PoolClient } from "pg";

const requireFromProject = createRequire(`${process.cwd()}/package.json`);

type PrismaModule = {
  PrismaClient: typeof PrismaClient;
  Prisma: typeof Prisma;
};

/**
 * Turbopack keeps the first `import "@prisma/client"` for the life of the
 * process. `prisma generate` rewrites `node_modules/.prisma/client` on disk,
 * but that binding stays stale until we drop Node's require cache and load it
 * again. The static import is the fast path; this slot is replaced only after
 * a freshness check fails.
 */
let activePrismaModule: PrismaModule = { PrismaClient, Prisma };

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  pgPool: Pool | undefined;
  prismaClientVersion?: string;
};

/**
 * Bump when Prisma schema changes so HMR drops the cached singleton.
 * A long-lived `next dev` may still hold the previous `@prisma/client`
 * module; `getPrismaClient` reloads the generated client from disk when
 * the freshness check fails.
 */
const PRISMA_CLIENT_VERSION = "20261102150000_order_company_settings";

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

function enumHasField(
  prismaNamespace: typeof Prisma,
  enumName: "MaterialScalarFieldEnum" | "OrderItemDecorationScalarFieldEnum" | "OrderScalarFieldEnum",
  field: string,
): boolean {
  try {
    const enumObject = prismaNamespace[enumName] as Record<string, string> | undefined;
    return !!enumObject && field in enumObject;
  } catch {
    return false;
  }
}

function missingSchemaPieces(mod: PrismaModule, client: PrismaClient | undefined): string[] {
  const missing: string[] = [];
  if (!client) {
    missing.push("client");
    return missing;
  }
  for (const name of REQUIRED_DELEGATES) {
    if (!(name in client)) missing.push(`delegate:${name}`);
  }
  if (!enumHasField(mod.Prisma, "MaterialScalarFieldEnum", "tagColor")) {
    missing.push("Material.tagColor");
  }
  if (!enumHasField(mod.Prisma, "OrderItemDecorationScalarFieldEnum", "quantity")) {
    missing.push("OrderItemDecoration.quantity");
  }
  if (!enumHasField(mod.Prisma, "OrderScalarFieldEnum", "companySettingsId")) {
    missing.push("Order.companySettingsId");
  }
  if (!enumHasField(mod.Prisma, "OrderScalarFieldEnum", "paymentMethod")) {
    missing.push("Order.paymentMethod");
  }
  return missing;
}

export function orderHasCompanySettingsField(): boolean {
  return enumHasField(activePrismaModule.Prisma, "OrderScalarFieldEnum", "companySettingsId");
}

/**
 * Drop the generated client from Node's require cache and load the copy
 * currently on disk. Specifier is built at runtime so the bundler does not
 * pin this call to the module instance captured at startup.
 */
function reloadPrismaModule(): PrismaModule {
  const cache = requireFromProject.cache;
  if (cache) {
    for (const key of Object.keys(cache)) {
      const normalized = key.split("\\").join("/");
      const isGeneratedClient = normalized.includes("/.prisma/client/");
      const isClientEntry =
        normalized.includes("/@prisma/client/") && !normalized.includes("/@prisma/client/runtime/");
      if (isGeneratedClient || isClientEntry) {
        delete cache[key];
      }
    }
  }

  const specifier = ["@", "prisma/client"].join("");
  const loaded = requireFromProject(specifier) as PrismaModule;
  activePrismaModule = {
    PrismaClient: loaded.PrismaClient,
    Prisma: loaded.Prisma,
  };
  return activePrismaModule;
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
  return new activePrismaModule.PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
}

function getPrismaClient(): PrismaClient {
  const versionMismatch = globalForPrisma.prismaClientVersion !== PRISMA_CLIENT_VERSION;
  const delegatesStale = missingSchemaPieces(activePrismaModule, globalForPrisma.prisma).length > 0;

  if (globalForPrisma.prisma && (versionMismatch || delegatesStale)) {
    dropCachedClient(versionMismatch ? "schema fingerprint changed" : "missing delegates");
  }

  if (!globalForPrisma.prisma) {
    globalForPrisma.prismaClientVersion = PRISMA_CLIENT_VERSION;
    globalForPrisma.prisma = createPrismaClient();
    let missing = missingSchemaPieces(activePrismaModule, globalForPrisma.prisma);
    if (missing.length > 0) {
      dropCachedClient(`loaded client missing ${missing.join(", ")}`);
      reloadPrismaModule();
      globalForPrisma.prisma = createPrismaClient();
      missing = missingSchemaPieces(activePrismaModule, globalForPrisma.prisma);
      if (missing.length > 0) {
        dropCachedClient("reloaded client still missing schema");
        throw new Error(
          "Prisma client loaded without current schema fields " +
            `(${missing.join(", ")}). Run \`npx prisma generate\` and restart \`npm run dev\`.`,
        );
      }
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
