'use client';
import { IDiscordConnectionResponse } from '@/app/api/(dashboard)/auth/oauth/discord/route';
import { DiscordIcon } from '@/components/shared/Icons';
import LoadingButton from '@/components/shared/LoadingButton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AuthContext } from '@/providers/AuthProvider';
import { useTranslations } from 'next-intl';
import { useRouter, useSearchParams } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';

export default function ThirdPartyConnectionsCard() {
  const t = useTranslations();
  const authCtx = useContext(AuthContext);
  const searchParams = useSearchParams();
  const router = useRouter();
  const error = searchParams.get('error');

  useEffect(() => {
    if (error) {
      toast.error(t('dashboard.profile.discord_connection_failed'));
      router.replace('/dashboard/profile');
    }
  }, [error, t, router]);

  const user = authCtx.session?.user;
  const [disconnectingDiscord, setDisconnectingDiscord] = useState(false);

  const handleConnectDiscord = () => {
    const clientId = process.env.NEXT_PUBLIC_DISCORD_CLIENT_ID;
    const redirectUri = encodeURIComponent(
      process.env.NEXT_PUBLIC_DISCORD_REDIRECT_URI || '',
    );
    const scopes = encodeURIComponent('identify');
    const state = crypto.randomUUID();

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
      <CardContent>
        <div className="space-y-6">
          <div className="flex items-center justify-between max-sm:flex-col max-sm:items-start max-sm:gap-4">
            <div className="flex items-center space-x-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#5865F2] text-white">
                <DiscordIcon className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">{t('auth.oauth.discord')}</div>
                <div className="text-sm text-muted-foreground">
                  {t('dashboard.profile.discord_description')}
                </div>
              </div>
            </div>

            {user?.discordAccount ? (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  {user.discordAccount.avatarUrl && (
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={user.discordAccount.avatarUrl} />
                      <AvatarFallback className="bg-[#5865F2] text-white">
                        <DiscordIcon className="h-4 w-4" />
                      </AvatarFallback>
                    </Avatar>
                  )}
                  <span className="font-medium">
                    {user.discordAccount.username}
                  </span>
                </div>
                <LoadingButton
                  pending={disconnectingDiscord}
                  size="sm"
                  variant="outline"
                  onClick={handleDisconnectDiscord}
                >
                  {t('general.disconnect')}
                </LoadingButton>
              </div>
            ) : (
              <LoadingButton
                className="flex items-center gap-2"
                pending={false}
                size="sm"
                variant="outline"
                onClick={handleConnectDiscord}
              >
                <DiscordIcon className="h-4 w-4" />
                {t('general.connect')}
              </LoadingButton>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
