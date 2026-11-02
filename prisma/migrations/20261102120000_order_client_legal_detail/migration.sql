-- Per-order pick of client legal / banking реквізити.

ALTER TABLE "orders" ADD COLUMN "client_legal_detail_id" TEXT;

CREATE INDEX "orders_client_legal_detail_id_idx" ON "orders"("client_legal_detail_id");

ALTER TABLE "orders" ADD CONSTRAINT "orders_client_legal_detail_id_fkey"
  FOREIGN KEY ("client_legal_detail_id") REFERENCES "client_legal_details"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Default existing orders to the client's primary (or first) legal entity.
UPDATE "orders" o
SET "client_legal_detail_id" = d.id
FROM (
  SELECT DISTINCT ON ("clientId")
    id,
    "clientId"
  FROM "client_legal_details"
  ORDER BY "clientId", "isPrimary" DESC, "sortOrder" ASC, "nameUk" ASC
) d
WHERE o."clientId" = d."clientId"
  AND o."client_legal_detail_id" IS NULL;
