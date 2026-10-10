-- CreateTable
CREATE TABLE "decoration_formats" (
    "id" TEXT NOT NULL,
    "nameUk" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "decoration_formats_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "decoration_format_tiers" (
    "id" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "minQuantity" INTEGER NOT NULL,
    "unitRate" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "decoration_format_tiers_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "order_item_decorations" ADD COLUMN "decorationFormatId" TEXT;

-- CreateIndex
CREATE INDEX "decoration_formats_sortOrder_idx" ON "decoration_formats"("sortOrder");

-- CreateIndex
CREATE INDEX "decoration_format_tiers_formatId_idx" ON "decoration_format_tiers"("formatId");

-- CreateIndex
CREATE UNIQUE INDEX "decoration_format_tiers_formatId_minQuantity_key" ON "decoration_format_tiers"("formatId", "minQuantity");

-- CreateIndex
CREATE INDEX "order_item_decorations_decorationFormatId_idx" ON "order_item_decorations"("decorationFormatId");

-- AddForeignKey
ALTER TABLE "decoration_format_tiers" ADD CONSTRAINT "decoration_format_tiers_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "decoration_formats"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_item_decorations" ADD CONSTRAINT "order_item_decorations_decorationFormatId_fkey" FOREIGN KEY ("decorationFormatId") REFERENCES "decoration_formats"("id") ON DELETE SET NULL ON UPDATE CASCADE;
