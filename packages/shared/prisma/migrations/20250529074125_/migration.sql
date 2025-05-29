-- AlterEnum
ALTER TYPE "WebhookEventStatus" ADD VALUE 'IN_PROGRESS';

-- CreateIndex
CREATE INDEX "WebhookEvent_status_nextRetryAt_idx" ON "WebhookEvent"("status", "nextRetryAt");
