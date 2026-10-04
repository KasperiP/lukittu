import { Prisma } from '../../prisma/generated/client';
import { logger } from '../logging/logger';
import { prisma } from '../prisma/prisma';

const DETACHABLE_COLUMNS = [
  'licenseId',
  'productId',
  'customerId',
  'releaseId',
  'releaseFileId',
] as const;

export type RequestLogDetachColumn = (typeof DETACHABLE_COLUMNS)[number];

/**
 * Nullifies a RequestLog foreign key column in batches before the referenced
 * rows are deleted, so the foreign key's ON DELETE SET NULL trigger has almost
 * nothing to do. Without this, deleting a heavily used license, product,
 * customer, release or release file rewrites every one of its request logs in
 * a single statement inside the delete transaction, which can take far longer
 * than the transaction timeout.
 *
 * Must run OUTSIDE the delete transaction; the foreign key remains the
 * safety net for rows written between detach and delete, or skipped because
 * a concurrent update moved them mid-batch. Idempotent and
 * resumable: already-nullified rows never match again.
 */
export async function detachRequestLogs(
  column: RequestLogDetachColumn,
  ids: string[],
  batchSize = 5000,
): Promise<number> {
  if (!DETACHABLE_COLUMNS.includes(column)) {
    throw new Error(`Invalid request log column: ${column}`);
  }

  const columnSql = Prisma.raw(`"${column}"`);
  let total = 0;

  for (const id of ids) {
    while (true) {
      // Targets rows by ctid so the update is an index scan plus a TID scan.
      // Joining back on id lets the planner pick a full table scan per batch.
      const affected = await prisma.$executeRaw`
        UPDATE "RequestLog" SET ${columnSql} = NULL
        WHERE ctid = ANY(ARRAY(
          SELECT ctid FROM "RequestLog"
          WHERE ${columnSql} = ${id}
          LIMIT ${batchSize}
        ))`;

      total += affected;

      if (affected < batchSize) break;
    }
  }

  // Column statistics still describe the detached ids as common values, so
  // the foreign key's SET NULL query in the delete would plan a full table
  // scan for them. ANALYZE samples a fixed number of rows, so it stays cheap
  // on large tables. Best effort: a failure only costs the delete some speed.
  if (total >= batchSize) {
    try {
      await prisma.$executeRaw`ANALYZE "RequestLog" (${columnSql})`;
    } catch (error) {
      logger.warn('Failed to analyze RequestLog after detaching', {
        column,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return total;
}
