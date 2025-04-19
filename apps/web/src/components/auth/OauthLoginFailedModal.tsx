import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import LoadingButton from '../shared/LoadingButton';

interface OauthLoginFailedModalProps {
  error: string | null;
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
  provider: string | null;
}

export default function OauthLoginFailedccessModal({
  error,
  provider,
  onOpenChange,
  open,
}: OauthLoginFailedModalProps) {
  const t = useTranslations();

  const router = useRouter();

  const handleClose = () => {
    router.push('/auth/login');
  };

  const allowedErrors = ['server_error', 'wrong_provider'];

  if (!error || !allowedErrors.includes(error)) {
    return null;
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('auth.login.login_failed')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {error === 'wrong_provider' ? (
              <>
                {t.rich('general.wrong_provider', {
                  provider: t(`auth.oauth.${provider}` as any),
                  strong: (children) => <strong>{children}</strong>,
                })}
              </>
            ) : (
              <>
                {t.rich(`auth.oauth.${error}` as any, {
                  provider: t(`auth.oauth.${provider}` as any),
                  strong: (children) => <strong>{children}</strong>,
                })}
              </>
            )}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <LoadingButton
            className="w-full"
            type="submit"
            variant="outline"
            onClick={handleClose}
          >
            {t('general.close')}
          </LoadingButton>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
