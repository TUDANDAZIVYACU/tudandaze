-- AlterTable
ALTER TABLE "Dette" ADD COLUMN     "venteId" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "venteId" TEXT;

-- CreateIndex
CREATE INDEX "Dette_venteId_idx" ON "Dette"("venteId");

-- CreateIndex
CREATE INDEX "Transaction_venteId_idx" ON "Transaction"("venteId");
