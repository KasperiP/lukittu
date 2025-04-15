-- AlterTable
ALTER TABLE "RequestLog" ADD COLUMN     "releaseFileId" TEXT,
ADD COLUMN     "releaseId" TEXT;

-- AddForeignKey
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "Release"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RequestLog" ADD CONSTRAINT "RequestLog_releaseFileId_fkey" FOREIGN KEY ("releaseFileId") REFERENCES "ReleaseFile"("id") ON DELETE SET NULL ON UPDATE CASCADE;
