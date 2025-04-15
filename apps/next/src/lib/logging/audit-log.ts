import { AuditLogAction, AuditLogTargetType } from '@lukittu/prisma';
import 'server-only';
import prisma from '../database/prisma';
import { getCloudflareVisitorData } from '../providers/cloudflare';
import { iso2toIso3 } from '../utils/country-helpers';
import { getIp, getUserAgent } from '../utils/header-helpers';
import { logger } from './logger';

interface BaseAuditLogProps {
  teamId: string;
  action: AuditLogAction;
  targetId: string;
  targetType: AuditLogTargetType;
  requestBody?: any;
  responseBody?: any;
}

interface SystemAuditLogProps extends BaseAuditLogProps {
  system: true;
  userId?: never;
}

interface UserAuditLogProps extends BaseAuditLogProps {
  userId: string;
  system?: never;
}

type CreateAuditLogProps = SystemAuditLogProps | UserAuditLogProps;

export const createAuditLog = async ({
  userId,
  system,
  teamId,
  action,
  targetId,
  targetType,
  requestBody,
  responseBody,
}: CreateAuditLogProps) => {
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  if (userId && system) {
    throw new Error('Cannot specify both userId and system');
  }
  if (!userId && !system) {
    throw new Error('Must specify either userId or system');
  }

  const ipAddress = await getIp();
  const userAgent = await getUserAgent();
  const geoData = await getCloudflareVisitorData();
  const longitude = geoData?.long || null;
  const latitude = geoData?.lat || null;
  const hasBothLongitudeAndLatitude = longitude && latitude;
  const countryAlpha3: string | null = geoData?.alpha2
    ? iso2toIso3(geoData.alpha2!)
    : null;

  try {
    await prisma.auditLog.create({
      data: {
        version: process.env.version!,
        teamId,
        ipAddress,
        latitude: hasBothLongitudeAndLatitude ? latitude : null,
        longitude: hasBothLongitudeAndLatitude ? longitude : null,
        userAgent,
        action,
        targetId,
        targetType,
        requestBody,
        responseBody,
        userId: userId || null,
        system: system || false,
        country: countryAlpha3,
      },
    });
  } catch (error: any) {
    logger.error('Failed to create audit log', error);
  }
};
