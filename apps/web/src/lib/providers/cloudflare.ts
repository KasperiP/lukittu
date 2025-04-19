import { logger } from '@lukittu/shared';
import { headers } from 'next/headers';
import 'server-only';
import { iso2toIso3 } from '../utils/country-helpers';

export const verifyTurnstileToken = async (token: string): Promise<boolean> => {
  try {
    const res = await fetch(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        method: 'POST',
        body: `secret=${encodeURIComponent(process.env.TURNSTILE_SECRET!)}&response=${encodeURIComponent(token)}`,
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const data = await res.json();

    return data.success;
  } catch (error) {
    logger.error('Error verifying Turnstile token', error);
    return false;
  }
};

export interface CloudflareVisitorData {
  alpha2: string;
  alpha3: string;
  long: number;
  lat: number;
}

export const getCloudflareVisitorData =
  async (): Promise<CloudflareVisitorData | null> => {
    const headersList = await headers();

    const alpha2 = headersList.get('cf-ipcountry');
    const long = headersList.get('cf-iplongitude');
    const lat = headersList.get('cf-iplatitude');

    if (!alpha2 || !long || !lat) {
      return null;
    }

    return {
      alpha2,
      alpha3: iso2toIso3(alpha2)!,
      long: parseFloat(long),
      lat: parseFloat(lat),
    };
  };
