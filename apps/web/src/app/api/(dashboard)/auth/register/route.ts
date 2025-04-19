import { sendVerifyEmailEmail } from '@/lib/emails/templates/send-verify-email-email';
import { verifyTurnstileToken } from '@/lib/providers/cloudflare';
import { sendDiscordWebhook } from '@/lib/providers/discord-webhook';
import { isRateLimited } from '@/lib/security/rate-limiter';
import { getIp, getLanguage } from '@/lib/utils/header-helpers';
import {
  registerSchema,
  RegisterSchema,
} from '@/lib/validation/auth/register-schema';
import { ErrorResponse } from '@/types/common-api-types';
import { HttpStatus } from '@/types/http-status';
import { JwtTypes } from '@/types/jwt-types-enum';
import {
  generateKeyPair,
  hashPassword,
  logger,
  prisma,
  Provider,
} from '@lukittu/shared';
import jwt from 'jsonwebtoken';
import { getTranslations } from 'next-intl/server';
import { NextRequest, NextResponse } from 'next/server';

type IAuthRegisterSuccessResponse = {
  success: boolean;
};

export type IAuthRegisterResponse =
  | ErrorResponse
  | IAuthRegisterSuccessResponse;

export async function POST(
  request: NextRequest,
): Promise<NextResponse<IAuthRegisterResponse | unknown>> {
  const t = await getTranslations({ locale: await getLanguage() });

  try {
    const body = (await request.json()) as RegisterSchema;
    const validated = await registerSchema(t).safeParseAsync(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          message: validated.error.errors[0].message,
          field: validated.error.errors[0].path[0],
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const ip = await getIp();
    if (ip) {
      const key = `register:${ip}`;
      const isLimited = await isRateLimited(key, 5, 300); // 5 requests per 5 minutes

      if (isLimited) {
        return NextResponse.json(
          {
            message: t('validation.too_many_requests'),
          },
          { status: HttpStatus.TOO_MANY_REQUESTS },
        );
      }
    }

    const { email, password, fullName, token } = validated.data;

    const turnstileValid = await verifyTurnstileToken(token);

    if (!turnstileValid) {
      return NextResponse.json(
        {
          message: t('validation.invalid_turnstile_token'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email },
    });

    if (existingUser && existingUser.provider !== Provider.CREDENTIALS) {
      return NextResponse.json(
        {
          message: t('general.wrong_provider', {
            provider: t(
              `auth.oauth.${existingUser.provider.toLowerCase()}` as any,
            ),
          }),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (existingUser && existingUser.emailVerified) {
      return NextResponse.json(
        {
          message: t('auth.register.email_already_in_use'),
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    if (existingUser && !existingUser.emailVerified) {
      return NextResponse.json(
        {
          message: t('auth.login.email_not_verified'),
          reverifyEmail: true,
        },
        { status: HttpStatus.BAD_REQUEST },
      );
    }

    const passwordHash = hashPassword(password);

    const user = await prisma.$transaction(async (prisma) => {
      const user = await prisma.user.create({
        data: {
          email,
          passwordHash,
          fullName,
        },
      });

      const { privateKey, publicKey } = generateKeyPair();

      await prisma.team.create({
        data: {
          name: 'My first team',
          ownerId: user.id,
          users: {
            connect: {
              id: user.id,
            },
          },
          keyPair: {
            create: {
              privateKey,
              publicKey,
            },
          },
          settings: {
            create: {
              strictCustomers: false,
              strictProducts: false,
            },
          },
          limits: {
            create: {},
          },
        },
      });

      return user;
    });

    const verifyToken = jwt.sign(
      {
        userId: user.id,
        type: JwtTypes.NEW_ACCOUNT_EMAIL_VERIFICATION,
      },
      process.env.JWT_SECRET!,
      {
        expiresIn: '30m',
      },
    );

    const verifyLink = `${process.env.NEXT_PUBLIC_BASE_URL}/auth/verify-email?token=${verifyToken}`;

    const success = await sendVerifyEmailEmail({
      email,
      user,
      verifyLink,
    });

    if (!success) {
      return NextResponse.json(
        {
          message: t('auth.emails.sending_failed_title'),
        },
        { status: HttpStatus.INTERNAL_SERVER_ERROR },
      );
    }

    await sendDiscordWebhook(process.env.INTERNAL_STATUS_WEBHOOK!, {
      embeds: [
        {
          title: '🎉 New User Registered',
          color: 0x00ff00,
          fields: [
            {
              name: 'Email',
              value: email,
              inline: true,
            },
            {
              name: 'Provider',
              value: Provider.CREDENTIALS,
              inline: true,
            },
          ],
          timestamp: new Date().toISOString(),
        },
      ],
    });

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    logger.error("Error occurred in 'register' route", error);
    return NextResponse.json(
      {
        message: t('general.server_error'),
      },
      { status: HttpStatus.INTERNAL_SERVER_ERROR },
    );
  }
}
