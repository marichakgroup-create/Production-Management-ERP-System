ALTER TABLE "company_settings" ADD COLUMN "is_default" BOOLEAN NOT NULL DEFAULT false;

UPDATE "company_settings"
SET "is_default" = true
WHERE id = (
  SELECT id FROM "company_settings" ORDER BY "updated_at" ASC LIMIT 1
);

ALTER TABLE "orders" ADD COLUMN "company_settings_id" TEXT;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_company_settings_id_fkey"
  FOREIGN KEY ("company_settings_id") REFERENCES "company_settings"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_company_settings_id_idx" ON "orders"("company_settings_id");
