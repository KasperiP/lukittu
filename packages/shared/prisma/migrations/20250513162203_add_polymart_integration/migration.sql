-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogAction" ADD VALUE 'SET_POLYMART_INTEGRATION';
ALTER TYPE "AuditLogAction" ADD VALUE 'DELETE_POLYMART_INTEGRATION';

-- CreateTable
CREATE TABLE "PolymartIntegration" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "webhookSecret" TEXT NOT NULL,
    "signingSecret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolymartIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PolymartIntegration_teamId_key" ON "PolymartIntegration"("teamId");

-- AddForeignKey
ALTER TABLE "PolymartIntegration" ADD CONSTRAINT "PolymartIntegration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolymartIntegration" ADD CONSTRAINT "PolymartIntegration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
