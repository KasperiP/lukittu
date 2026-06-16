/*
  Warnings:

  - You are about to drop the column `allowWatermarking` on the `Limits` table. All the data in the column will be lost.
  - You are about to drop the `WatermarkingSettings` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "WatermarkingSettings" DROP CONSTRAINT "WatermarkingSettings_teamId_fkey";

-- DropIndex
DROP INDEX "RequestLog_teamId_createdAt_stats_idx";

-- AlterTable
ALTER TABLE "Limits" DROP COLUMN "allowWatermarking";

-- DropTable
DROP TABLE "WatermarkingSettings";
