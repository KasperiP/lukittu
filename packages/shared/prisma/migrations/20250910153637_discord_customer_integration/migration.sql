-- AlterTable
ALTER TABLE "public"."DiscordAccount" RENAME TO "UserDiscordAccount";

-- RenameIndex
ALTER INDEX "public"."DiscordAccount_discordId_key" RENAME TO "UserDiscordAccount_discordId_key";

-- RenameIndex
ALTER INDEX "public"."DiscordAccount_userId_key" RENAME TO "UserDiscordAccount_userId_key";

-- AlterTable
ALTER TABLE "public"."UserDiscordAccount" RENAME CONSTRAINT "DiscordAccount_pkey" TO "UserDiscordAccount_pkey";

-- RenameForeignKey
ALTER TABLE "public"."UserDiscordAccount" RENAME CONSTRAINT "DiscordAccount_selectedTeamId_fkey" TO "UserDiscordAccount_selectedTeamId_fkey";

-- RenameForeignKey
ALTER TABLE "public"."UserDiscordAccount" RENAME CONSTRAINT "DiscordAccount_userId_fkey" TO "UserDiscordAccount_userId_fkey";

-- CreateTable
CREATE TABLE "public"."CustomerDiscordAccount" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "discordId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerDiscordAccount_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDiscordAccount_customerId_key" ON "public"."CustomerDiscordAccount"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerDiscordAccount_teamId_discordId_key" ON "public"."CustomerDiscordAccount"("teamId", "discordId");

-- AddForeignKey
ALTER TABLE "public"."CustomerDiscordAccount" ADD CONSTRAINT "CustomerDiscordAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "public"."Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."CustomerDiscordAccount" ADD CONSTRAINT "CustomerDiscordAccount_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migration: Convert avatarUrl to avatar (avatar hash only)
-- Rename avatarUrl column to avatar in UserDiscordAccount
ALTER TABLE "public"."UserDiscordAccount" RENAME COLUMN "avatarUrl" TO "avatar";

-- Rename avatarUrl column to avatar in CustomerDiscordAccount  
ALTER TABLE "public"."CustomerDiscordAccount" RENAME COLUMN "avatarUrl" TO "avatar";

-- Update UserDiscordAccount: extract avatar hash from URLs
UPDATE "public"."UserDiscordAccount" 
SET "avatar" = (
  CASE 
    WHEN "avatar" IS NULL THEN NULL
    WHEN "avatar" LIKE 'https://cdn.discordapp.com/avatars/%' THEN
      -- Extract avatar hash from URL pattern: /avatars/{userId}/{hash}.{ext}
      SUBSTRING("avatar" FROM '/avatars/[^/]+/([^.?]+)')
    ELSE NULL
  END
)
WHERE "avatar" IS NOT NULL;

-- Update CustomerDiscordAccount: extract avatar hash from URLs
UPDATE "public"."CustomerDiscordAccount" 
SET "avatar" = (
  CASE 
    WHEN "avatar" IS NULL THEN NULL
    WHEN "avatar" LIKE 'https://cdn.discordapp.com/avatars/%' THEN
      -- Extract avatar hash from URL pattern: /avatars/{userId}/{hash}.{ext}
      SUBSTRING("avatar" FROM '/avatars/[^/]+/([^.?]+)')
    ELSE NULL
  END
)
WHERE "avatar" IS NOT NULL;
