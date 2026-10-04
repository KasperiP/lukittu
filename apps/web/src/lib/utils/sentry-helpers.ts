import type { ErrorEvent } from '@sentry/nextjs';

/**
 * Script URLs that do not belong to the application bundle. Errors thrown
 * exclusively from these sources come from browser extensions or other
 * injected scripts (e.g. `app:///executors/200.js`) and are not actionable.
 */
export const THIRD_PARTY_SCRIPT_URL_PATTERNS: RegExp[] = [
  /app:\/\/\/executors\//i,
  /^chrome-extension:\/\//i,
  /^moz-extension:\/\//i,
  /^safari-(web-)?extension:\/\//i,
];

const isThirdPartyScriptUrl = (filename: string): boolean =>
  THIRD_PARTY_SCRIPT_URL_PATTERNS.some((pattern) => pattern.test(filename));

/**
 * Returns true when every stack frame of every exception in the event
 * originates from a known third-party/injected script.
 */
export const isThirdPartyScriptError = (event: ErrorEvent): boolean => {
  const exceptions = event.exception?.values ?? [];
  const frames = exceptions.flatMap(
    (exception) => exception.stacktrace?.frames ?? [],
  );
  const filenames = frames
    .map((frame) => frame.filename ?? frame.abs_path)
    .filter((filename): filename is string => Boolean(filename));

  if (filenames.length === 0) return false;

  return filenames.every(isThirdPartyScriptUrl);
};
