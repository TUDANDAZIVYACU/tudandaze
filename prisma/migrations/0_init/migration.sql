-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "Businessbi" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "assureurId" TEXT,
    "numeroPolice" TEXT,
    "accesActif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Businessbi_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Assureur" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Assureur_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssureurUser" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "clerkUserId" TEXT,
    "assureurId" TEXT NOT NULL,
    "nom" TEXT,
    "role" TEXT NOT NULL DEFAULT 'ADMIN',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AssureurUser_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Product" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "prixAchat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prixVente" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "price" DOUBLE PRECISION NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 0,
    "unit" TEXT NOT NULL,
    "imageUrl" TEXT,
    "archivedAt" TIMESTAMP(3),
    "businessbiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Product_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transaction" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "prixAchat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prixVente" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "dateApprovis" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "productId" TEXT NOT NULL,
    "businessbiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MouvementStock" (
    "id" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "businessbiId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "quantite" INTEGER NOT NULL,
    "prixAchat" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" TEXT,
    "refId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MouvementStock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Depense" (
    "id" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "description" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "categorie" TEXT NOT NULL,
    "businessbiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Depense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Dette" (
    "id" TEXT NOT NULL,
    "debiteur" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "montantPaye" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "description" TEXT NOT NULL,
    "dateEcheance" TIMESTAMP(3),
    "statut" TEXT NOT NULL DEFAULT 'en_cours',
    "businessbiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Dette_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Paiement" (
    "id" TEXT NOT NULL,
    "montant" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,
    "detteId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Paiement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CaisseEntry" (
    "id" TEXT NOT NULL,
    "ordo" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "libelle" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessbiId" TEXT NOT NULL,

    CONSTRAINT "CaisseEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BanqueEntry" (
    "id" TEXT NOT NULL,
    "ordo" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "bordereau" TEXT NOT NULL,
    "libelle" TEXT NOT NULL,
    "banque" TEXT NOT NULL,
    "compte" TEXT NOT NULL,
    "categorie" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "businessbiId" TEXT NOT NULL,

    CONSTRAINT "BanqueEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vente" (
    "id" TEXT NOT NULL,
    "numero" TEXT,
    "avecFacture" BOOLEAN NOT NULL DEFAULT false,
    "clientNom" TEXT,
    "clientAdresse" TEXT,
    "clientTelephone" TEXT,
    "montantHT" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montantTVA" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "montantTotal" DOUBLE PRECISION NOT NULL,
    "montantPaye" DOUBLE PRECISION NOT NULL,
    "solde" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "businessbiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Vente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VenteItem" (
    "id" TEXT NOT NULL,
    "venteId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unit" TEXT NOT NULL,
    "prixVente" DOUBLE PRECISION NOT NULL,
    "prixAchat" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "VenteItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Categorie" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "module" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "businessbiId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Categorie_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Businessbi_email_key" ON "Businessbi"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Businessbi_telephone_key" ON "Businessbi"("telephone");

-- CreateIndex
CREATE INDEX "Businessbi_assureurId_idx" ON "Businessbi"("assureurId");

-- CreateIndex
CREATE UNIQUE INDEX "Assureur_code_key" ON "Assureur"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Assureur_email_key" ON "Assureur"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AssureurUser_email_key" ON "AssureurUser"("email");

-- CreateIndex
CREATE UNIQUE INDEX "AssureurUser_telephone_key" ON "AssureurUser"("telephone");

-- CreateIndex
CREATE UNIQUE INDEX "AssureurUser_clerkUserId_key" ON "AssureurUser"("clerkUserId");

-- CreateIndex
CREATE INDEX "AssureurUser_assureurId_idx" ON "AssureurUser"("assureurId");

-- CreateIndex
CREATE INDEX "Product_businessbiId_idx" ON "Product"("businessbiId");

-- CreateIndex
CREATE INDEX "MouvementStock_businessbiId_date_idx" ON "MouvementStock"("businessbiId", "date");

-- CreateIndex
CREATE INDEX "MouvementStock_productId_date_idx" ON "MouvementStock"("productId", "date");

-- CreateIndex
CREATE INDEX "CaisseEntry_businessbiId_date_idx" ON "CaisseEntry"("businessbiId", "date");

-- CreateIndex
CREATE INDEX "BanqueEntry_businessbiId_date_idx" ON "BanqueEntry"("businessbiId", "date");

-- CreateIndex
CREATE INDEX "Vente_businessbiId_createdAt_idx" ON "Vente"("businessbiId", "createdAt");

-- CreateIndex
CREATE INDEX "Categorie_businessbiId_module_type_idx" ON "Categorie"("businessbiId", "module", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Categorie_businessbiId_module_type_nom_key" ON "Categorie"("businessbiId", "module", "type", "nom");

-- AddForeignKey
ALTER TABLE "Businessbi" ADD CONSTRAINT "Businessbi_assureurId_fkey" FOREIGN KEY ("assureurId") REFERENCES "Assureur"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssureurUser" ADD CONSTRAINT "AssureurUser_assureurId_fkey" FOREIGN KEY ("assureurId") REFERENCES "Assureur"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MouvementStock" ADD CONSTRAINT "MouvementStock_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Depense" ADD CONSTRAINT "Depense_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Dette" ADD CONSTRAINT "Dette_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Paiement" ADD CONSTRAINT "Paiement_detteId_fkey" FOREIGN KEY ("detteId") REFERENCES "Dette"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CaisseEntry" ADD CONSTRAINT "CaisseEntry_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BanqueEntry" ADD CONSTRAINT "BanqueEntry_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vente" ADD CONSTRAINT "Vente_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VenteItem" ADD CONSTRAINT "VenteItem_venteId_fkey" FOREIGN KEY ("venteId") REFERENCES "Vente"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Categorie" ADD CONSTRAINT "Categorie_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

