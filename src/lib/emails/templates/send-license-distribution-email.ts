import LicenseDistributionEmailTemplate from '@/emails/LicenseDistributionTemplate';
import { Customer, License, Product, Settings, Team } from '@prisma/client';
import { render } from '@react-email/components';
import { logger } from '../../logging/logger';
import { sendEmail } from '../nodemailer';

interface SendLicenseDistributionEmailProps {
  customer: Customer;
  licenseKey: string;
  license: License & { products: Product[] };
  team: Team & { settings?: Settings | null };
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
        businessLogoUrl: team.settings?.emailImageUrl ?? undefined,
        products: license.products.map((product) => product.name),
        teamName: team.name,
        businessMessage: team.settings?.emailMessage ?? undefined,
      }),
    );

    const text = await render(
      LicenseDistributionEmailTemplate({
        customerName: customer.fullName ?? customer.email!,
        licenseKey,
        businessLogoUrl: team.settings?.emailImageUrl ?? undefined,
        products: license.products.map((product) => product.name),
        teamName: team.name,
        businessMessage: team.settings?.emailMessage ?? undefined,
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
