import prisma from '@/lib/database/prisma';
import { BlacklistType, License, RequestStatus } from '@lukittu/prisma';
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
    team: any,
    teamId: string,
    ipAddress: string | null,
    geoData: any,
    deviceIdentifier: string | undefined,
  ) {
    const blacklistedIps = team.blacklist.filter(
      (b: any) => b.type === BlacklistType.IP_ADDRESS,
    );
    const blacklistedIpList = blacklistedIps.map((b: any) => b.value);

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
      (b: any) => b.type === BlacklistType.COUNTRY,
    );
    const blacklistedCountryList = blacklistedCountries.map(
      (b: any) => b.value,
    );

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

    const blacklistedDeviceIdentifiers = team.blacklist.filter(
      (b: any) => b.type === BlacklistType.DEVICE_IDENTIFIER,
    );
    const blacklistedDeviceIdentifierList = blacklistedDeviceIdentifiers.map(
      (b: any) => b.value,
    );

    if (
      deviceIdentifier &&
      blacklistedDeviceIdentifierList.includes(deviceIdentifier)
    ) {
      await this.updateBlacklistHits(
        teamId,
        BlacklistType.DEVICE_IDENTIFIER,
        deviceIdentifier,
      );
      return {
        status: RequestStatus.DEVICE_IDENTIFIER_BLACKLISTED,
        details: 'Device identifier is blacklisted',
      };
    }

    return null;
  }

  public async checkLicenseExpiration(
    license: Omit<License, 'licenseKeyLookup'>,
    licenseKeyLookup: string,
  ) {
    if (license.expirationType === 'DATE') {
      const expirationDate = new Date(license.expirationDate!);
      const currentDate = new Date();

      if (currentDate.getTime() > expirationDate.getTime()) {
        return {
          status: RequestStatus.LICENSE_EXPIRED,
          details: 'License expired',
        };
      }
    }

    if (license.expirationType === 'DURATION') {
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
      } else {
        const expirationDate = new Date(license.expirationDate!);
        const currentDate = new Date();

        if (currentDate.getTime() > expirationDate.getTime()) {
          return {
            status: RequestStatus.LICENSE_EXPIRED,
            details: 'License expired',
          };
        }
      }
    }

    return null;
  }

  public async checkSeats(
    license: any,
    deviceIdentifier: string | undefined,
    deviceTimeout: number,
  ) {
    if (license.seats) {
      const activeSeats = license.devices.filter(
        (device: any) =>
          new Date(device.lastBeatAt).getTime() >
          new Date(Date.now() - deviceTimeout * 60 * 1000).getTime(),
      );

      const seatsIncludesClient = activeSeats.some(
        (seat: any) => seat.deviceIdentifier === deviceIdentifier,
      );

      if (!seatsIncludesClient && activeSeats.length >= license.seats) {
        return {
          status: RequestStatus.MAXIMUM_CONCURRENT_SEATS,
          details: 'License seat limit reached',
        };
      }
    }

    return null;
  }
}

export const sharedVerificationHandler = new SharedVerificationHandler();
