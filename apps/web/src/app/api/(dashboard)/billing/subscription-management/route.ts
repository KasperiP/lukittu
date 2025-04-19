import { getSession } from '@/lib/security/session';
import { getLanguage, getSelectedTeam } from '@/lib/utils/header-helpers';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { logger } from '@lukittu/shared';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';
import { Stripe } from 'stripe';

export type IBillingSubscriptionManagementGetResponse = ErrorResponse;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
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
              deletedAt: null,
              id: selectedTeam,
            },
            include: {
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

    if (!session.user.teams.length) {
      return NextResponse.json(
        {
          message: t('validation.team_not_found'),
        },
        { status: HttpStatus.NOT_FOUND },
      );
    }

    const team = session.user.teams[0];

    if (team.ownerId !== session.user.id) {
      return NextResponse.json(
        {
          message: t('validation.unauthorized'),
        },
        { status: HttpStatus.UNAUTHORIZED },
      );
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2025-02-24.acacia',
    });

    if (team.subscription) {
      const subscription = await stripe.subscriptions.retrieve(
        team.subscription.stripeSubscriptionId,
      );

      if (subscription.status === 'active') {
        const portalSession = await stripe.billingPortal.sessions.create({
          customer: team.subscription.stripeCustomerId,
          return_url: `${process.env.NEXT_PUBLIC_BASE_URL}`,
        });

        return NextResponse.redirect(portalSession.url, {
          status: HttpStatus.TEMPORARY_REDIRECT,
        });
      }

      const checkoutSession = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: team.subscription.stripeCustomerId,
        line_items: [
          {
            price: process.env.STRIPE_PRICE_ID!,
            quantity: 1,
          },
        ],
        success_url: `${process.env.NEXT_PUBLIC_BASE_URL}`,
        cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}`,
        allow_promotion_codes: true,
        metadata: {
          lukittu_team_id: team.id,
        },
        subscription_data: {
          metadata: {
            lukittu_team_id: team.id,
          },
        },
      });

      return NextResponse.redirect(checkoutSession.url!, {
        status: HttpStatus.TEMPORARY_REDIRECT,
      });
    }

    const checkoutSession = await stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID!,
          quantity: 1,
        },
      ],
      success_url: `${process.env.NEXT_PUBLIC_BASE_URL}`,
      cancel_url: `${process.env.NEXT_PUBLIC_BASE_URL}`,
      allow_promotion_codes: true,
      metadata: {
        lukittu_team_id: team.id,
      },
      subscription_data: {
        metadata: {
          lukittu_team_id: team.id,
        },
      },
    });

    const redirectUrl = checkoutSession.url!;

    return NextResponse.redirect(redirectUrl, {
      status: HttpStatus.TEMPORARY_REDIRECT,
    });
  } catch (error) {
    logger.error(
      "Error occurred in 'billing/subscription-management' route",
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
