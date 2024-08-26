'use client';
import { ITeamsLeaveResponse } from '@/app/api/teams/[slug]/leave/route';
import { ITeamsDeleteResponse } from '@/app/api/teams/[slug]/route';
import { ITeamsTransferOwnershipResponse } from '@/app/api/teams/[slug]/transfer-ownership/route';
import {
  ITeamsGetResponse,
  ITeamsGetSuccessResponse,
} from '@/app/api/teams/route';
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
import { useModal } from '@/hooks/useModal';
import { AuthContext } from '@/providers/AuthProvider';
import { Team, User } from '@prisma/client';
import { EllipsisVertical } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { DeleteTeamConfirmModal } from './TeamDeleteConfirmModal';
import { LeaveTeamConfirmModal } from './TeamLeaveConfirmModal';
import { TransferTeamOwnershipModal } from './TransferTeamOwnershipModal';

export default function TeamListCard() {
  const authCtx = useContext(AuthContext);

  const [teams, setTeams] = useState<ITeamsGetSuccessResponse['teams']>([]);
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

  const { ConfirmModal, openConfirmModal } = useModal();
  const t = useTranslations();

  useEffect(() => {
    const handleTeamGet = async () => {
      const response = await fetch('/api/teams');
      const data = (await response.json()) as ITeamsGetResponse;
      if ('teams' in data) {
        setTeams(data.teams);
      }
    };

    handleTeamGet();
  }, []);

  const handleLeaveTeam = async (teamId: number) => {
    const response = await fetch(`/api/teams/${teamId}/leave`, {
      method: 'POST',
    });

    const data = (await response.json()) as ITeamsLeaveResponse;

    return data;
  };

  const handleTeamLeave = async (team: Team) => {
    const res = await handleLeaveTeam(team.id);

    if ('message' in res) {
      return openConfirmModal({
        title: t('general.error'),
        description: res.message,
      });
    }

    const session = authCtx.session;
    if (session) {
      authCtx.setSession({
        ...session,
        user: {
          ...session.user,
          teams: session.user.teams.filter((t) => t.id !== team.id),
        },
      });
    }

    setTeams((teams) => teams.filter((t) => t.id !== team.id));
  };

  const handleDeleteTeam = async (team: Team, teamNameConfirmation: string) => {
    const response = await fetch(`/api/teams/${team.id}`, {
      method: 'DELETE',
      body: JSON.stringify({ teamNameConfirmation }),
    });

    const data = (await response.json()) as ITeamsDeleteResponse;

    return data;
  };

  const handleTeamDelete = async (team: Team, teamNameConfirmation: string) => {
    const res = await handleDeleteTeam(team, teamNameConfirmation);

    if ('message' in res) {
      return openConfirmModal({
        title: t('general.error'),
        description: res.message,
      });
    }

    const session = authCtx.session;
    if (session) {
      authCtx.setSession({
        ...session,
        user: {
          ...session.user,
          teams: session.user.teams.filter((t) => t.id !== team.id),
        },
      });
    }

    setTeams((teams) => teams.filter((t) => t.id !== team.id));
  };

  const handleTeamTransfer = async (team: Team, newOwnerId: number) => {
    const response = await fetch(`/api/teams/${team.id}/transfer-ownership`, {
      method: 'POST',
      body: JSON.stringify({ newOwnerId }),
    });

    const data = (await response.json()) as ITeamsTransferOwnershipResponse;

    if ('message' in data) {
      return openConfirmModal({
        title: t('general.error'),
        description: data.message,
      });
    }

    const session = authCtx.session;
    if (session) {
      authCtx.setSession({
        ...session,
        user: {
          ...session.user,
          teams: session.user.teams.map((t) =>
            t.id === team.id ? { ...t, isOwner: false } : t,
          ),
        },
      });
    }
  };

  const handleTeamDeleteConfirm = (
    team: Team & { users: Omit<User, 'passwordHash'>[] },
  ) => {
    if (team.users.length > 1) {
      return openConfirmModal({
        title: t('dashboard.profile.delete_team_not_empty_title'),
        description: t.rich(
          'dashboard.profile.delete_team_not_empty_description',
          {
            teamName: team.name,
            strong: (child) => <strong>{child}</strong>,
          },
        ),
      });
    }

    setTeamDeleteConfirmation(team);
    setTeamDeleteConfirmationModalOpen(true);
  };

  return (
    <>
      <ConfirmModal />
      <LeaveTeamConfirmModal
        open={teamLEaveConfirmationModalOpen}
        team={teamLeaveConfirmation}
        onConfirm={handleTeamLeave}
        onOpenChange={setTeamLeaveConfirmationModalOpen}
      />
      <DeleteTeamConfirmModal
        open={teamDeleteConfirmationModalOpen}
        team={teamDeleteConfirmation}
        onConfirm={handleTeamDelete}
        onOpenChange={setTeamDeleteConfirmationModalOpen}
      />
      <TransferTeamOwnershipModal
        open={teamTransferConfirmationModalOpen}
        team={teamTransferConfirmation}
        onConfirm={handleTeamTransfer}
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
                <TableHead className="truncate text-right">
                  {t('general.actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {teams.map((team) => (
                <TableRow key={team.id}>
                  <TableCell className="truncate">{team.name}</TableCell>
                  <TableCell className="truncate">
                    <Badge variant="outline">
                      {team.ownerId === authCtx.session?.user.id
                        ? t('general.owner')
                        : t('general.member')}
                    </Badge>
                  </TableCell>
                  <TableCell className="truncate py-0 text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button size="icon" variant="ghost">
                          <EllipsisVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent
                        align="end"
                        className="font-medium"
                        forceMount
                      >
                        <DropdownMenuItem
                          className="hover:cursor-pointer"
                          disabled={team.ownerId !== authCtx.session?.user.id}
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
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
