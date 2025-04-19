import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { generateUniqueLicense, logger } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

type ILicensesGenerateSuccessResponse = {
  licenseKey: string;
};

export type ILicensesGenerateResponse =
  | ErrorResponse
  | ILicensesGenerateSuccessResponse;

export async function GET(): Promise<NextResponse<ILicensesGenerateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
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
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const licenseKey = await generateUniqueLicense(selectedTeam);

    if (!licenseKey) {
      return NextResponse.json(
        {
          message: t('general.server_error'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    return NextResponse.json({ licenseKey });
  } catch (error) {
    logger.error("Error occurred in 'licenses/generate' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
