import { Prisma } from '../client';
import { LicenseStatus } from './get-license-status';

export const getLicenseStatusFilter = (
  status: LicenseStatus | null | 'ALL',
): Prisma.LicenseWhereInput => {
  // Status filtering
  const currentDate = new Date();
  const thirtyDaysAgo = new Date(
    currentDate.getTime() - 30 * 24 * 60 * 60 * 1000,
  );

  let statusFilter: Prisma.LicenseWhereInput = {};

  switch (status) {
    case LicenseStatus.ACTIVE:
      statusFilter = {
        suspended: false,
        lastActiveAt: {
          gt: thirtyDaysAgo,
        },
        OR: [
          { expirationType: 'NEVER' },
          {
            AND: [
              {
                expirationType: {
                  in: ['DATE', 'DURATION'],
                },
              },

              // Not expired
              {
                expirationDate: {
                  gt: currentDate,
                },
              },

              // Not expiring (more than 30 days left)
              {
                expirationDate: {
                  gt: new Date(
                    currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                  ),
                },
              },
            ],
          },
        ],
      };
      break;
    case LicenseStatus.INACTIVE:
      statusFilter = {
        suspended: false,
        lastActiveAt: {
          lte: thirtyDaysAgo,
        },
        OR: [
          { expirationType: 'NEVER' },
          {
            AND: [
              { expirationType: { in: ['DATE', 'DURATION'] } },

              // Must not be expired
              {
                expirationDate: {
                  gt: new Date(currentDate.getTime()),
                },
              },

              // Must not be expiring
              {
                expirationDate: {
                  gt: new Date(
                    currentDate.getTime() + 30 * 24 * 60 * 60 * 1000,
                  ),
                },
              },
            ],
          },
        ],
      };
      break;
    case LicenseStatus.EXPIRING:
      statusFilter = {
        suspended: false,
        expirationType: {
          in: ['DATE', 'DURATION'],
        },
        expirationDate: {
          gt: currentDate,
          lt: new Date(currentDate.getTime() + 30 * 24 * 60 * 60 * 1000),
        },
      };
      break;
    case LicenseStatus.EXPIRED:
      statusFilter = {
        suspended: false,
        expirationType: {
          in: ['DATE', 'DURATION'],
        },
        expirationDate: {
          lt: currentDate,
        },
      };
      break;
    case LicenseStatus.UPCOMING:
      statusFilter = {
        suspended: false,
        expirationType: 'DURATION',
        expirationStart: 'ACTIVATION',
        expirationDate: {
          equals: null,
        },
      };
      break;
    case LicenseStatus.SUSPENDED:
      statusFilter = {
        suspended: true,
      };
      break;
  }

  return statusFilter;
};
