import { regex } from '@/lib/constants/regex';
import prisma from '@/lib/database/prisma';
import { createAuditLog } from '@/lib/logging/audit-log';
import { logger } from '@/lib/logging/logger';
import { getSession } from '@/lib/security/session';
import { getLanguage } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { AuditLogAction, AuditLogTargetType } from '@lukittu/prisma';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';

type ITeamsTransferOwnershipRequest = {
  newOwnerId: string;
};

type ITeamsTransferOwnershipSuccessResponse = {
  success: boolean;
};

export type ITeamsTransferOwnershipResponse =
  | ErrorResponse
  | ITeamsTransferOwnershipSuccessResponse;

export async function POST(
  request: NextRequest,
  props: { params: Promise<{ slug: string }> },
): Promise<NextResponse<ITeamsTransferOwnershipResponse>> {
  const params = await props.params;
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as ITeamsTransferOwnershipRequest;
    const teamId = params.slug;

    if (!teamId || !regex.uuidV4.test(teamId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const newOwnerId = body.newOwnerId;

    if (!newOwnerId || !regex.uuidV4.test(newOwnerId)) {
      return NextResponse.json(
        {
          message: t('validation.bad_request'),
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
              id: teamId,
            },
            include: {
              users: true,
              subscription: true,
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

    const team = session.user.teams.find((t) => t.id === teamId);

    if (!team) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    if (team.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const newOwner = team.users.find((u) => u.id === newOwnerId);
    if (!newOwner) {
      return NextResponse.json(
        {
          message: t('validation.user_not_in_team'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    // If the team has a subscription, we need to detach all payment methods from the old owner
    // and update the customer email to the new owner's email. This is to ensure that the new owner
    // can manage the subscription. We also need to remove the default payment method from the customer.
    if (team.subscription) {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
        apiVersion: '2025-02-24.acacia',
      });

      const subscription = await stripe.subscriptions.retrieve(
        team.subscription.stripeSubscriptionId,
      );

      const customer = await stripe.customers.retrieve(
        team.subscription.stripeCustomerId,
      );

      if (!customer.deleted) {
        const paymentMethods = await stripe.paymentMethods.list({
          customer: customer.id,
        });

        for (const paymentMethod of paymentMethods.data) {
          await stripe.paymentMethods.detach(paymentMethod.id);
        }

        await stripe.customers.update(customer.id, {
          email: newOwner.email,
          address: null,
          name: newOwner.fullName,
          invoice_settings: {
            default_payment_method: undefined,
          },
          default_source: undefined,
        });
      }

      await stripe.subscriptions.update(subscription.id, {
        cancel_at_period_end: true,
      });
    }

    await prisma.team.update({
      where: {
        id: teamId,
      },
      data: {
        ownerId: newOwnerId,
      },
    });

    const response = {
      success: true,
    };

    createAuditLog({
      action: AuditLogAction.TRANSFER_TEAM_OWNERSHIP,
      userId: session.user.id,
      teamId,
      targetType: AuditLogTargetType.TEAM,
      targetId: teamId,
      requestBody: body,
      responseBody: response,
    });

    return NextResponse.json(response);
  } catch (error) {
    logger.error(
      "Error occurred in 'teams/[slug]/transfer-ownership' route",
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
