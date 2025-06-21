-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditLogAction" ADD VALUE 'CREATE_WEBHOOK';
ALTER TYPE "AuditLogAction" ADD VALUE 'UPDATE_WEBHOOK';
ALTER TYPE "AuditLogAction" ADD VALUE 'DELETE_WEBHOOK';

-- AlterEnum
ALTER TYPE "AuditLogTargetType" ADD VALUE 'WEBHOOK';
