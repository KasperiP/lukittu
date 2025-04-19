/*
  Warnings:

  - You are about to drop the column `selectedGuild` on the `DiscordAccount` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "DiscordAccount" DROP COLUMN "selectedGuild",
ADD COLUMN     "selectedTeamId" TEXT;

-- AddForeignKey
ALTER TABLE "DiscordAccount" ADD CONSTRAINT "DiscordAccount_selectedTeamId_fkey" FOREIGN KEY ("selectedTeamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
