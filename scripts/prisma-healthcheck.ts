/**
 * Fail fast if generated Prisma client / DB schema drift from what the app expects.
 * Run after generate/migrate, or from CI before e2e.
 */
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import { Prisma } from "@prisma/client";

const REQUIRED_MODELS = [
  "Client",
  "ClientContact",
  "ClientLegalDetail",
  "SupplierContact",
  "DecorationFormat",
  "DecorationFormatTier",
] as const;

const REQUIRED_CLIENT_NESTED = ["contacts", "legalEntities"] as const;

async function main() {
  const models = Prisma.ModelName as Record<string, string>;
  const missingModels = REQUIRED_MODELS.filter((name) => !(name in models));
  if (missingModels.length > 0) {
    throw new Error(`Generated Prisma client missing models: ${missingModels.join(", ")}. Run db:generate.`);
  }

  if (!("tagColor" in (Prisma.MaterialScalarFieldEnum ?? {}))) {
    throw new Error("Generated Prisma client missing Material.tagColor. Run db:generate.");
  }

  const { createClient } = await import("../src/server/domains/clients/service");
  const { prisma } = await import("../src/server/db/client");
  const missingDelegates = [
    "clientContact",
    "clientLegalDetail",
    "supplierContact",
    "decorationFormat",
  ].filter((name) => !(name in prisma));
  if (missingDelegates.length > 0) {
    throw new Error(`Runtime prisma missing delegates: ${missingDelegates.join(", ")}`);
  }

  const stamp = Date.now();
  const created = await createClient({
    companyName: `__healthcheck_${stamp}`,
    contactPerson: "Health",
    contactRoleUk: "QA",
    phone: null,
    email: null,
    website: null,
    legalDetails: "UA000",
    note: null,
  });

  for (const key of REQUIRED_CLIENT_NESTED) {
    const rows = created[key];
    if (!Array.isArray(rows) || rows.length < 1) {
      throw new Error(`createClient missing ${key}`);
    }
  }

  await prisma.client.delete({ where: { id: created.id } });
  console.log("prisma-healthcheck ok", {
    models: REQUIRED_MODELS.length,
    nested: REQUIRED_CLIENT_NESTED.join(","),
  });
}

main().catch((error) => {
  console.error("prisma-healthcheck FAILED", error);
  process.exit(1);
});
