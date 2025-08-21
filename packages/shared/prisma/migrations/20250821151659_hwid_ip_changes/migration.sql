BEGIN;

-- AlterTable: Rename seats column to hwidLimit and migrate data
ALTER TABLE "public"."License" ADD COLUMN     "hwidLimit" INTEGER;

-- Migrate existing seats data to hwidLimit
UPDATE "public"."License" 
SET "hwidLimit" = "seats" 
WHERE "seats" IS NOT NULL;

-- Drop the old seats column
ALTER TABLE "public"."License" DROP COLUMN "seats";

-- AlterTable: First add new columns
ALTER TABLE "public"."Settings" 
ADD COLUMN     "hwidTimeout" INTEGER,
ADD COLUMN     "ipTimeout" INTEGER;

-- Migrate deviceTimeout values to hwidTimeout (deviceTimeout was already in minutes)
UPDATE "public"."Settings" 
SET "hwidTimeout" = "deviceTimeout" 
WHERE "deviceTimeout" IS NOT NULL;

-- Migrate ipLimitPeriod values to ipTimeout (convert to minutes)
UPDATE "public"."Settings" 
SET "ipTimeout" = CASE 
    WHEN "ipLimitPeriod" = 'DAY' THEN 1440    -- 24 * 60 minutes
    WHEN "ipLimitPeriod" = 'WEEK' THEN 10080  -- 7 * 24 * 60 minutes  
    WHEN "ipLimitPeriod" = 'MONTH' THEN 43200 -- 30 * 24 * 60 minutes
    ELSE 1440 -- Default to DAY if somehow null
END;

-- Now drop the old columns
ALTER TABLE "public"."Settings" 
DROP COLUMN "deviceTimeout",
DROP COLUMN "ipLimitPeriod";

-- CreateTable
CREATE TABLE "public"."IpAddress" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "forgotten" BOOLEAN NOT NULL DEFAULT false,
    "forgottenAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "country" TEXT,
    "licenseId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IpAddress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HardwareIdentifier" (
    "id" TEXT NOT NULL,
    "hwid" TEXT NOT NULL,
    "forgotten" BOOLEAN NOT NULL DEFAULT false,
    "forgottenAt" TIMESTAMP(3),
    "licenseId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "HardwareIdentifier_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (create before data migration to enable conflict handling)
CREATE INDEX "IpAddress_teamId_idx" ON "public"."IpAddress"("teamId");
CREATE UNIQUE INDEX "IpAddress_licenseId_ip_key" ON "public"."IpAddress"("licenseId", "ip");
CREATE INDEX "HardwareIdentifier_teamId_idx" ON "public"."HardwareIdentifier"("teamId");
CREATE UNIQUE INDEX "HardwareIdentifier_licenseId_hwid_key" ON "public"."HardwareIdentifier"("licenseId", "hwid");

-- Migrate data from Device table to new tables
-- First, migrate unique IP addresses from Device table where ipAddress is not null
-- Use DISTINCT to avoid duplicates during migration
INSERT INTO "public"."IpAddress" ("id", "ip", "lastSeenAt", "country", "licenseId", "teamId", "createdAt", "updatedAt")
SELECT DISTINCT ON ("licenseId", "ipAddress")
    gen_random_uuid(),
    "ipAddress",
    "lastBeatAt",
    "country",
    "licenseId",
    "teamId",
    "createdAt",
    CURRENT_TIMESTAMP
FROM "public"."Device" 
WHERE "ipAddress" IS NOT NULL
ORDER BY "licenseId", "ipAddress", "lastBeatAt" DESC;

-- Then, migrate unique device identifiers to HardwareIdentifier table
-- Use DISTINCT to avoid duplicates during migration
INSERT INTO "public"."HardwareIdentifier" ("id", "hwid", "licenseId", "teamId", "lastSeenAt", "createdAt", "updatedAt")
SELECT DISTINCT ON ("licenseId", "deviceIdentifier")
    gen_random_uuid(),
    "deviceIdentifier",
    "licenseId",
    "teamId",
    "lastBeatAt",
    "createdAt",
    CURRENT_TIMESTAMP
FROM "public"."Device"
WHERE "deviceIdentifier" IS NOT NULL
ORDER BY "licenseId", "deviceIdentifier", "lastBeatAt" DESC;

-- Migrate IP addresses from RequestLog table (last 30 days) to IpAddress table
-- This captures IP addresses that may not be in the Device table
INSERT INTO "public"."IpAddress" ("id", "ip", "lastSeenAt", "country", "licenseId", "teamId", "createdAt", "updatedAt")
SELECT DISTINCT ON (rl."licenseId", rl."ipAddress")
    gen_random_uuid(),
    rl."ipAddress",
    rl."createdAt"::TIMESTAMP(3),
    rl."country",
    rl."licenseId",
    rl."teamId",
    rl."createdAt"::TIMESTAMP(3),
    CURRENT_TIMESTAMP
FROM "public"."RequestLog" rl
WHERE rl."ipAddress" IS NOT NULL 
  AND rl."licenseId" IS NOT NULL
  AND rl."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND NOT EXISTS (
    -- Don't insert if this IP+license combination already exists from Device migration
    SELECT 1 FROM "public"."IpAddress" ia 
    WHERE ia."licenseId" = rl."licenseId" AND ia."ip" = rl."ipAddress"
  )
ORDER BY rl."licenseId", rl."ipAddress", rl."createdAt" DESC;

-- Migrate device identifiers from RequestLog table (last 30 days) to HardwareIdentifier table
-- This captures hardware identifiers that may not be in the Device table
INSERT INTO "public"."HardwareIdentifier" ("id", "hwid", "licenseId", "teamId", "lastSeenAt", "createdAt", "updatedAt")
SELECT DISTINCT ON (rl."licenseId", rl."deviceIdentifier")
    gen_random_uuid(),
    rl."deviceIdentifier",
    rl."licenseId",
    rl."teamId",
    rl."createdAt"::TIMESTAMP(3),
    rl."createdAt"::TIMESTAMP(3),
    CURRENT_TIMESTAMP
FROM "public"."RequestLog" rl
WHERE rl."deviceIdentifier" IS NOT NULL 
  AND rl."licenseId" IS NOT NULL
  AND rl."createdAt" >= CURRENT_TIMESTAMP - INTERVAL '30 days'
  AND NOT EXISTS (
    -- Don't insert if this HWID+license combination already exists from Device migration
    SELECT 1 FROM "public"."HardwareIdentifier" hi 
    WHERE hi."licenseId" = rl."licenseId" AND hi."hwid" = rl."deviceIdentifier"
  )
ORDER BY rl."licenseId", rl."deviceIdentifier", rl."createdAt" DESC;

-- Now drop the foreign key constraints and the Device table
-- DropForeignKey
ALTER TABLE "public"."Device" DROP CONSTRAINT "Device_licenseId_fkey";

-- DropForeignKey
ALTER TABLE "public"."Device" DROP CONSTRAINT "Device_teamId_fkey";

-- DropTable
DROP TABLE "public"."Device";

-- DropEnum
DROP TYPE "public"."IpLimitPeriod";

-- AddForeignKey
ALTER TABLE "public"."IpAddress" ADD CONSTRAINT "IpAddress_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "public"."License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."IpAddress" ADD CONSTRAINT "IpAddress_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HardwareIdentifier" ADD CONSTRAINT "HardwareIdentifier_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "public"."License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HardwareIdentifier" ADD CONSTRAINT "HardwareIdentifier_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "public"."Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterEnum: Rename DEVICE_IDENTIFIER to HARDWARE_IDENTIFIER in BlacklistType
ALTER TYPE "public"."BlacklistType" RENAME VALUE 'DEVICE_IDENTIFIER' TO 'HARDWARE_IDENTIFIER';

-- AlterEnum: Rename DEVICE_IDENTIFIER_BLACKLISTED to HARDWARE_IDENTIFIER_BLACKLISTED in RequestStatus
ALTER TYPE "public"."RequestStatus" RENAME VALUE 'DEVICE_IDENTIFIER_BLACKLISTED' TO 'HARDWARE_IDENTIFIER_BLACKLISTED';

-- AlterEnum: Rename MAXIMUM_CONCURRENT_SEATS to HWID_LIMIT_REACHED in RequestStatus
ALTER TYPE "public"."RequestStatus" RENAME VALUE 'MAXIMUM_CONCURRENT_SEATS' TO 'HWID_LIMIT_REACHED';

-- AlterTable: Rename licenseSeats to licenseHwidLimit in ReturnedFields table
ALTER TABLE "public"."ReturnedFields" RENAME COLUMN "licenseSeats" TO "licenseHwidLimit";

-- AlterTable: Rename deviceIdentifier to hardwareIdentifier in RequestLog table
ALTER TABLE "public"."RequestLog" RENAME COLUMN "deviceIdentifier" TO "hardwareIdentifier";

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."AuditLogAction" ADD VALUE 'FORGET_HWID';
ALTER TYPE "public"."AuditLogAction" ADD VALUE 'REMEMBER_HWID';
ALTER TYPE "public"."AuditLogAction" ADD VALUE 'FORGET_IP';
ALTER TYPE "public"."AuditLogAction" ADD VALUE 'REMEMBER_IP';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "public"."AuditLogTargetType" ADD VALUE 'HARDWARE_IDENTIFIER';
ALTER TYPE "public"."AuditLogTargetType" ADD VALUE 'IP_ADDRESS';

COMMIT;