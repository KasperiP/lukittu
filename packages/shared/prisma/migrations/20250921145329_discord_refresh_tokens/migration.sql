-- AlterTable
ALTER TABLE "public"."CustomerDiscordAccount" ADD COLUMN     "globalName" TEXT;

-- AlterTable
ALTER TABLE "public"."UserDiscordAccount" ADD COLUMN     "globalName" TEXT,
ADD COLUMN     "refreshToken" TEXT;
