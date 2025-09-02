import { sendDiscordWebhook } from '@/lib/providers/discord-webhook';
import { createSession } from '@/lib/security/session';
import { generateKeyPair, logger, prisma, Provider } from '@lukittu/shared';
import { NextRequest, NextResponse } from 'next/server';

interface IGitHubAccessTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
}

interface BaseGitHubUser {
  login: string;
  id: number;
  user_view_type?: string;
  node_id: string;
  avatar_url: string;
  gravatar_id: string | null;
  url: string;
  html_url: string;
  followers_url: string;
  following_url: string;
  gists_url: string;
  starred_url: string;
  subscriptions_url: string;
  organizations_url: string;
  repos_url: string;
  events_url: string;
  received_events_url: string;
  type: string;
  site_admin: boolean;

  name: string | null;
  company: string | null;
  blog: string | null;
  location: string | null;
  email: string | null;
  notification_email?: string | null;
  hireable: boolean | null;
  bio: string | null;
  twitter_username?: string | null;

  public_repos: number;
  public_gists: number;
  followers: number;
  following: number;
  created_at: string; // ISO 8601 date-time
  updated_at: string; // ISO 8601 date-time
}

interface PrivateGitHubUser extends BaseGitHubUser {
  private_gists: number;
  total_private_repos: number;
  owned_private_repos: number;
  disk_usage: number;
  collaborators: number;
  two_factor_authentication: boolean;

  plan: {
    collaborators: number;
    name: string;
    space: number;
    private_repos: number;
  };

  business_plus?: boolean;
  ldap_dn?: string;
}

interface PublicGitHubUser extends BaseGitHubUser {
  plan?: {
    collaborators: number;
    name: string;
    space: number;
    private_repos: number;
  };

  private_gists?: number;
  total_private_repos?: number;
  owned_private_repos?: number;
  disk_usage?: number;
  collaborators?: number;
}

/**
 * @see https://docs.github.com/en/rest/users/users?apiVersion=2022-11-28#get-the-authenticated-user
 */
type IGitHubUserResponse = PrivateGitHubUser | PublicGitHubUser;

/**
 * @see https://docs.github.com/en/rest/users/emails?apiVersion=2022-11-28#add-an-email-address-for-the-authenticated-user
 */
interface IGitHubEmailResponse {
  email: string;
  primary: boolean;
  verified: boolean;
  visibility: string | null;
}

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

    const accessTokenData =
      (await accessTokenRes.json()) as IGitHubAccessTokenResponse;

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

    const user = (await userRes.json()) as IGitHubUserResponse;

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

    const emails = (await emailsRes.json()) as IGitHubEmailResponse[];

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
          fullName: user.name || user.login,
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
