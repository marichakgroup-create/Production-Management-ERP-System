ALTER TABLE "company_settings" ADD COLUMN IF NOT EXISTS "is_default" BOOLEAN NOT NULL DEFAULT false;

UPDATE "company_settings"
SET "is_default" = true
WHERE id = (
  SELECT id FROM "company_settings" ORDER BY "updatedAt" ASC LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM "company_settings" WHERE "is_default" = true
);

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "company_settings_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'orders_company_settings_id_fkey'
  ) THEN
    ALTER TABLE "orders"
      ADD CONSTRAINT "orders_company_settings_id_fkey"
      FOREIGN KEY ("company_settings_id") REFERENCES "company_settings"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "orders_company_settings_id_idx" ON "orders"("company_settings_id");
