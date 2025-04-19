import { sendDiscordWebhook } from '@/lib/providers/discord-webhook';
import { createSession } from '@/lib/security/session';
import { generateKeyPair, logger, prisma, Provider } from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

interface IGoogleAuthenticationResponse {
  access_token: string;
  expires_in: number;
  scope: string;
  token_type: string;
  id_token: string;
}

interface IGoogleUserResponse {
  sub: string;
  name: string;
  given_name: string;
  family_name: string;
  picture: string;
  email: string;
  email_verified: boolean;
  locale: string;
}

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');

    if (!code || typeof code !== 'string') {
      return NextResponse.redirect(new URL('/auth/login', baseUrl));
    }

    const params = new URLSearchParams({
      client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      code,
      redirect_uri: process.env.NEXT_PUBLIC_GOOGLE_REDIRECT_URI!,
      grant_type: 'authorization_code',
    });

    const formattedUrl =
      'https://oauth2.googleapis.com/token?' + params.toString();

    const accessTokenRes = await fetch(formattedUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json; charset=utf-8',
        'Accept-Encoding': 'application/json; charset=utf-8',
      },
    });

    if (!accessTokenRes.ok) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=google', baseUrl),
      );
    }

    const accessTokenData: IGoogleAuthenticationResponse =
      (await accessTokenRes.json()) as any;

    if (!accessTokenData.access_token) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=google', baseUrl),
      );
    }

    const userRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: 'Bearer ' + accessTokenData.access_token,
          Accept: 'application/json; charset=utf-8',
          'Accept-Encoding': 'application/json; charset=utf-8',
        },
      },
    );

    if (!userRes.ok) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=google', baseUrl),
      );
    }

    const user = (await userRes.json()) as IGoogleUserResponse;

    if (!user.email_verified) {
      return NextResponse.redirect(
        new URL('/auth/login?error=unverified_email&provider=google', baseUrl),
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: user.email },
    });

    if (existingUser) {
      if (existingUser.provider !== Provider.GOOGLE) {
        return NextResponse.redirect(
          new URL(
            `/auth/login?error=wrong_provider&provider=${existingUser.provider.toLowerCase()}`,
            baseUrl,
          ),
        );
      }

      const createdSession = await createSession(existingUser.id, true);

      if (!createdSession) {
        return NextResponse.redirect(
          new URL('/auth/login?error=server_error&provider=google', baseUrl),
        );
      }

      return NextResponse.redirect(new URL('/dashboard', baseUrl));
    }

    const newUser = await prisma.$transaction(async (prisma) => {
      const newUser = await prisma.user.create({
        data: {
          email: user.email,
          fullName: user.name,
          provider: Provider.GOOGLE,
          emailVerified: true,
        },
      });

      const { privateKey, publicKey } = generateKeyPair();

      await prisma.team.create({
        data: {
          name: 'My first team',
          ownerId: newUser.id,
          users: {
            connect: {
              id: newUser.id,
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

      await sendDiscordWebhook(process.env.INTERNAL_STATUS_WEBHOOK!, {
        embeds: [
          {
            title: '🎉 New User Registered',
            color: 0x00ff00,
            fields: [
              {
                name: 'Email',
                value: newUser.email,
                inline: true,
              },
              {
                name: 'Provider',
                value: Provider.GOOGLE,
                inline: true,
              },
            ],
            timestamp: new Date().toISOString(),
          },
        ],
      });

      return newUser;
    });

    const createdSession = await createSession(newUser.id, true);

    if (!createdSession) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=google', baseUrl),
      );
    }

    return NextResponse.redirect(new URL('/dashboard', baseUrl));
  } catch (error) {
    logger.error("Error occurred in 'auth/oauth/google' route", error);
    return NextResponse.redirect(
      new URL('/auth/login?error=server_error&provider=google', baseUrl),
    );
  }
}
