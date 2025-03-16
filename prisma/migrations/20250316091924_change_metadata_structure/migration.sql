/*
  Warnings:

  - You are about to drop the column `metadata` on the `Blacklist` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `Customer` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `License` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `Product` table. All the data in the column will be lost.
  - You are about to drop the column `metadata` on the `Release` table. All the data in the column will be lost.

*/

-- CreateTable
CREATE TABLE "Metadata" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "locked" BOOLEAN NOT NULL DEFAULT false,
    "teamId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "customerId" TEXT,
    "licenseId" TEXT,
    "productId" TEXT,
    "releaseId" TEXT,
    "blacklistId" TEXT,

    CONSTRAINT "Metadata_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Metadata_teamId_idx" ON "Metadata"("teamId");

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Metadata" ADD CONSTRAINT "Metadata_blacklistId_fkey" FOREIGN KEY ("blacklistId") REFERENCES "Blacklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Migrate Customer metadata
DO $$
DECLARE
    customer_record RECORD;
    metadata_item RECORD;
BEGIN
    FOR customer_record IN SELECT id, "teamId", metadata FROM "Customer" WHERE metadata IS NOT NULL AND metadata != '[]'::jsonb LOOP
        FOR metadata_item IN SELECT * FROM jsonb_to_recordset(customer_record.metadata) AS x(key text, value text, locked boolean) LOOP
            INSERT INTO "Metadata" (
                id, key, value, locked, "teamId", "customerId", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), 
                metadata_item.key, 
                metadata_item.value, 
                COALESCE(metadata_item.locked, false), 
                customer_record."teamId", 
                customer_record.id,
                NOW(), 
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;

-- Migrate License metadata
DO $$
DECLARE
    license_record RECORD;
    metadata_item RECORD;
BEGIN
    FOR license_record IN SELECT id, "teamId", metadata FROM "License" WHERE metadata IS NOT NULL AND metadata != '[]'::jsonb LOOP
        FOR metadata_item IN SELECT * FROM jsonb_to_recordset(license_record.metadata) AS x(key text, value text, locked boolean) LOOP
            INSERT INTO "Metadata" (
                id, key, value, locked, "teamId", "licenseId", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), 
                metadata_item.key, 
                metadata_item.value, 
                COALESCE(metadata_item.locked, false), 
                license_record."teamId", 
                license_record.id,
                NOW(), 
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;

-- Migrate Product metadata
DO $$
DECLARE
    product_record RECORD;
    metadata_item RECORD;
BEGIN
    FOR product_record IN SELECT id, "teamId", metadata FROM "Product" WHERE metadata IS NOT NULL AND metadata != '[]'::jsonb LOOP
        FOR metadata_item IN SELECT * FROM jsonb_to_recordset(product_record.metadata) AS x(key text, value text, locked boolean) LOOP
            INSERT INTO "Metadata" (
                id, key, value, locked, "teamId", "productId", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), 
                metadata_item.key, 
                metadata_item.value, 
                COALESCE(metadata_item.locked, false), 
                product_record."teamId", 
                product_record.id,
                NOW(), 
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;

-- Migrate Release metadata
DO $$
DECLARE
    release_record RECORD;
    metadata_item RECORD;
BEGIN
    FOR release_record IN SELECT id, "teamId", metadata FROM "Release" WHERE metadata IS NOT NULL AND metadata != '[]'::jsonb LOOP
        FOR metadata_item IN SELECT * FROM jsonb_to_recordset(release_record.metadata) AS x(key text, value text, locked boolean) LOOP
            INSERT INTO "Metadata" (
                id, key, value, locked, "teamId", "releaseId", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), 
                metadata_item.key, 
                metadata_item.value, 
                COALESCE(metadata_item.locked, false), 
                release_record."teamId", 
                release_record.id,
                NOW(), 
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;

-- Migrate Blacklist metadata
DO $$
DECLARE
    blacklist_record RECORD;
    metadata_item RECORD;
BEGIN
    FOR blacklist_record IN SELECT id, "teamId", metadata FROM "Blacklist" WHERE metadata IS NOT NULL AND metadata != '[]'::jsonb LOOP
        FOR metadata_item IN SELECT * FROM jsonb_to_recordset(blacklist_record.metadata) AS x(key text, value text, locked boolean) LOOP
            INSERT INTO "Metadata" (
                id, key, value, locked, "teamId", "blacklistId", "createdAt", "updatedAt"
            ) VALUES (
                gen_random_uuid(), 
                metadata_item.key, 
                metadata_item.value, 
                COALESCE(metadata_item.locked, false), 
                blacklist_record."teamId", 
                blacklist_record.id,
                NOW(), 
                NOW()
            );
        END LOOP;
    END LOOP;
END $$;

-- AlterTable (drop the columns after migrating the data)
ALTER TABLE "Blacklist" DROP COLUMN "metadata";
ALTER TABLE "Customer" DROP COLUMN "metadata";
ALTER TABLE "License" DROP COLUMN "metadata";
ALTER TABLE "Product" DROP COLUMN "metadata";
ALTER TABLE "Release" DROP COLUMN "metadata";
