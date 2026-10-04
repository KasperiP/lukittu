import { prismaMock } from '../../jest.setup';
import { Prisma } from '../../prisma/generated/client';
import { logger } from '../logging/logger';
import {
  detachRequestLogs,
  RequestLogDetachColumn,
} from './detach-request-logs';

describe('detachRequestLogs', () => {
  it('returns 0 without querying for an empty list', async () => {
    const result = await detachRequestLogs('licenseId', []);

    expect(result).toBe(0);
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('stops after a single short batch', async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(3);

    const result = await detachRequestLogs('licenseId', ['license-1'], 10);

    expect(result).toBe(3);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('keeps batching until a batch comes back short', async () => {
    prismaMock.$executeRaw
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(4);

    const result = await detachRequestLogs('licenseId', ['license-1'], 10);

    expect(result).toBe(24);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(4);
  });

  it('runs an extra empty batch when the last batch is exactly full', async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(10).mockResolvedValueOnce(0);

    const result = await detachRequestLogs('licenseId', ['license-1'], 10);

    expect(result).toBe(10);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(3);
  });

  it('detaches each id and sums the totals', async () => {
    prismaMock.$executeRaw
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(7);

    const result = await detachRequestLogs(
      'releaseId',
      ['release-1', 'release-2'],
      10,
    );

    expect(result).toBe(19);
    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(4);
    expect(prismaMock.$executeRaw.mock.calls[0]).toContain('release-1');
    expect(prismaMock.$executeRaw.mock.calls[2]).toContain('release-2');
  });

  it('targets the requested column', async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(0);

    await detachRequestLogs('productId', ['product-1']);

    const [, setColumn, whereColumn, id] = prismaMock.$executeRaw.mock.calls[0];

    expect(setColumn).toEqual(Prisma.raw('"productId"'));
    expect(whereColumn).toEqual(Prisma.raw('"productId"'));
    expect(id).toBe('product-1');
  });

  it('rejects columns outside the allowlist', async () => {
    await expect(
      detachRequestLogs('teamId" = NULL; --' as RequestLogDetachColumn, ['x']),
    ).rejects.toThrow('Invalid request log column');
    expect(prismaMock.$executeRaw).not.toHaveBeenCalled();
  });

  it('analyzes the column once after detaching at least one full batch', async () => {
    prismaMock.$executeRaw
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0);

    await detachRequestLogs('customerId', ['customer-1', 'customer-2'], 10);

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(5);
    const [strings, column] = prismaMock.$executeRaw.mock.calls[4];
    expect((strings as TemplateStringsArray).join('?')).toContain(
      'ANALYZE "RequestLog" (?)',
    );
    expect(column).toEqual(Prisma.raw('"customerId"'));
  });

  it('skips analyze when fewer rows than a batch were detached', async () => {
    prismaMock.$executeRaw.mockResolvedValueOnce(9);

    await detachRequestLogs('licenseId', ['license-1'], 10);

    expect(prismaMock.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not fail when analyze fails', async () => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => {});
    prismaMock.$executeRaw
      .mockResolvedValueOnce(10)
      .mockResolvedValueOnce(0)
      .mockRejectedValueOnce(new Error('must be owner of table RequestLog'));

    const result = await detachRequestLogs('licenseId', ['license-1'], 10);

    expect(result).toBe(10);
    expect(warn).toHaveBeenCalledWith(
      'Failed to analyze RequestLog after detaching',
      expect.objectContaining({ column: 'licenseId' }),
    );
    warn.mockRestore();
  });
});
