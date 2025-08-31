import { HttpStatus } from '@/types/http-status';
import { logger, prisma } from '@lukittu/shared';
import crypto from 'crypto';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

interface CleanupStats {
  teamId: string;
  customersDeleted: number;
  licensesDeleted: number;
  requestLogsDeleted: number;
  auditLogsDeleted: number;
  duration: number;
}

interface CleanupSummary {
  totalTeamsProcessed: number;
  totalCustomersDeleted: number;
  totalLicensesDeleted: number;
  totalRequestLogsDeleted: number;
  totalAuditLogsDeleted: number;
  totalDuration: number;
  errors: Array<{ teamId: string; error: string }>;
}

export async function POST() {
  const startTime = Date.now();
  const cleanupId = crypto.randomUUID();

  logger.info('Starting data cleanup operation', {
    cleanupId,
    startTime: new Date().toISOString(),
  });

  const headersList = await headers();
  const authorizationHeader = headersList.get('authorization');
  const internalApiKey = process.env.INTERNAL_API_KEY;

  const isAuthorized =
    internalApiKey &&
    authorizationHeader &&
    crypto.timingSafeEqual(
      Buffer.from(authorizationHeader),
      Buffer.from(internalApiKey),
    );

  if (!isAuthorized) {
    return NextResponse.json(
      { message: 'Unauthorized' },
      { status: HttpStatus.UNAUTHORIZED },
    );
  }

  const summary: CleanupSummary = {
    totalTeamsProcessed: 0,
    totalCustomersDeleted: 0,
    totalLicensesDeleted: 0,
    totalRequestLogsDeleted: 0,
    totalAuditLogsDeleted: 0,
    totalDuration: 0,
    errors: [],
  };

  try {
    const teams = await prisma.team.findMany({
      select: {
        id: true,
        name: true,
        settings: {
          select: {
            danglingCustomerCleanupDays: true,
            expiredLicenseCleanupDays: true,
          },
        },
      },
    });

    logger.info('Retrieved teams for cleanup', {
      cleanupId,
      teamsFound: teams.length,
    });

    for (const team of teams) {
      const teamStartTime = Date.now();
      const { id: teamId, name: teamName, settings } = team;

      // Skip teams without settings or cleanup configurations
      if (!settings) {
        logger.info('Skipping team without settings', {
          cleanupId,
          teamId,
          teamName,
        });
        continue;
      }

      const hasCleanupConfig =
        settings.danglingCustomerCleanupDays ||
        settings.expiredLicenseCleanupDays;

      if (!hasCleanupConfig) {
        logger.info('Skipping team without cleanup configuration', {
          cleanupId,
          teamId,
          teamName,
          settings,
        });
        summary.totalTeamsProcessed += 1;
        continue;
      }

      logger.info('Starting cleanup for team', {
        cleanupId,
        teamId,
        teamName,
        settings,
      });

      const teamStats: CleanupStats = {
        teamId,
        customersDeleted: 0,
        licensesDeleted: 0,
        requestLogsDeleted: 0,
        auditLogsDeleted: 0,
        duration: 0,
      };

      try {
        await prisma.$transaction(async (tx) => {
          if (settings?.danglingCustomerCleanupDays) {
            const cutoffDate = new Date();
            cutoffDate.setDate(
              cutoffDate.getDate() - settings.danglingCustomerCleanupDays,
            );

            logger.info('Cleaning up dangling customers', {
              cleanupId,
              teamId,
              cutoffDate: cutoffDate.toISOString(),
              danglingCustomerCleanupDays: settings.danglingCustomerCleanupDays,
            });

            const customerResult = await tx.customer.deleteMany({
              where: {
                teamId,
                updatedAt: {
                  lt: cutoffDate,
                },
                licenses: {
                  none: {},
                },
              },
            });

            teamStats.customersDeleted = customerResult.count;
            logger.info('Deleted dangling customers', {
              cleanupId,
              teamId,
              customersDeleted: customerResult.count,
            });
          }

          if (settings?.expiredLicenseCleanupDays) {
            const cutoffDate = new Date();
            cutoffDate.setDate(
              cutoffDate.getDate() - settings.expiredLicenseCleanupDays,
            );

            logger.info('Cleaning up expired licenses', {
              cleanupId,
              teamId,
              cutoffDate: cutoffDate.toISOString(),
              expiredLicenseCleanupDays: settings.expiredLicenseCleanupDays,
            });

            const licenseResult = await tx.license.deleteMany({
              where: {
                teamId,
                expirationDate: {
                  lt: cutoffDate,
                },
              },
            });

            teamStats.licensesDeleted = licenseResult.count;
            logger.info('Deleted expired licenses', {
              cleanupId,
              teamId,
              licensesDeleted: licenseResult.count,
            });
          }

          // Use a default of 90 days for log cleanup - this could be made configurable in Settings model
          const logCleanupDays = 90;
          const logCutoffDate = new Date();
          logCutoffDate.setDate(logCutoffDate.getDate() - logCleanupDays);

          logger.info('Cleaning up old logs', {
            cleanupId,
            teamId,
            logCutoffDate: logCutoffDate.toISOString(),
            logCleanupDays,
          });

          const requestLogResult = await tx.requestLog.deleteMany({
            where: {
              teamId,
              createdAt: {
                lt: logCutoffDate,
              },
            },
          });

          const auditLogResult = await tx.auditLog.deleteMany({
            where: {
              teamId,
              createdAt: {
                lt: logCutoffDate,
              },
            },
          });

          teamStats.requestLogsDeleted = requestLogResult.count;
          teamStats.auditLogsDeleted = auditLogResult.count;

          logger.info('Deleted old logs', {
            cleanupId,
            teamId,
            requestLogsDeleted: requestLogResult.count,
            auditLogsDeleted: auditLogResult.count,
          });
        });

        teamStats.duration = Date.now() - teamStartTime;

        logger.info('Completed cleanup for team', {
          cleanupId,
          teamId,
          teamName,
          customersDeleted: teamStats.customersDeleted,
          licensesDeleted: teamStats.licensesDeleted,
          requestLogsDeleted: teamStats.requestLogsDeleted,
          auditLogsDeleted: teamStats.auditLogsDeleted,
          duration: teamStats.duration,
        });

        // Update summary
        summary.totalCustomersDeleted += teamStats.customersDeleted;
        summary.totalLicensesDeleted += teamStats.licensesDeleted;
        summary.totalRequestLogsDeleted += teamStats.requestLogsDeleted;
        summary.totalAuditLogsDeleted += teamStats.auditLogsDeleted;
        summary.totalTeamsProcessed += 1;
      } catch (teamError) {
        const errorMessage =
          teamError instanceof Error ? teamError.message : String(teamError);
        logger.error('Failed to cleanup team data', {
          cleanupId,
          teamId,
          teamName,
          error: errorMessage,
          stack: teamError instanceof Error ? teamError.stack : undefined,
          duration: Date.now() - teamStartTime,
        });

        summary.errors.push({
          teamId,
          error: errorMessage,
        });
      }
    }

    summary.totalDuration = Date.now() - startTime;

    logger.info('Data cleanup operation completed', {
      cleanupId,
      ...summary,
      endTime: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      cleanupId,
      summary,
    });
  } catch (error) {
    summary.totalDuration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    logger.error('Critical failure in data cleanup operation', {
      cleanupId,
      error: errorMessage,
      stack: error instanceof Error ? error.stack : undefined,
      partialSummary: summary,
      endTime: new Date().toISOString(),
    });

    return NextResponse.json(
      {
        success: false,
        cleanupId,
        message: 'Internal server error',
        partialSummary: summary,
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
