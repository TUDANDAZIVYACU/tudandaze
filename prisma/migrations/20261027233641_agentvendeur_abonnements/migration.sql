-- CreateTable
CREATE TABLE "Abonnement" (
    "id" TEXT NOT NULL,
    "businessbiId" TEXT NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'essai',
    "plan" TEXT,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Abonnement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaiementAbonnement" (
    "id" TEXT NOT NULL,
    "businessbiId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "codeTrans" TEXT NOT NULL,
    "telephone" TEXT,
    "numeroCompte" TEXT,
    "statut" TEXT NOT NULL DEFAULT 'en_attente',
    "rawPayload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaiementAbonnement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Abonnement_businessbiId_key" ON "Abonnement"("businessbiId");

-- CreateIndex
CREATE UNIQUE INDEX "PaiementAbonnement_codeTrans_key" ON "PaiementAbonnement"("codeTrans");

-- CreateIndex
CREATE INDEX "PaiementAbonnement_businessbiId_createdAt_idx" ON "PaiementAbonnement"("businessbiId", "createdAt");

-- CreateIndex
CREATE INDEX "Transaction_businessbiId_type_dateApprovis_idx" ON "Transaction"("businessbiId", "type", "dateApprovis");

-- AddForeignKey
ALTER TABLE "Abonnement" ADD CONSTRAINT "Abonnement_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaiementAbonnement" ADD CONSTRAINT "PaiementAbonnement_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
