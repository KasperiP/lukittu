'use client';
import {
  IDiscordHealthResponse,
  IDiscordHealthSuccessResponse,
} from '@/app/api/(dashboard)/auth/oauth/discord/health/route';
import { IDiscordConnectionResponse } from '@/app/api/(dashboard)/auth/oauth/discord/route';
import { DiscordIcon } from '@/components/shared/Icons';
import LoadingButton from '@/components/shared/LoadingButton';
import { DiscordAccountDisplay } from '@/components/shared/discord/DiscordAccountDisplay';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthContext } from '@/providers/AuthProvider';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR, { mutate } from 'swr';

const fetchDiscordHealth = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IDiscordHealthResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function ThirdPartyConnectionsCard() {
  const t = useTranslations();
  const authCtx = useContext(AuthContext);
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');

  const user = authCtx.session?.user;
  const [disconnectingDiscord, setDisconnectingDiscord] = useState(false);

  const { data: discordHealth, isLoading: checkingHealth } =
    useSWR<IDiscordHealthSuccessResponse>(
      user?.discordAccount ? '/api/auth/oauth/discord/health' : null,
      fetchDiscordHealth,
    );

  useEffect(() => {
    if (error) {
      if (error === 'discord_already_linked') {
        toast.error(t('validation.discord_account_already_linked_to_user'));
      } else {
        toast.error(t('dashboard.profile.discord_connection_failed'));
      }
      router.replace('/dashboard/profile');
    }
  }, [error, t, router]);

  const handleConnectDiscord = () => {
    performDiscordOAuth();
  };

  const handleReconnectDiscord = () => {
    performDiscordOAuth();
  };

  const performDiscordOAuth = () => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(
      process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || '',
    );
    const scopes = encodeURIComponent('identify guilds guilds.members.read');
    const state = Math.random().toString(36).substring(2, 15);

    const expirationDate = new Date();
    expirationDate.setTime(expirationDate.getTime() + 10 * 60 * 1000);

    document.cookie = `discord_oauth_state=${state}; path=/; expires=${expirationDate.toUTCString()}; SameSite=Lax${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;

    const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&response_type=code&scope=${scopes}&state=${state}`;
    window.location.href = discordAuthUrl;
  };

  const handleDisconnectDiscord = async () => {
    setDisconnectingDiscord(true);
    try {
      const response = await fetch('/api/auth/oauth/discord', {
        method: 'DELETE',
      });

      const data = (await response.json()) as IDiscordConnectionResponse;

      if (!response.ok && 'message' in data) {
        toast.error(data.message || t('general.error_occurred'));
        return;
      }

      toast.success(t('dashboard.profile.discord_disconnected'));

      mutate('/api/auth/oauth/discord/health', null, false);

      authCtx.setSession((session) => ({
        ...session!,
        user: {
          ...session!.user,
          discordAccount: null,
        },
      }));
    } catch (error: any) {
      toast.error(error.message || t('general.error_occurred'));
    } finally {
      setDisconnectingDiscord(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl font-bold">
          {t('dashboard.profile.third_party_connections')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4">
          <div className="flex items-start gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-[#5865F2] text-white shadow-sm">
              <DiscordIcon className="h-6 w-6" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-lg font-semibold">
                {t('auth.oauth.discord')}
              </h3>
              <p className="mt-1 text-sm text-muted-foreground">
                {t('dashboard.profile.discord_description')}
              </p>
            </div>
          </div>

          {user?.discordAccount && (
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <DiscordAccountDisplay
                  className="min-w-0"
                  discordAccount={user.discordAccount}
                  size="md"
                />
                <div className="flex shrink-0 items-center gap-2">
                  {checkingHealth ? (
                    <Skeleton className="h-4 w-20 rounded-full" />
                  ) : discordHealth ? (
                    discordHealth.tokenValid ? (
                      <Badge className="text-xs" variant="success">
                        {t('general.connected')}
                      </Badge>
                    ) : (
                      <Badge className="text-xs" variant="error">
                        {t('general.token_expired')}
                      </Badge>
                    )
                  ) : null}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {user?.discordAccount ? (
              <>
                {discordHealth && !discordHealth.tokenValid && (
                  <LoadingButton
                    pending={false}
                    size="sm"
                    variant="default"
                    onClick={handleReconnectDiscord}
                  >
                    {t('general.reconnect')}
                  </LoadingButton>
                )}
                <LoadingButton
                  pending={disconnectingDiscord}
                  size="sm"
                  variant="secondary"
                  onClick={handleDisconnectDiscord}
                >
                  {t('general.disconnect')}
                </LoadingButton>
              </>
            ) : (
              <LoadingButton
                className="flex items-center gap-2"
                pending={false}
                size="sm"
                variant="default"
                onClick={handleConnectDiscord}
              >
                {t('general.connect')}
              </LoadingButton>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
