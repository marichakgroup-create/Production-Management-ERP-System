-- AlterTable
ALTER TABLE "order_item_decorations" ADD COLUMN "comment" TEXT;

-- AlterTable
ALTER TABLE "file_assets" ADD COLUMN "pieceQuantity" INTEGER;
ALTER TABLE "file_assets" ADD COLUMN "sizeQuantities" JSONB;
