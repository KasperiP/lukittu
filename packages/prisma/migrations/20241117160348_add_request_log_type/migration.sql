-- CreateEnum
CREATE TYPE "RequestType" AS ENUM ('UNKNOWN', 'HEARTBEAT', 'VERIFY', 'DOWNLOAD');

-- AlterTable
ALTER TABLE "RequestLog" ADD COLUMN     "type" "RequestType" NOT NULL DEFAULT 'UNKNOWN';
