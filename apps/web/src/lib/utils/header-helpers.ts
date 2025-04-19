import { regex } from '@lukittu/shared';
import { cookies, headers } from 'next/headers';
import 'server-only';

/**
 * Get the IP address from the headers
 */
export const getIp = async () => {
  const headersList = await headers();
  const forwardedFor = headersList.get('x-forwarded-for');
  const realIp = headersList.get('x-real-ip');

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  if (realIp) return realIp.trim();

  return null;
};

/**
 * Get origin from the headers
 */
export const getOrigin = async () => {
  const headersList = await headers();
  return headersList.get('origin');
};

/**
 * Get the user agent from the headers
 */
export const getUserAgent = async () => {
  const headersList = await headers();
  return headersList.get('user-agent');
};

/**
 * Get the language from the cookie or the accept-language header
 */
export const getLanguage = async () => {
  const headersList = await cookies();
  const langCookie = headersList.get('lang')?.value;
  const acceptedLang = headersList.get('accept-language');

  const allowedLangs = ['en', 'fi', 'es'];

  let lang = 'en';

  if (acceptedLang && allowedLangs.includes(acceptedLang.value)) {
    lang = acceptedLang.value;
  }

  if (langCookie && allowedLangs.includes(langCookie)) {
    lang = langCookie;
  }

  return lang;
};

export const getSelectedTeam = async () => {
  const cookieStore = await cookies();
  const selectedTeamCookie = cookieStore.get('selectedTeam')?.value;

  if (!selectedTeamCookie) return null;

  if (!regex.uuidV4.test(selectedTeamCookie)) return null;

  return selectedTeamCookie;
};
