-- Contact people under client / supplier companies; optional on orders.

CREATE TABLE "client_contacts" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "roleUk" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_contacts" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "roleUk" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_contacts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_contacts_clientId_idx" ON "client_contacts"("clientId");
CREATE INDEX "supplier_contacts_supplierId_idx" ON "supplier_contacts"("supplierId");

ALTER TABLE "client_contacts" ADD CONSTRAINT "client_contacts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN "client_contact_id" TEXT;
CREATE INDEX "orders_client_contact_id_idx" ON "orders"("client_contact_id");
ALTER TABLE "orders" ADD CONSTRAINT "orders_client_contact_id_fkey" FOREIGN KEY ("client_contact_id") REFERENCES "client_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed primary contacts from legacy single-person fields.
INSERT INTO "client_contacts" ("id", "clientId", "nameUk", "phone", "email", "isPrimary", "sortOrder", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || c.id),
  c.id,
  TRIM(c."contactPerson"),
  c.phone,
  c.email,
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "clients" c
WHERE c."contactPerson" IS NOT NULL AND TRIM(c."contactPerson") <> '';

INSERT INTO "supplier_contacts" ("id", "supplierId", "nameUk", "phone", "email", "isPrimary", "sortOrder", "createdAt", "updatedAt")
SELECT
  md5(random()::text || clock_timestamp()::text || s.id),
  s.id,
  TRIM(s."contactPerson"),
  s.phone,
  s.email,
  true,
  0,
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "suppliers" s
WHERE s."contactPerson" IS NOT NULL AND TRIM(s."contactPerson") <> '';
