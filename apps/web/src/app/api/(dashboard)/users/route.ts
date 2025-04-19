import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import {
  UpdateProfileSchema,
  updateProfileSchema,
} from '@/lib/validation/profile/update-profile-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger, prisma } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IUsersUpdateSuccessResponse = {
  success: boolean;
};

export type IUsersUpdateResponse = ErrorResponse | IUsersUpdateSuccessResponse;

export async function PATCH(
  request: NextRequest,
): Promise<NextResponse<IUsersUpdateResponse>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as UpdateProfileSchema;
    const validated = await updateProfileSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const session = await getSession({ user: true });

    if (!session) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        fullName: body.fullName,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Error occurred in 'users' route:", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
