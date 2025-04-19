-- AlterTable
ALTER TABLE "Limits" ADD COLUMN     "allowWatermarking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Settings" ADD COLUMN     "watermarking" BOOLEAN NOT NULL DEFAULT false;
