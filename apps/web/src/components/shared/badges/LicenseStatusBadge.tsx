import { Badge } from '@/components/ui/badge';
import { getLicenseStatusBadgeVariant } from '@/lib/licenses/license-badge-variant';
import { LicenseStatus } from '@lukittu/shared';
import { AlertTriangle, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface LicenseStatusBadgeProps {
  status: LicenseStatus;
  className?: string;
}

export function LicenseStatusBadge({
  status,
  className,
}: LicenseStatusBadgeProps) {
  const t = useTranslations();

  const icons = {
    success: <CheckCircle className="mr-1 h-3 w-3" />,
    error: <XCircle className="mr-1 h-3 w-3" />,
    warning: <AlertTriangle className="mr-1 h-3 w-3" />,
    primary: <Clock className="mr-1 h-3 w-3" />,
    secondary: <XCircle className="mr-1 h-3 w-3" />,
  };

  const variant = getLicenseStatusBadgeVariant(status);
  const icon = icons[variant as keyof typeof icons];

  return (
    <Badge className={className} variant={variant}>
      {icon}
      {t(`general.${status.toLowerCase()}` as any)}
    </Badge>
  );
}
