import { Button } from '@/components/ui/button';
import { LicenseStatus } from '@lukittu/shared';
import {
  AlertTriangle,
  Ban,
  CheckCircle,
  Clock,
  MinusCircle,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

interface LicenseStatusFilterChipProps {
  status: LicenseStatus | 'all';
  tempStatus: LicenseStatus | 'all';
  setStatus: (status: LicenseStatus | 'all') => void;
  setTempStatus: (status: LicenseStatus | 'all') => void;
}

export function LicenseStatusFilterChip({
  status,
  tempStatus,
  setStatus,
  setTempStatus,
}: LicenseStatusFilterChipProps) {
  const t = useTranslations();

  const getStatusIcon = (status: LicenseStatus) => {
    switch (status) {
      case LicenseStatus.ACTIVE:
        return <CheckCircle className="h-4 w-4 text-[#22c55e]" />;
      case LicenseStatus.INACTIVE:
        return <MinusCircle className="h-4 w-4 text-gray-500" />;
      case LicenseStatus.EXPIRING:
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case LicenseStatus.EXPIRED:
        return <AlertTriangle className="h-4 w-4 text-red-500" />;
      case LicenseStatus.SUSPENDED:
        return <Ban className="h-4 w-4 text-red-500" />;
      case LicenseStatus.UPCOMING:
        return <Clock className="h-4 w-4 text-blue-500" />;
    }
  };

  return (
    <FilterChip
      activeValue={status !== 'all' ? status : undefined}
      isActive={status !== 'all'}
      label={t('general.status')}
      popoverTitle={t('general.select_status')}
      onApply={() => setStatus(tempStatus)}
      onClear={() => setTempStatus(status)}
      onReset={() => {
        setStatus('all');
        setTempStatus('all');
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="justify-start"
            variant={tempStatus === 'all' ? 'default' : 'outline'}
            onClick={() => setTempStatus('all')}
          >
            {t('general.all')}
          </Button>
          {Object.values(LicenseStatus).map((statusOption) => (
            <Button
              key={statusOption}
              className="flex items-center justify-start gap-2"
              variant={tempStatus === statusOption ? 'default' : 'outline'}
              onClick={() => setTempStatus(statusOption)}
            >
              {getStatusIcon(statusOption)}
              {t(`general.${statusOption.toLowerCase()}` as any)}
            </Button>
          ))}
        </div>
      </div>
    </FilterChip>
  );
}
