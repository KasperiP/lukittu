import prisma from '@/lib/database/prisma';
import { logger } from '@/lib/logging/logger';
import { sendDiscordWebhook } from '@/lib/providers/discord-webhook';
import { generateKeyPair } from '@/lib/security/crypto';
import { createSession } from '@/lib/security/session';
import { Provider } from '@lukittu/prisma';
import { NextRequest, NextResponse } from 'next/server';

const baseUrl = process.env.NEXT_PUBLIC_BASE_URL!;

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');

    if (!code || typeof code !== 'string') {
      return NextResponse.redirect(new URL('/auth/login', baseUrl));
    }

    const formattedUrl = 'https://github.com/login/oauth/access_token';

    const accessTokenRes = await fetch(formattedUrl, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        client_id: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID!,
        client_secret: process.env.GITHUB_CLIENT_SECRET!,
        redirect_uri: process.env.NEXT_PUBLIC_GITHUB_REDIRECT_URI!,
        code,
      }),
    });

    if (!accessTokenRes.ok) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=github', baseUrl),
      );
    }

    const accessTokenData = (await accessTokenRes.json()) as any;

    if (!accessTokenData?.access_token) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=github', baseUrl),
      );
    }

    const userRes = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: 'Bearer ' + accessTokenData.access_token,
        Accept: 'application/json; charset=utf-8',
        'Accept-Encoding': 'application/json; charset=utf-8',
      },
    });

    if (!userRes.ok) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=github', baseUrl),
      );
    }

    const user = (await userRes.json()) as any;

    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: 'Bearer ' + accessTokenData.access_token,
        Accept: 'application/json; charset=utf-8',
        'Accept-Encoding': 'application/json; charset=utf-8',
      },
    });

    if (!emailsRes.ok) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=github', baseUrl),
      );
    }

    const emails = (await emailsRes.json()) as Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>;

    const primaryEmail = emails.find(
      (email) => email.primary && email.verified,
    );

    if (!user?.id || !primaryEmail?.email) {
      return NextResponse.redirect(
        new URL('/auth/login?error=server_error&provider=github', baseUrl),
      );
    }

    const existingUser = await prisma.user.findUnique({
      where: { email: primaryEmail.email },
    });

    if (existingUser) {
      if (existingUser.provider !== Provider.GITHUB) {
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
          new URL('/auth/login?error=server_error&provider=github', baseUrl),
        );
      }

      return NextResponse.redirect(new URL('/dashboard', baseUrl));
    }

    const newUser = await prisma.$transaction(async (prisma) => {
      const newUser = await prisma.user.create({
        data: {
          email: primaryEmail.email,
          fullName: user.name,
          provider: Provider.GITHUB,
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
                value: Provider.GITHUB,
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
        new URL('/auth/login?error=server_error&provider=github', baseUrl),
      );
    }

    return NextResponse.redirect(new URL('/dashboard', baseUrl));
  } catch (error) {
    logger.error("Error occurred in 'auth/oauth/github' route", error);
    return NextResponse.redirect(
      new URL('/auth/login?error=server_error&provider=github', baseUrl),
    );
  }
}
