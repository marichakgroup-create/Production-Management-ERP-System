-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN "orderItemDecorationId" TEXT;

-- CreateIndex
CREATE INDEX "file_assets_orderItemDecorationId_idx" ON "file_assets"("orderItemDecorationId");

-- AddForeignKey
ALTER TABLE "file_assets" ADD CONSTRAINT "file_assets_orderItemDecorationId_fkey" FOREIGN KEY ("orderItemDecorationId") REFERENCES "order_item_decorations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
