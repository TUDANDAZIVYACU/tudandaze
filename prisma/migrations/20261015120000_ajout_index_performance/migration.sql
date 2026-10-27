CREATE INDEX IF NOT EXISTS "Transaction_businessbiId_createdAt_idx" ON "Transaction"("businessbiId", "createdAt");
CREATE INDEX IF NOT EXISTS "Transaction_productId_idx" ON "Transaction"("productId");
CREATE INDEX IF NOT EXISTS "Depense_businessbiId_date_idx" ON "Depense"("businessbiId", "date");
CREATE INDEX IF NOT EXISTS "Dette_businessbiId_createdAt_idx" ON "Dette"("businessbiId", "createdAt");
CREATE INDEX IF NOT EXISTS "Paiement_detteId_idx" ON "Paiement"("detteId");
CREATE INDEX IF NOT EXISTS "VenteItem_venteId_idx" ON "VenteItem"("venteId");
