-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogAction" ADD VALUE 'SET_DISCORD_INTEGRATION';
ALTER TYPE "AuditLogAction" ADD VALUE 'DELETE_DISCORD_INTEGRATION';

-- AlterTable
ALTER TABLE "DiscordAccount" ADD COLUMN     "selectedTeamId" TEXT;

-- CreateTable
CREATE TABLE "DiscordIntegration" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DiscordIntegration_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DiscordIntegration_teamId_key" ON "DiscordIntegration"("teamId");

-- AddForeignKey
ALTER TABLE "DiscordAccount" ADD CONSTRAINT "DiscordAccount_selectedTeamId_fkey" FOREIGN KEY ("selectedTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordIntegration" ADD CONSTRAINT "DiscordIntegration_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DiscordIntegration" ADD CONSTRAINT "DiscordIntegration_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
