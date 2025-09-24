/*
  Warnings:

  - Added the required column `guildName` to the `ProductDiscordRole` table without a default value. This is not possible if the table is not empty.
  - Added the required column `roleName` to the `ProductDiscordRole` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "public"."ProductDiscordRole" ADD COLUMN     "guildName" TEXT NOT NULL,
ADD COLUMN     "roleName" TEXT NOT NULL;
