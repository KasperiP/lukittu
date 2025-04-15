import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { useTranslations } from 'next-intl';
import LoadingButton from '../shared/LoadingButton';

interface ForgotPasswordSuccessModalProps {
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
  email: string;
}

export default function ForgotPasswordSuccessModal({
  open,
  onOpenChange,
  email,
}: ForgotPasswordSuccessModalProps) {
  const t = useTranslations();
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('auth.forgot_password.email_sent_title')}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {t.rich('auth.forgot_password.email_sent_description', {
              email,
              strong: (child) => <strong>{child}</strong>,
            })}
          </ResponsiveDialogDescription>
        </ResponsiveDialogHeader>
        <ResponsiveDialogFooter>
          <div>
            <LoadingButton
              className="w-full"
              type="submit"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              {t('general.close')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
