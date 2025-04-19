import LicenseDistributionEmailTemplate from '@/emails/LicenseDistributionTemplate';
import {
  Customer,
  License,
  Limits,
  logger,
  Product,
  Settings,
  Team,
} from '@lukittu/shared';
import { render } from '@react-email/components';
import { sendEmail } from '../nodemailer';

interface SendLicenseDistributionEmailProps {
  customer: Customer;
  licenseKey: string;
  license: Omit<License, 'licenseKeyLookup'> & { products: Product[] };
  team: Team & { settings?: Settings | null; limits: Limits | null };
}

export const sendLicenseDistributionEmail = async ({
  customer,
  licenseKey,
  license,
  team,
}: SendLicenseDistributionEmailProps) => {
  try {
    const html = await render(
      LicenseDistributionEmailTemplate({
        customerName: customer.fullName ?? customer.email!,
        licenseKey,
        businessLogoUrl: team.limits?.allowCustomEmails
          ? (team.settings?.emailImageUrl ?? undefined)
          : undefined,
        products: license.products.map((product) => product.name),
        teamName: team.name,
        businessMessage: team.limits?.allowCustomEmails
          ? (team.settings?.emailMessage ?? undefined)
          : undefined,
      }),
    );

    const text = await render(
      LicenseDistributionEmailTemplate({
        customerName: customer.fullName ?? customer.email!,
        licenseKey,
        businessLogoUrl: team.limits?.allowCustomEmails
          ? (team.settings?.emailImageUrl ?? undefined)
          : undefined,
        products: license.products.map((product) => product.name),
        teamName: team.name,
        businessMessage: team.limits?.allowCustomEmails
          ? (team.settings?.emailMessage ?? undefined)
          : undefined,
      }),
      {
        plainText: true,
      },
    );

    return await sendEmail({
      to: customer.email!,
      subject: `${team.name} | Your License Key`,
      fromName: `${team.name} (via Lukittu)`,
      html,
      text,
    });
  } catch (error) {
    logger.error('Error sending license distribution email', error);
    return false;
  }
};
