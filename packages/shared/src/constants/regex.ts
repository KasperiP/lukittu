/**
 * A collection of commonly used regular expressions for validation.
 */
export const regex = {
  /**
   * Matches a valid UUID v4 string.
   * - Example: `550e8400-e29b-41d4-a716-446655440000`
   */
  uuidV4:
    /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/,

  /**
   * Matches a license key in the format `XXXXX-XXXXX-XXXXX-XXXXX-XXXXX`
   * where each `X` is an uppercase letter or digit.
   */
  licenseKey: /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/,

  /**
   * Matches a valid email address with the following rules:
   * - Cannot start with a dot.
   * - Cannot contain consecutive dots.
   * - Local part allows lowercase letters, digits, underscores, plus, single quotes, hyphens, and dots.
   * - Domain must contain at least one dot and end with a valid TLD of 2+ letters.
   * @see https://colinhacks.com/essays/reasonable-email-regex
   */
  email:
    /^(?!\.)(?!.*\.\.)([a-z0-9_'+\-.]*)[a-z0-9_'+-]@([a-z0-9][a-z0-9-]*\.)+[a-z]{2,}$/i,

  /**
   * Matches a general name:
   * - Letters, digits, spaces, hyphens, and underscores.
   * - Length between 3 and 255 characters.
   */
  generalName: /^[a-zA-Z0-9\s\-_]{3,255}$/,

  /**
   * Matches a BuiltByBit API secret key:
   * - Must start with `bbb_`.
   * - Followed by exactly 64 alphanumeric characters.
   */
  builtByBitApiSecret: /^bbb_[A-Za-z0-9]{64}$/,

  /**
   * Matches a positive integer (no sign, no decimal).
   * - Example: `42`
   */
  integer: /^\d+$/,

  /**
   * Matches a floating-point number:
   * - Digits, optionally followed by a decimal part.
   * - Example: `3.14`, `42`
   */
  float: /^\d+(\.\d+)?$/,

  /**
   * Matches a valid IPv4 address:
   * - Four octets separated by dots.
   * - Each octet is 0–255.
   * - Example: `192.168.0.1`
   */
  ipv4: /^((25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)\.){3}(25[0-5]|2[0-4]\d|1\d{2}|[1-9]?\d)$/,

  /**
   * Matches a string with no whitespace characters.
   * - Example: `NoSpacesAllowed`
   */
  noSpaces: /^[^\s]+$/,

  /**
   * Matches a Stripe API key:
   * - Must start with `sk_` (secret key) or `rk_` (restricted key).
   */
  stripeApiKey: /^(sk_|rk_)/,

  /**
   * Matches a Stripe webhook secret:
   * - Must start with `whsec_`.
   */
  stripeWebhookSecret: /^whsec_/,

  /**
   * Matches if the string contains at least one uppercase letter (A–Z).
   * - Example: `Password1`
   */
  passwordUppercase: /[A-Z]/,

  /**
   * Matches if the string contains at least one lowercase letter (a–z).
   * - Example: `password1`
   */
  passwordLowercase: /[a-z]/,

  /**
   * Matches if the string contains at least one digit (0–9).
   * - Example: `abc123`
   */
  passwordNumber: /\d/,

  /**
   * Matches if the string contains at least one special character
   * from the common set: `!@#$%^&*(),.?":{}|<>`
   * - Example: `Hello@123`
   */
  passwordSpecial: /[!@#$%^&*(),.?":{}|<>]/,

  /**
   * Matches a Markdown-style link in the format:
   * `[link text](https://example.com)`
   * - Group 1 → link text
   * - Group 2 → URL
   * - Example: `[Google](https://google.com)`
   */
  markdownLink: /\[([^\]]+)\]\(([^)]+)\)/g,

  /** Matches a Discord ID:
   * - A string of 17 to 24 digits.
   * - Example: `12345678901234567`
   */
  discordId: /^\d{17,24}$/,
};
