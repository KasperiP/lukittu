-- CreateEnum
CREATE TYPE "WebhookEventStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DELIVERED', 'FAILED', 'RETRY_SCHEDULED');

-- CreateEnum
CREATE TYPE "WebhookEventType" AS ENUM ('LICENSE_CREATED', 'LICENSE_UPDATED', 'LICENSE_DELETED', 'CUSTOMER_CREATED', 'CUSTOMER_UPDATED', 'CUSTOMER_DELETED', 'PRODUCT_CREATED', 'PRODUCT_UPDATED', 'PRODUCT_DELETED', 'RELEASE_CREATED', 'RELEASE_UPDATED', 'RELEASE_DELETED');

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

-- AlterTable
ALTER TABLE "Limits" ADD COLUMN     "maxWebhooks" INTEGER NOT NULL DEFAULT 20;

-- CreateTable
CREATE TABLE "Webhook" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "enabledEvents" "WebhookEventType"[] DEFAULT ARRAY[]::"WebhookEventType"[],
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Webhook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebhookEvent" (
    "id" TEXT NOT NULL,
    "webhookId" TEXT NOT NULL,
    "eventType" "WebhookEventType" NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "WebhookEventStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastAttemptAt" TIMESTAMP(3),
    "nextRetryAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "responseCode" INTEGER,
    "responseBody" TEXT,
    "completedAt" TIMESTAMP(3),
    "source" "AuditLogSource" NOT NULL DEFAULT 'DASHBOARD',
    "userId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WebhookEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Webhook_teamId_idx" ON "Webhook"("teamId");

-- CreateIndex
CREATE INDEX "WebhookEvent_status_nextRetryAt_idx" ON "WebhookEvent"("status", "nextRetryAt");

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Webhook" ADD CONSTRAINT "Webhook_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_webhookId_fkey" FOREIGN KEY ("webhookId") REFERENCES "Webhook"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebhookEvent" ADD CONSTRAINT "WebhookEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
