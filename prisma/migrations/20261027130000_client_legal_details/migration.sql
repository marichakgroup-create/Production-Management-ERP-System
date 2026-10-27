-- Multiple legal / banking реквізити per client.

CREATE TABLE "client_legal_details" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "details" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_legal_details_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_legal_details_clientId_idx" ON "client_legal_details"("clientId");

ALTER TABLE "client_legal_details" ADD CONSTRAINT "client_legal_details_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill from legacy single legalDetails text blob.
INSERT INTO "client_legal_details" ("id", "clientId", "nameUk", "details", "isPrimary", "sortOrder", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || c.id),
  c.id,
  'Основні реквізити',
  TRIM(c."legalDetails"),
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "clients" c
WHERE c."legalDetails" IS NOT NULL AND TRIM(c."legalDetails") <> '';
