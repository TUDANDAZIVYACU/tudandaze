-- AlterTable
ALTER TABLE "Businessbi" ADD COLUMN     "nif" TEXT,
ADD COLUMN     "proprietaire" TEXT,
ADD COLUMN     "secteurActivite" TEXT,
ADD COLUMN     "telephoneContact" TEXT;

-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "factureUrl" TEXT;
