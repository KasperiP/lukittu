/*
  Warnings:

  - You are about to drop the column `auditLogId` on the `WebhookEvent` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "WebhookEvent" DROP CONSTRAINT "WebhookEvent_auditLogId_fkey";

-- AlterTable
ALTER TABLE "WebhookEvent" DROP COLUMN "auditLogId",
ADD COLUMN     "source" "AuditLogSource" NOT NULL DEFAULT 'DASHBOARD',
ADD COLUMN     "userId" TEXT;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
