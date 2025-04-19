'use client';
import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { DateConverter } from '@/components/shared/DateConverter';
import TableSkeleton from '@/components/shared/table/TableSkeleton';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn } from '@/lib/utils/tailwind-helpers';
import { Copy, Plus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';
import { CreateApiKeyModal } from './CreateApiKeyModal';
import { DeleteApiKeyModal } from './DeleteApiKeyModal';

interface ApiKeyCardProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

export default function ApiKeysCard({ team }: ApiKeyCardProps) {
  const t = useTranslations();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedApiKey, setSelectedApiKey] = useState<string | null>();

  const handleDelete = async (apiKey: string) => {
    setSelectedApiKey(apiKey);
    setDeleteModalOpen(true);
  };

  const handleCopy = async (apiKey: string) => {
    await navigator.clipboard.writeText(apiKey);
    toast.success(t('general.copied_to_clipboard'));
  };

  return (
    <>
      <CreateApiKeyModal
        open={createModalOpen}
        team={team}
        onOpenChange={setCreateModalOpen}
      />
      <DeleteApiKeyModal
        apiKey={selectedApiKey ?? null}
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-xl font-bold">
            {t('dashboard.settings.api_keys')}
            <div className="ml-auto flex gap-2">
              <Button
                className="ml-auto flex gap-2"
                disabled={!team}
                size="sm"
                variant="default"
                onClick={() => setCreateModalOpen(true)}
              >
                <Plus className="h-4 w-4" />
                <span className={cn('max-md:hidden')}>
                  {t('dashboard.settings.add_api_key')}
                </span>
              </Button>
            </div>
          </CardTitle>
          <CardDescription>
            <span className="flex max-w-lg">
              {t('dashboard.settings.api_key_description')}
            </span>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(team?.apiKeys.length ?? true) ? (
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="truncate">ID</TableHead>
                    <TableHead className="truncate">
                      {t('general.created_by')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.created_at')}
                    </TableHead>
                    <TableHead className="truncate">
                      {t('general.expires_at')}
                    </TableHead>
                    <TableHead className="text-right">
                      {t('general.actions')}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                {!team?.apiKeys.length ? (
                  <TableSkeleton columns={5} rows={5} />
                ) : (
                  <TableBody>
                    {team.apiKeys.map((apiKey) => (
                      <TableRow key={apiKey.id}>
                        <TableCell className="truncate" title={apiKey.id}>
                          <Button
                            size="sm"
                            variant="link"
                            onClick={() => handleCopy(apiKey.id)}
                          >
                            <Copy className="mr-2 h-4 w-4 text-foreground" />
                            {apiKey.id.slice(0, 8)}...
                          </Button>
                        </TableCell>
                        <TableCell>
                          <div>
                            <b>
                              {apiKey.createdBy?.fullName ? (
                                apiKey.createdBy.fullName
                              ) : (
                                <span className="text-muted-foreground">
                                  N/A
                                </span>
                              )}
                            </b>
                            <p className="text-xs text-muted-foreground">
                              {apiKey.createdBy?.email ?? 'N/A'}
                            </p>
                          </div>
                        </TableCell>
                        <TableCell className="truncate">
                          <DateConverter date={apiKey.createdAt} />
                        </TableCell>
                        <TableCell className="truncate">
                          {apiKey.expiresAt ? (
                            <DateConverter date={apiKey.expiresAt} />
                          ) : (
                            t('general.never')
                          )}
                        </TableCell>
                        <TableCell className="py-0 text-right">
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleDelete(apiKey.id)}
                          >
                            {t('general.delete')}
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                )}
              </Table>
            </div>
          ) : (
            <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
              {t('dashboard.settings.no_api_keys')}
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
