import { createParser } from 'nuqs';

/**
 * Custom date parser that treats the date string as a local date
 * instead of UTC, preventing timezone shifts that cause date display issues.
 *
 * This parser ensures that a date string like "2025-08-09" is always
 * interpreted as August 9th in the local timezone, not converted from UTC.
 */
export const parseAsLocalDate = createParser({
  parse(value: string): Date | null {
    if (!value) return null;

    // Parse the date string as YYYY-MM-DD and create a local date
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!match) return null;

    const [, year, month, day] = match;
    const date = new Date(
      parseInt(year, 10),
      parseInt(month, 10) - 1, // Month is 0-indexed
      parseInt(day, 10),
    );

    // Validate that the date is valid
    if (isNaN(date.getTime())) return null;

    return date;
  },

  serialize(value: Date): string {
    // Format as YYYY-MM-DD in local timezone
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  },
});
