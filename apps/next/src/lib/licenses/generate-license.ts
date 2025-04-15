import 'server-only';
import prisma from '../database/prisma';
import { generateHMAC } from '../security/crypto';

const generateRandomString = (length: number): string => {
  const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';

  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * characters.length);
    result += characters[randomIndex];
  }

  return result;
};

const formatLicenseKey = (key: string): string =>
  key.match(/.{1,5}/g)!.join('-');

const generateLicenseKey = (): string => {
  const rawKey = generateRandomString(25);
  return formatLicenseKey(rawKey);
};

export const generateUniqueLicense = async (
  selectedTeamId: string,
): Promise<string | null> => {
  const MAX_ATTEMPTS = 5;
  let attempts = 0;

  while (attempts < MAX_ATTEMPTS) {
    const licenseKey = generateLicenseKey();
    const hmac = generateHMAC(`${licenseKey}:${selectedTeamId}`);

    const license = await prisma.license.findUnique({
      where: {
        teamId_licenseKeyLookup: {
          teamId: selectedTeamId,
          licenseKeyLookup: hmac,
        },
      },
    });

    if (!license) {
      return licenseKey;
    }

    attempts++;
  }

  return null;
};
