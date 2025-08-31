import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger } from '@lukittu/shared';
import { randomUUID } from 'crypto';
import { getTranslations } from 'next-intl/server';
import { NextResponse } from 'next/server';

type DivisonData = {
  id: string;
  name: string;
  licenses: number;
};

export type IStatisticsProductDivisionGetSuccessResponse = {
  data: DivisonData[];
};

export type IStatisticsProductDivisionGetResponse =
  | ErrorResponse
  | IStatisticsProductDivisionGetSuccessResponse;

export async function GET(): Promise<
  NextResponse<IStatisticsProductDivisionGetResponse>
> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const selectedTeam = await getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
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
              products: {
                include: {
                  _count: {
                    select: {
                      licenses: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!session) {
      return NextResponse.json(
        { message: t('validation.unauthorized') },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    if (!session.user.teams.length) {
      return NextResponse.json(
        { message: t('validation.team_not_found') },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const products = session.user.teams[0].products;

    let data = products.map((product) => ({
      id: product.id,
      name: product.name,
      licenses: product._count.licenses,
    }));

    if (data.length > 5) {
      const firstFiveItems = data.slice(0, 5);
      const otherLicensesCount = data
        .slice(5)
        .reduce((acc, product) => acc + product.licenses, 0);

      firstFiveItems.push({
        id: randomUUID(),
        name: t('general.other'),
        licenses: otherLicensesCount,
      });

      data = firstFiveItems;
    }

    const response = NextResponse.json({ data });

    const cacheMaxAge = 300;
    response.headers.set(
      'Cache-Control',
      `private, max-age=${cacheMaxAge}, stale-while-revalidate=${cacheMaxAge * 2}`,
    );
    response.headers.set('Vary', 'Cookie');

    return response;
  } catch (error) {
    logger.error("Error occurred in 'dashboard/product-division' route", error);
    return NextResponse.json(
      { message: t('general.server_error') },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
