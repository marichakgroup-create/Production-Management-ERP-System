-- CreateEnum
CREATE TYPE "DecorationFormatKind" AS ENUM ('DTF', 'EMBROIDERY');

-- AlterTable
ALTER TABLE "decoration_formats" ADD COLUMN "kind" "DecorationFormatKind" NOT NULL DEFAULT 'DTF';
ALTER TABLE "decoration_formats" ADD COLUMN "detailUk" TEXT;
ALTER TABLE "decoration_formats" ADD COLUMN "quoteIndividually" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "decoration_formats_kind_sortOrder_idx" ON "decoration_formats"("kind", "sortOrder");
