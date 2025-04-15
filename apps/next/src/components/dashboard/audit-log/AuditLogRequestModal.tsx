import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { AuditLog } from '@lukittu/prisma';
import { useTranslations } from 'next-intl';

interface AuditLogRequestModalProps {
  open: boolean;
  onOpenChange: (boolean: boolean) => void;
  auditLog: AuditLog | null;
}

export default function AuditLogRequestModal({
  auditLog,
  onOpenChange,
  open,
}: AuditLogRequestModalProps) {
  const t = useTranslations();

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
  };

  if (!auditLog) return null;

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[825px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>
            {t('dashboard.dashboard.requests')}
          </ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <div className="max-md:px-2">
          <h3 className="mb-2 font-semibold">
            {t('dashboard.logs.request_body')}
          </h3>
          <pre className="overflow-x-auto rounded-md bg-muted p-4">
            <code>{JSON.stringify(auditLog.requestBody, null, 2)}</code>
          </pre>
          <h3 className="mb-2 mt-4 font-semibold">
            {t('dashboard.logs.response_body')}
          </h3>
          <pre className="overflow-x-auto rounded-md bg-muted p-4">
            <code>{JSON.stringify(auditLog.responseBody, null, 2)}</code>
          </pre>
        </div>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
