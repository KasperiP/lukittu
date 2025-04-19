/*
  Warnings:

  - You are about to drop the column `watermarking` on the `Settings` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Settings" DROP COLUMN "watermarking";

-- CreateTable
CREATE TABLE "WatermarkingSettings" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "watermarkingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "staticConstantPoolSynthesis" BOOLEAN NOT NULL DEFAULT false,
    "staticConstantPoolDensity" INTEGER NOT NULL DEFAULT 0,
    "dynamicBytecodeInjection" BOOLEAN NOT NULL DEFAULT false,
    "dynamicBytecodeDensity" INTEGER NOT NULL DEFAULT 0,
    "temporalAttributeEmbedding" BOOLEAN NOT NULL DEFAULT false,
    "temporalAttributeDensity" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "WatermarkingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WatermarkingSettings_teamId_key" ON "WatermarkingSettings"("teamId");

-- AddForeignKey
ALTER TABLE "WatermarkingSettings" ADD CONSTRAINT "WatermarkingSettings_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
