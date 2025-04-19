-- AlterEnum
ALTER TYPE "RequestStatus" ADD VALUE 'FORBIDDEN';

-- AlterTable
ALTER TABLE "Limits" ADD COLUMN     "allowClassloader" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "maxStorage" SET DEFAULT 0;
