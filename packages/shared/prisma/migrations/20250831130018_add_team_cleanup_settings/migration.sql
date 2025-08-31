-- AlterTable
ALTER TABLE "public"."Settings" ADD COLUMN     "danglingCustomerCleanupDays" INTEGER,
ADD COLUMN     "expiredLicenseCleanupDays" INTEGER;
