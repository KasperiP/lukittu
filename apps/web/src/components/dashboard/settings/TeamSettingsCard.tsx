'use client';
import {
  ITeamGetResponse,
  ITeamGetSuccessResponse,
} from '@/app/api/(dashboard)/teams/[slug]/route';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { TeamContext } from '@/providers/TeamProvider';
import { useTranslations } from 'next-intl';
import { useContext, useEffect } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import ApiKeysCard from './ApiKeysCard';
import PublicKeysCard from './PublicKeysCard';
import { TeamDetails } from './TeamDetails';
import TeamEmailSettings from './TeamEmailSettings';
import TeamGeneralSettings from './TeamGeneralSettings';
import TeamLimits from './TeamLimits';
import TeamValidationSettings from './TeamValidationSettings';
import TeamWatermarkingSettings from './TeamWatermarkingSettings';

const fetchTeams = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ITeamGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function TeamSettingsCard() {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);

  const { data, error } = useSWR<ITeamGetSuccessResponse>(
    teamCtx.selectedTeam ? ['/api/teams', teamCtx.selectedTeam] : null,
    ([url, selectedTeam]) => fetchTeams(`${url}/${selectedTeam}`),
    {
      refreshInterval: 0, // Disable automatic refresh
    },
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.server_error'));
    }
  }, [error, t]);

  const team = data?.team;

  return (
    <div className="flex">
      <div className="flex w-full gap-4 max-xl:flex-col-reverse">
        <>
          <div className="flex w-full max-w-full flex-col gap-4 overflow-auto">
            <Tabs className="w-full" defaultValue="settings">
              <TabsList className="mb-4 grid h-auto w-full grid-cols-3">
                <TabsTrigger value="settings">
                  {t('general.settings')}
                </TabsTrigger>
                <TabsTrigger value="security">
                  {t('general.security')}
                </TabsTrigger>
                <TabsTrigger value="limits">
                  {t('dashboard.settings.limits')}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="settings">
                <div className="grid grid-cols-1 gap-4">
                  <TeamGeneralSettings team={team ?? null} />
                  <TeamValidationSettings team={team ?? null} />
                  <TeamWatermarkingSettings team={team ?? null} />
                  <TeamEmailSettings team={team ?? null} />
                </div>
              </TabsContent>
              <TabsContent value="security">
                <div className="grid grid-cols-1 gap-4">
                  <PublicKeysCard team={team ?? null} />
                  <ApiKeysCard team={team ?? null} />
                </div>
              </TabsContent>
              <TabsContent value="limits">
                <TeamLimits team={team ?? null} />
              </TabsContent>
            </Tabs>
          </div>
          <aside className="flex w-full max-w-96 flex-shrink-0 flex-col gap-4 max-xl:max-w-full">
            <TeamDetails team={team ?? null} />
          </aside>
        </>
      </div>
    </div>
  );
}
