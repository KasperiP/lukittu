import prisma from '@/lib/database/prisma';
import { getGravatarUrl } from '@/lib/providers/gravatar';
import { getSession } from '@/lib/utils/auth';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { logger } from '@/lib/utils/logger';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { Prisma, User } from '@prisma/client';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IRegularUser = Omit<User, 'passwordHash'> & {
  avatarUrl: string | null;
  isOwner: boolean;
  lastLoginAt: Date | null;
};

type IInvitationUser = {
  id: string;
  email: string;
  createdAt: Date;
  isInvitation: true;
};

export type ITeamsMembersGetSuccessResponse = {
  members: (IRegularUser | IInvitationUser)[];
  totalResults: number;
};

export type ITeamsMembersGetResponse =
  | ErrorResponse
  | ITeamsMembersGetSuccessResponse;

export async function GET(
  request: NextRequest,
): Promise<NextResponse<ITeamsMembersGetResponse>> {
  const t = await getTranslations({ locale: getLanguage() });

  try {
    const searchParams = request.nextUrl.searchParams;
    const selectedTeam = getSelectedTeam();

    if (!selectedTeam) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const allowedPageSizes = [10, 25, 50, 100];
    const allowedSortDirections = ['asc', 'desc'];
    const allowedSortColumns = ['createdAt'];

    const search = (searchParams.get('search') as string) || '';

    let page = parseInt(searchParams.get('page') as string) || 1;
    let pageSize = parseInt(searchParams.get('pageSize') as string) || 10;
    let sortColumn = searchParams.get('sortColumn') as string;
    let sortDirection = searchParams.get('sortDirection') as 'asc' | 'desc';

    if (!allowedSortDirections.includes(sortDirection)) {
      sortDirection = 'desc';
    }

    if (!sortColumn || !allowedSortColumns.includes(sortColumn)) {
      sortColumn = 'createdAt';
    }

    if (!allowedPageSizes.includes(pageSize)) {
      pageSize = 25;
    }

    if (page < 1) {
      page = 1;
    }

    const whereWithoutTeamCheck = {
      OR: search
        ? [
            {
              email: {
                contains: search,
                mode: 'insensitive',
              },
            },
            {
              fullName: {
                contains: search,
                mode: 'insensitive',
              },
            },
          ]
        : undefined,
    } as Prisma.UserWhereInput;

    const session = await getSession({
      user: {
        include: {
          teams: {
            where: {
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
              users: {
                where: whereWithoutTeamCheck,
                include: {
                  sessions: {
                    orderBy: {
                      createdAt: 'desc',
                    },
                    take: 1,
                    select: {
                      createdAt: true,
                    },
                  },
                },
              },
              invitations: {
                where: {
                  accepted: false,
                  createdAt: {
                    gte: new Date(new Date().getTime() - 24 * 60 * 60 * 1000), // 24 hours
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

    const combinedResults = [
      ...(team.users.map((user) => ({
        ...user,
        avatarUrl: getGravatarUrl(user.email),
        isOwner: user.id === session.user.teams[0].ownerId,
        lastLoginAt: user.sessions[0]?.createdAt || null,
      })) as IRegularUser[]),
      ...(team.invitations.map((invitation) => ({
        id: invitation.id,
        email: invitation.email,
        createdAt: invitation.createdAt,
        isInvitation: true,
      })) as IInvitationUser[]),
    ];

    const sortedResults = combinedResults.sort((a, b) => {
      if (sortColumn === 'createdAt') {
        return sortDirection === 'asc'
          ? a.createdAt.getTime() - b.createdAt.getTime()
          : b.createdAt.getTime() - a.createdAt.getTime();
      }

      return 0;
    });

    const paginatedResults = sortedResults.slice(
      (page - 1) * pageSize,
      page * pageSize,
    );

    const totalResults = await prisma.user.count({
      where: {
        ...whereWithoutTeamCheck,
        teams: {
          some: {
            id: selectedTeam,
            deletedAt: null,
          },
        },
      },
    });

    return NextResponse.json({
      members: paginatedResults,
      totalResults,
    });
  } catch (error) {
    logger.error("Error occurred in 'teams/members' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
