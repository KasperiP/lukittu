import { CloudflareVisitorData } from '@/lib/providers/cloudflare';
import {
  Blacklist,
  BlacklistType,
  License,
  LicenseExpirationType,
  prisma,
  RequestStatus,
  Team,
} from '@lukittu/shared';
import { iso2toIso3 } from '../../utils/country-helpers';

class SharedVerificationHandler {
  private async updateBlacklistHits(
    teamId: string,
    type: BlacklistType,
    value: string,
  ) {
    await prisma.blacklist.update({
      where: {
        teamId_type_value: {
          teamId,
          type,
          value,
        },
      },
      data: {
        hits: {
          increment: 1,
        },
      },
    });
  }

  public async checkBlacklist(
    team: Team & { blacklist: Blacklist[] },
    teamId: string,
    ipAddress: string | null,
    geoData: CloudflareVisitorData | null,
    hardwareIdentifier: string | undefined,
  ) {
    const blacklistedIps = team.blacklist.filter(
      (b) => b.type === BlacklistType.IP_ADDRESS,
    );
    const blacklistedIpList = blacklistedIps.map((b) => b.value);

    if (ipAddress && blacklistedIpList.includes(ipAddress)) {
      await this.updateBlacklistHits(
        teamId,
        BlacklistType.IP_ADDRESS,
        ipAddress,
      );
      return {
        status: RequestStatus.IP_BLACKLISTED,
        details: 'IP address is blacklisted',
      };
    }

    const blacklistedCountries = team.blacklist.filter(
      (b) => b.type === BlacklistType.COUNTRY,
    );
    const blacklistedCountryList = blacklistedCountries.map((b) => b.value);

    if (blacklistedCountryList.length > 0 && geoData?.alpha2) {
      const inIso3 = iso2toIso3(geoData.alpha2)!;
      if (blacklistedCountryList.includes(inIso3)) {
        await this.updateBlacklistHits(teamId, BlacklistType.COUNTRY, inIso3);
        return {
          status: RequestStatus.COUNTRY_BLACKLISTED,
          details: 'Country is blacklisted',
        };
      }
    }

    const blacklistedHardwareIdentifiers = team.blacklist.filter(
      (b) => b.type === BlacklistType.HARDWARE_IDENTIFIER,
    );
    const blacklistedHardwareIdentifierList =
      blacklistedHardwareIdentifiers.map((b) => b.value);

    if (
      hardwareIdentifier &&
      blacklistedHardwareIdentifierList.includes(hardwareIdentifier)
    ) {
      await this.updateBlacklistHits(
        teamId,
        BlacklistType.HARDWARE_IDENTIFIER,
        hardwareIdentifier,
      );
      return {
        status: RequestStatus.HARDWARE_IDENTIFIER_BLACKLISTED,
        details: 'Hardware identifier is blacklisted',
      };
    }

    return null;
  }

  public async checkLicenseExpiration(
    license: Omit<License, 'licenseKeyLookup'>,
    licenseKeyLookup: string,
  ) {
    if (license.expirationType === LicenseExpirationType.DATE) {
      const expirationDate = new Date(license.expirationDate!);
      const currentDate = new Date();

      if (currentDate.getTime() > expirationDate.getTime()) {
        return {
          success: false,
          expiredAt: expirationDate,
        };
      }
    }

    if (license.expirationType === LicenseExpirationType.DURATION) {
      const hasStartedExpiring = Boolean(license.expirationDate);

      if (!hasStartedExpiring) {
        const expirationDays = license.expirationDays!;
        const expirationDate = new Date(
          new Date().getTime() + expirationDays * 24 * 60 * 60 * 1000,
        );

        await prisma.license.update({
          where: {
            teamId_licenseKeyLookup: {
              teamId: license.teamId,
              licenseKeyLookup,
            },
          },
          data: {
            expirationDate,
          },
        });

        return {
          success: true,
          expirationDate,
        };
      } else {
        const expirationDate = new Date(license.expirationDate!);
        const currentDate = new Date();

        if (currentDate.getTime() > expirationDate.getTime()) {
          return {
            success: false,
            expiredAt: expirationDate,
          };
        }
      }
    }

    return {
      success: true,
    };
  }
}

export const sharedVerificationHandler = new SharedVerificationHandler();
