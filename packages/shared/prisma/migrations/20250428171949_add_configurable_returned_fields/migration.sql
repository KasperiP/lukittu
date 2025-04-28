-- CreateTable
CREATE TABLE "ReturnedFields" (
    "id" TEXT NOT NULL,
    "settingsId" TEXT NOT NULL,
    "licenseIpLimit" BOOLEAN NOT NULL DEFAULT false,
    "licenseSeats" BOOLEAN NOT NULL DEFAULT false,
    "licenseExpirationType" BOOLEAN NOT NULL DEFAULT false,
    "licenseExpirationStart" BOOLEAN NOT NULL DEFAULT false,
    "licenseExpirationDate" BOOLEAN NOT NULL DEFAULT false,
    "licenseExpirationDays" BOOLEAN NOT NULL DEFAULT false,
    "licenseMetadataKeys" TEXT[],
    "customerEmail" BOOLEAN NOT NULL DEFAULT false,
    "customerFullName" BOOLEAN NOT NULL DEFAULT false,
    "customerUsername" BOOLEAN NOT NULL DEFAULT false,
    "customerMetadataKeys" TEXT[],
    "productName" BOOLEAN NOT NULL DEFAULT false,
    "productUrl" BOOLEAN NOT NULL DEFAULT false,
    "productMetadataKeys" TEXT[],
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnedFields_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ReturnedFields_settingsId_key" ON "ReturnedFields"("settingsId");

-- AddForeignKey
ALTER TABLE "ReturnedFields" ADD CONSTRAINT "ReturnedFields_settingsId_fkey" FOREIGN KEY ("settingsId") REFERENCES "Settings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
