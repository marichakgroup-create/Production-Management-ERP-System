-- AlterTable
ALTER TABLE "orders" ADD COLUMN "active_proposal_revision" INTEGER;

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN "superseded" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "order_items_orderId_superseded_idx" ON "order_items"("orderId", "superseded");
