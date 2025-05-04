/*
  Warnings:

  - A unique constraint covering the columns `[productId,version,branchId]` on the table `Release` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogAction" ADD VALUE 'CREATE_BRANCH';
ALTER TYPE "AuditLogAction" ADD VALUE 'UPDATE_BRANCH';
ALTER TYPE "AuditLogAction" ADD VALUE 'DELETE_BRANCH';

-- DropIndex
DROP INDEX "Release_productId_version_key";

-- AlterTable
ALTER TABLE "Release" ADD COLUMN     "branchId" TEXT;

-- CreateTable
CREATE TABLE "ReleaseBranch" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReleaseBranch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReleaseBranch_productId_name_key" ON "ReleaseBranch"("productId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Release_productId_version_branchId_key" ON "Release"("productId", "version", "branchId");

-- AddForeignKey
ALTER TABLE "ReleaseBranch" ADD CONSTRAINT "ReleaseBranch_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Release" ADD CONSTRAINT "Release_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "ReleaseBranch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
