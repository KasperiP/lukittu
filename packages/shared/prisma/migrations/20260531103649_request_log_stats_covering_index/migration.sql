-- Covering index for RequestLog statistics aggregations.
--
-- All dashboard/dev statistics queries filter on (teamId, createdAt) and then
-- aggregate on status / type / country / licenseId. Without those columns in the
-- index, Postgres does a heap fetch per matching row, and because RequestLog rows
-- are very wide (inline requestBody/responseBody/requestQuery JSON) a 30-day
-- aggregation turns into millions of random heap reads. The INCLUDE payload below
-- lets those queries run as index-only scans.

-- CreateIndex
CREATE INDEX CONCURRENTLY IF NOT EXISTS "RequestLog_teamId_createdAt_stats_idx"
    ON "public"."RequestLog" ("teamId", "createdAt")
    INCLUDE ("status", "type", "country", "licenseId");

-- DropIndex (now redundant: same key prefix, no payload)
DROP INDEX CONCURRENTLY IF EXISTS "public"."RequestLog_teamId_createdAt_idx";
