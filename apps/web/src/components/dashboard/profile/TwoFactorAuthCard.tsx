'use client';
import { ITwoFactorStatusResponse } from '@/app/api/(dashboard)/users/two-factor/status/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { AuthContext } from '@/providers/AuthProvider';
import { ShieldCheck, ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import BackupCodesModal from './BackupCodesModal';
import DisableTwoFactorModal from './DisableTwoFactorModal';
import SetupTwoFactorModal from './SetupTwoFactorModal';

export default function TwoFactorAuthCard() {
  const t = useTranslations();
  const authCtx = useContext(AuthContext);
  const user = authCtx.session?.user;

  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(false);
  const [enabledAt, setEnabledAt] = useState<string | null>(null);
  const [backupCodesRemaining, setBackupCodesRemaining] = useState(0);

  const [setupModalOpen, setSetupModalOpen] = useState(false);
  const [disableModalOpen, setDisableModalOpen] = useState(false);
  const [backupCodesModalOpen, setBackupCodesModalOpen] = useState(false);

  const fetchStatus = async () => {
    try {
      const response = await fetch('/api/users/two-factor/status');
      const data = (await response.json()) as ITwoFactorStatusResponse;

      if ('enabled' in data) {
        setEnabled(data.enabled);
        setEnabledAt(data.enabledAt);
        setBackupCodesRemaining(data.backupCodesRemaining);
      }
    } catch {
      // Ignore errors
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.provider === 'CREDENTIALS') {
      fetchStatus();
    } else {
      setLoading(false);
    }
  }, [user?.provider]);

  const handleSetupComplete = () => {
    fetchStatus();
  };

  const handleDisableComplete = () => {
    setEnabled(false);
    setEnabledAt(null);
    setBackupCodesRemaining(0);
  };

  const handleBackupCodesRegenerated = (newCount: number) => {
    setBackupCodesRemaining(newCount);
  };

  if (user?.provider !== 'CREDENTIALS') {
    return null;
  }

  return (
    <>
      <SetupTwoFactorModal
        open={setupModalOpen}
        onOpenChange={setSetupModalOpen}
        onSetupComplete={handleSetupComplete}
      />
      <DisableTwoFactorModal
        open={disableModalOpen}
        onDisableComplete={handleDisableComplete}
        onOpenChange={setDisableModalOpen}
      />
      <BackupCodesModal
        backupCodesRemaining={backupCodesRemaining}
        open={backupCodesModalOpen}
        onBackupCodesRegenerated={handleBackupCodesRegenerated}
        onOpenChange={setBackupCodesModalOpen}
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-xl font-bold">
            {t('dashboard.profile.two_factor_auth')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex flex-col gap-4">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-9 w-28" />
            </div>
          ) : (
            <div className="flex max-w-md flex-col gap-6">
              <div className="flex items-center gap-3">
                {enabled ? (
                  <>
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                    <Badge variant="success">{t('general.enabled')}</Badge>
                  </>
                ) : (
                  <>
                    <ShieldOff className="h-5 w-5 text-muted-foreground" />
                    <Badge variant="secondary">{t('general.disabled')}</Badge>
                  </>
                )}
              </div>

              {enabled && (
                <>
                  <div className="flex min-h-10 items-center text-sm max-sm:flex-col max-sm:items-start max-sm:gap-2">
                    <div className="w-1/3 font-semibold max-sm:w-full">
                      {t('dashboard.profile.two_factor_enabled_at')}
                    </div>
                    <div className="w-2/3 max-sm:w-full">
                      {enabledAt
                        ? new Date(enabledAt).toLocaleDateString()
                        : '-'}
                    </div>
                  </div>
                  <div className="flex min-h-10 items-center text-sm max-sm:flex-col max-sm:items-start max-sm:gap-2">
                    <div className="w-1/3 font-semibold max-sm:w-full">
                      {t('dashboard.profile.backup_codes_remaining')}
                    </div>
                    <div className="w-2/3 max-sm:w-full">
                      <span
                        className={
                          backupCodesRemaining <= 2
                            ? 'font-semibold text-destructive'
                            : ''
                        }
                      >
                        {backupCodesRemaining}
                      </span>
                      /10
                    </div>
                  </div>
                </>
              )}

              <div className="flex gap-2">
                {enabled ? (
                  <>
                    <LoadingButton
                      size="sm"
                      variant="secondary"
                      onClick={() => setBackupCodesModalOpen(true)}
                    >
                      {t('dashboard.profile.manage_backup_codes')}
                    </LoadingButton>
                    <LoadingButton
                      size="sm"
                      variant="destructive"
                      onClick={() => setDisableModalOpen(true)}
                    >
                      {t('dashboard.profile.disable_two_factor')}
                    </LoadingButton>
                  </>
                ) : (
                  <LoadingButton
                    size="sm"
                    onClick={() => setSetupModalOpen(true)}
                  >
                    {t('dashboard.profile.enable_two_factor')}
                  </LoadingButton>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  );
}
