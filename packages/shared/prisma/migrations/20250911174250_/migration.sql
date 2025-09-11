/*
  Warnings:

  - A unique constraint covering the columns `[teamId,discordId]` on the table `CustomerDiscordAccount` will be added. If there are existing duplicate values, this will fail.

*/
-- DropIndex
DROP INDEX "public"."CustomerDiscordAccount_teamId_discordId_idx";

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDiscordAccount_teamId_discordId_key" ON "public"."CustomerDiscordAccount"("teamId", "discordId");
