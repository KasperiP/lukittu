/*
  Warnings:

  - You are about to drop the column `heartbeatTimeout` on the `Settings` table. All the data in the column will be lost.
  - You are about to drop the `Heartbeat` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Heartbeat" DROP CONSTRAINT "Heartbeat_licenseId_fkey";

-- DropForeignKey
ALTER TABLE "Heartbeat" DROP CONSTRAINT "Heartbeat_teamId_fkey";

-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "heartbeatTimeout",
ADD COLUMN     "deviceTimeout" INTEGER NOT NULL DEFAULT 60;

-- DropTable
DROP TABLE "Heartbeat";

-- CreateTable
CREATE TABLE "Device" (
    "id" TEXT NOT NULL,
    "licenseId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "ipAddress" TEXT,
    "country" TEXT,
    "deviceIdentifier" TEXT NOT NULL,
    "lastBeatAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Device_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Device_teamId_idx" ON "Device"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Device_licenseId_deviceIdentifier_key" ON "Device"("licenseId", "deviceIdentifier");

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Device" ADD CONSTRAINT "Device_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
