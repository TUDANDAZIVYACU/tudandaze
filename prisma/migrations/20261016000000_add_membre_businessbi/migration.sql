CREATE TABLE IF NOT EXISTS "MembreBusinessbi" (
    "id" TEXT NOT NULL,
    "email" TEXT,
    "telephone" TEXT,
    "clerkUserId" TEXT,
    "businessbiId" TEXT NOT NULL,
    "nom" TEXT,
    "role" TEXT NOT NULL DEFAULT 'caissier',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MembreBusinessbi_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "MembreBusinessbi_email_key" ON "MembreBusinessbi"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "MembreBusinessbi_telephone_key" ON "MembreBusinessbi"("telephone");
CREATE UNIQUE INDEX IF NOT EXISTS "MembreBusinessbi_clerkUserId_key" ON "MembreBusinessbi"("clerkUserId");
CREATE INDEX IF NOT EXISTS "MembreBusinessbi_businessbiId_idx" ON "MembreBusinessbi"("businessbiId");

ALTER TABLE "MembreBusinessbi" ADD CONSTRAINT "MembreBusinessbi_businessbiId_fkey" FOREIGN KEY ("businessbiId") REFERENCES "Businessbi"("id") ON DELETE CASCADE ON UPDATE CASCADE;
