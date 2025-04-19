'use client';
import { ITeamsAcceptInviteResponse } from '@/app/api/(dashboard)/teams/invite/[slug]/route';
import { Limits, regex, Subscription, Team } from '@lukittu/shared';
import { useTranslations } from 'next-intl';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { toast } from 'sonner';
import { AuthContext } from './AuthProvider';

export const TeamContext = createContext({
  loading: true,
  selectedTeam: '',
  selectTeam: (teamId: string) => {},
  teams: [] as (Team & {
    subscription: Subscription | null;
    limits: Limits | null;
  })[],
});

export const TeamProvider = ({ children }: { children: React.ReactNode }) => {
  const t = useTranslations();
  const authCtx = useContext(AuthContext);
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const invite = searchParams.get('invite');

  const [loading, setLoading] = useState(true);
  const [selectedTeam, setSelectedTeam] = useState('');

  const teams = useMemo(() => authCtx.session?.user.teams || [], [authCtx]);

  const updateSelectedTeam = useCallback(
    (teamId: string) => {
      setSelectedTeam(teamId);
      document.cookie = `selectedTeam=${teamId}; expires=${new Date(
        Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
      ).toUTCString()}; path=/`;
      router.refresh();
    },
    [router],
  );

  const handleInvite = async (inviteId: string) => {
    const response = await fetch(`/api/teams/invite/${inviteId}`, {
      method: 'POST',
    });

    const data = (await response.json()) as ITeamsAcceptInviteResponse;

    return data;
  };

  useEffect(() => {
    const loadSelectedTeam = () => {
      const cookies = document.cookie.split(';');
      const selectedTeam = cookies.find((cookie) =>
        cookie.includes('selectedTeam'),
      );
      return selectedTeam ? selectedTeam.split('=')[1] : null;
    };

    try {
      const teamId = loadSelectedTeam();

      if (teamId) {
        const exists = teams.some((team) => team.id.toString() === teamId);
        if (exists) {
          setSelectedTeam(teamId);
          return;
        }
      }

      if (teams.length > 0) {
        const firstTeamId = teams[0].id.toString();
        updateSelectedTeam(firstTeamId);
      }
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  }, [router, teams, updateSelectedTeam, t]);

  useEffect(() => {
    (async () => {
      try {
        if (invite && regex.uuidV4.test(invite)) {
          const res = await handleInvite(invite);

          if ('message' in res) {
            toast.error(res.message);
          } else {
            toast.success(
              t.rich('dashboard.teams.invitation_accepted', {
                teamName: res.team.name,
                strong: (children) => <strong>{children}</strong>,
              }),
            );
          }
        }
      } catch (error: any) {
        toast.error(error.message ?? t('general.server_error'));
      } finally {
        if (invite && pathname) {
          router.replace(pathname);
        }
      }
    })();
  }, [invite, t, router, pathname]);

  const selectTeam = useCallback(
    (teamId: string) => {
      updateSelectedTeam(teamId);
    },
    [updateSelectedTeam],
  );

  return (
    <TeamContext.Provider
      value={{
        teams,
        loading,
        selectedTeam,
        selectTeam,
      }}
    >
      {children}
    </TeamContext.Provider>
  );
};
