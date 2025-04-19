-- AlterTable
ALTER TABLE "_CustomerToLicense" ADD CONSTRAINT "_CustomerToLicense_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_CustomerToLicense_AB_unique";

-- AlterTable
ALTER TABLE "_LicenseToProduct" ADD CONSTRAINT "_LicenseToProduct_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_LicenseToProduct_AB_unique";

-- AlterTable
ALTER TABLE "_LicenseToRelease" ADD CONSTRAINT "_LicenseToRelease_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_LicenseToRelease_AB_unique";

-- AlterTable
ALTER TABLE "_TeamUsers" ADD CONSTRAINT "_TeamUsers_AB_pkey" PRIMARY KEY ("A", "B");

-- DropIndex
DROP INDEX "_TeamUsers_AB_unique";

-- CreateTable
CREATE TABLE "Subscription" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "stripeCustomerId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "canceledAt" TIMESTAMP(3),
    "billingPeriodEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Subscription_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_teamId_key" ON "Subscription"("teamId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeSubscriptionId_key" ON "Subscription"("stripeSubscriptionId");

-- CreateIndex
CREATE UNIQUE INDEX "Subscription_stripeCustomerId_key" ON "Subscription"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Subscription_teamId_idx" ON "Subscription"("teamId");

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
