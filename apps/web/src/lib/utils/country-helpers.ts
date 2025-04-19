import { countries } from '../constants/countries';

export const iso2toIso3 = (iso2: string | null): string | null =>
  countries.find(
    (country) => country.alpha_2_code.toLowerCase() === iso2?.toLowerCase(),
  )?.alpha_3_code || null;

export const iso3toIso2 = (iso3: string | null): string | null =>
  countries.find(
    (country) => country.alpha_3_code.toLowerCase() === iso3?.toLowerCase(),
  )?.alpha_2_code || null;

export const iso3ToName = (iso3: string | null): string | null =>
  countries.find(
    (country) => country.alpha_3_code.toLowerCase() === iso3?.toLowerCase(),
  )?.en_short_name || null;

export const iso2ToName = (iso2: string | null): string | null =>
  countries.find(
    (country) => country.alpha_2_code.toLowerCase() === iso2?.toLowerCase(),
  )?.en_short_name || null;
