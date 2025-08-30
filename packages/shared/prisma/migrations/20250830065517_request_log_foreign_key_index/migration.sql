-- CreateIndex
CREATE INDEX "RequestLog_productId_idx" ON "public"."RequestLog"("productId") WHERE "productId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "RequestLog_releaseId_idx" ON "public"."RequestLog"("releaseId") WHERE "releaseId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "RequestLog_releaseFileId_idx" ON "public"."RequestLog"("releaseFileId") WHERE "releaseFileId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "RequestLog_licenseId_idx" ON "public"."RequestLog"("licenseId") WHERE "licenseId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "RequestLog_customerId_idx" ON "public"."RequestLog"("customerId") WHERE "customerId" IS NOT NULL;
