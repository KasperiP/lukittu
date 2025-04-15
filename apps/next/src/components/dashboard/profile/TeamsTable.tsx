'use client';
import { ITeamsLeaveResponse } from '@/app/api/(dashboard)/teams/[slug]/leave/route';
import { ITeamsDeleteResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { ITeamsTransferOwnershipResponse } from '@/app/api/(dashboard)/teams/[slug]/transfer-ownership/route';
import {
  ITeamsGetResponse,
  ITeamsGetSuccessResponse,
} from '@/app/api/(dashboard)/teams/route';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { AuthContext } from '@/providers/AuthProvider';
import { TeamContext } from '@/providers/TeamProvider';
import { Subscription, Team, User } from '@lukittu/prisma';
import {
  CheckCircle2,
  ChevronsUp,
  ChevronUp,
  Ellipsis,
  XCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import { DeleteTeamConfirmModal } from './TeamDeleteConfirmModal';
import { LeaveTeamConfirmModal } from './TeamLeaveConfirmModal';
import { TransferTeamOwnershipModal } from './TransferTeamOwnershipModal';

const fetchTeams = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ITeamsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function TeamsTable() {
  const authCtx = useContext(AuthContext);
  const teamCtx = useContext(TeamContext);

  const [teamLeaveConfirmation, setTeamLeaveConfirmation] =
    useState<Team | null>(null);
  const [teamTransferConfirmation, setTeamTransferConfirmation] = useState<
    ITeamsGetSuccessResponse['teams'][number] | null
  >(null);
  const [teamDeleteConfirmation, setTeamDeleteConfirmation] = useState<
    ITeamsGetSuccessResponse['teams'][number] | null
  >(null);
  const [teamDeleteConfirmationModalOpen, setTeamDeleteConfirmationModalOpen] =
    useState(false);
  const [teamLEaveConfirmationModalOpen, setTeamLeaveConfirmationModalOpen] =
    useState(false);
  const [
    teamTransferConfirmationModalOpen,
    setTeamTransferConfirmationModalOpen,
  ] = useState(false);

  const t = useTranslations();
  const router = useRouter();

  const { data, error, isLoading } = useSWR<ITeamsGetSuccessResponse>(
    ['/api/teams', teamCtx.selectedTeam],
    ([url]) => fetchTeams(url),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.error_occurred'));
    }
  }, [error, t]);

  const teams = data?.teams ?? [];

  const handleLeaveTeam = async (teamId: string) => {
    const response = await fetch(`/api/teams/${teamId}/leave`, {
      method: 'POST',
    });

    const data = (await response.json()) as ITeamsLeaveResponse;

    return data;
  };

  const handleDeleteTeam = async (team: Team, teamNameConfirmation: string) => {
    const response = await fetch(`/api/teams/${team.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ teamNameConfirmation }),
    });

    const data = (await response.json()) as ITeamsDeleteResponse;

    return data;
  };

  const handleTeamTransfer = async (team: Team, newOwnerId: string) => {
    const response = await fetch(`/api/teams/${team.id}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerId }),
    });

    const data = (await response.json()) as ITeamsTransferOwnershipResponse;

    return data;
  };

  const onTeamLeaveSubmit = async (team: Team) => {
    const res = await handleLeaveTeam(team.id);

    if ('message' in res) {
      toast.error(res.message);
      return;
    }

    toast.success(t('dashboard.profile.leave_team_success'));
    router.refresh();
  };

  const onTeamDeleteSubmit = async (
    team: Team,
    teamNameConfirmation: string,
  ) => {
    const res = await handleDeleteTeam(team, teamNameConfirmation);

    if ('message' in res) {
      toast.error(res.message);
      return;
    }

    toast.success(t('dashboard.profile.delete_team_success'));
    router.refresh();
  };

  const onTeamTransferSubmit = async (team: Team, newOwnerId: string) => {
    const res = await handleTeamTransfer(team, newOwnerId);

    if ('message' in res) {
      toast.error(res.message);
      return;
    }

    toast.success(t('dashboard.profile.transfer_ownership_success'));
    router.refresh();
  };

  const handleTeamDeleteConfirm = (
    team: Team & {
      users: Omit<User, 'passwordHash'>[];
      subscription: Subscription | null;
    },
  ) => {
    if (team.users.length > 1) {
      toast.error(t('dashboard.profile.delete_team_not_empty_title'), {
        description: t.rich(
          'dashboard.profile.delete_team_not_empty_description',
          {
            teamName: team.name,
            strong: (child) => <strong>{child}</strong>,
          },
        ),
      });

      return;
    }

    setTeamDeleteConfirmation(team);
    setTeamDeleteConfirmationModalOpen(true);
  };

  return (
    <>
      <LeaveTeamConfirmModal
        open={teamLEaveConfirmationModalOpen}
        team={teamLeaveConfirmation}
        onConfirm={onTeamLeaveSubmit}
        onOpenChange={setTeamLeaveConfirmationModalOpen}
      />
      <DeleteTeamConfirmModal
        open={teamDeleteConfirmationModalOpen}
        team={teamDeleteConfirmation}
        onConfirm={onTeamDeleteSubmit}
        onOpenChange={setTeamDeleteConfirmationModalOpen}
      />
      <TransferTeamOwnershipModal
        open={teamTransferConfirmationModalOpen}
        team={teamTransferConfirmation}
        onConfirm={onTeamTransferSubmit}
        onOpenChange={setTeamTransferConfirmationModalOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            {t('general.teams')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="truncate">{t('general.name')}</TableHead>
                <TableHead className="truncate">{t('general.role')}</TableHead>
                <TableHead className="truncate">
                  {t('general.subscription')}
                </TableHead>
                <TableHead className="truncate text-right">
                  {t('general.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            {isLoading ? (
              <TableSkeleton columns={3} rows={4} />
            ) : (
              <TableBody>
                {teams.map((team) => (
                  <TableRow key={team.id}>
                    <TableCell className="truncate">{team.name}</TableCell>
                    <TableCell className="truncate">
                      <Badge className="text-xs" variant="primary">
                        {team.ownerId === authCtx.session?.user.id ? (
                          <ChevronsUp className="mr-1 h-3 w-3" />
                        ) : (
                          <ChevronUp className="mr-1 h-3 w-3" />
                        )}
                        {team.ownerId === authCtx.session?.user.id
                          ? t('general.owner')
                          : t('general.member')}
                      </Badge>
                    </TableCell>
                    <TableCell className="truncate">
                      {team.subscription?.status === 'active' ? (
                        <Badge className="text-xs" variant="success">
                          <CheckCircle2 className="mr-1 h-3 w-3" />
                          {t('general.active')}
                        </Badge>
                      ) : (
                        <Badge className="text-xs" variant="secondary">
                          <XCircle className="mr-1 h-3 w-3" />
                          {t('general.inactive')}
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell className="truncate py-0 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button size="icon" variant="ghost">
                            <Ellipsis className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent
                          align="end"
                          className="font-medium"
                          forceMount
                        >
                          <DropdownMenuItem
                            className="hover:cursor-pointer"
                            disabled={
                              team.ownerId !== authCtx.session?.user.id ||
                              team.users.length === 1
                            }
                            onClick={() => {
                              setTeamTransferConfirmation(team);
                              setTeamTransferConfirmationModalOpen(true);
                            }}
                          >
                            {t('dashboard.profile.transfer_ownership')}
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive hover:cursor-pointer"
                            onClick={() => {
                              if (team.ownerId === authCtx.session?.user.id) {
                                handleTeamDeleteConfirm(team);
                              } else {
                                setTeamLeaveConfirmationModalOpen(true);
                                setTeamLeaveConfirmation(team);
                              }
                            }}
                          >
                            {team.ownerId === authCtx.session?.user.id
                              ? t('dashboard.profile.delete_team')
                              : t('dashboard.profile.leave_team')}
                            ...
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            )}
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
