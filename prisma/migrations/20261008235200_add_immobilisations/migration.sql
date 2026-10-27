-- CreateTable
CREATE TABLE "Immobilisation" (
    "id" TEXT NOT NULL,
    "designation" TEXT NOT NULL,
    "dateAcquisition" TIMESTAMP(3) NOT NULL,
    "prix" DOUBLE PRECISION NOT NULL,
    "numeroSerie" TEXT,
    "factureUrl" TEXT,
    "photoUrl" TEXT,
    "businessbiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Immobilisation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Immobilisation_businessbiId_dateAcquisition_idx" ON "Immobilisation"("businessbiId", "dateAcquisition");

-- AddForeignKey
ALTER TABLE "Immobilisation" ADD CONSTRAINT "Immobilisation_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
