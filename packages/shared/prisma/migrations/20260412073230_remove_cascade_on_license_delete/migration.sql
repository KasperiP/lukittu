-- DropForeignKey
ALTER TABLE "RequestLog" DROP CONSTRAINT "RequestLog_licenseId_fkey";

-- AddForeignKey
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_licenseId_fkey" FOREIGN KEY ("licenseId") REFERENCES "License"("id") ON DELETE SET NULL ON UPDATE CASCADE;
