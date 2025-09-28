import {
  AuditLogAction,
  AuditLogSource,
  AuditLogTargetType,
  logger,
  Prisma,
  prisma,
} from '@lukittu/shared';
import 'server-only';
import { getCloudflareVisitorData } from '../providers/cloudflare';
import { iso2toIso3 } from '../utils/country-helpers';
import { getIp, getUserAgent } from '../utils/header-helpers';

interface BaseAuditLogProps {
  teamId: string;
  action: AuditLogAction;
  targetId: string;
  targetType: AuditLogTargetType;
  requestBody?: any;
  responseBody?: any;
  tx?: Prisma.TransactionClient;
}

type SystemAuditLogProps = BaseAuditLogProps & {
  source: Exclude<AuditLogSource, 'DASHBOARD'>;
};

type UserAuditLogProps = BaseAuditLogProps & {
  source: 'DASHBOARD';
  userId: string;
};

type CreateAuditLogProps = SystemAuditLogProps | UserAuditLogProps;

export const createAuditLog = async ({
  teamId,
  action,
  targetId,
  targetType,
  source,
  requestBody,
  responseBody,
  tx,
  ...rest
}: CreateAuditLogProps) => {
  const prismaClient = tx || prisma;

  const userId =
    source === 'DASHBOARD' ? (rest as UserAuditLogProps).userId : undefined;

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
    await prismaClient.auditLog.create({
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
        source: source || AuditLogSource.DASHBOARD,
        country: countryAlpha3,
      },
    });
  } catch (error: any) {
    logger.error('Failed to create audit log', error);
  }
};
