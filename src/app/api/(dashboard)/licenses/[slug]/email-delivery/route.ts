import { regex } from '@/lib/constants/regex';
import { sendLicenseDistributionEmail } from '@/lib/emails/templates/send-license-distribution-email';
import { logger } from '@/lib/logging/logger';
import { decryptLicenseKey } from '@/lib/security/crypto';
import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type ILicenseEmailDeliveryRequest = {
  customerIds: string[] | null;
};

export type ILicenseEmailDeliverySuccessResponse = {
  success: boolean;
};

export type ILicenseEmailDeliveryResponse =
  | ILicenseEmailDeliverySuccessResponse
  | ErrorResponse;

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ILicenseEmailDeliveryResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const licenseId = params.slug;
    const body = (await request.json()) as ILicenseEmailDeliveryRequest;

    if (!body.customerIds?.length) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const customerIds = body.customerIds;

    if (customerIds.some((id) => !regex.uuidV4.test(id))) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (!licenseId || !regex.uuidV4.test(licenseId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              id: selectedTeam,
              deletedAt: null,
            },
            include: {
              settings: true,
              licenses: {
                where: {
                  id: licenseId,
                },
                include: {
                  customers: true,
                  products: true,
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];

    if (!team.licenses.length) {
      return NextResponse.json(
        {
          message: t('validation.license_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const license = team.licenses[0];

    const customerEmails = license.customers
      .filter((customer) => customerIds.includes(customer.id))
      .map((customer) => customer.email)
      .filter(Boolean) as string[];

    if (customerEmails.length === 0) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const licenseKey = decryptLicenseKey(license.licenseKey);

    const emails = license.customers
      .filter((customer) => customer.email)
      .map(
        async (customer) =>
          await sendLicenseDistributionEmail({
            customer,
            licenseKey,
            license,
            team,
          }),
      );

    await Promise.all(emails);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error(
      "Error occurred in 'licenses/[slug]/email-delivery' route",
      error,
    );
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
