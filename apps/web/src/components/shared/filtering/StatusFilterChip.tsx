import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

interface StatusFilterChipProps {
  status: string;
  tempStatus: string;
  setStatus: (status: string) => void;
  setTempStatus: (status: string) => void;
}

export function StatusFilterChip({
  status,
  tempStatus,
  setStatus,
  setTempStatus,
}: StatusFilterChipProps) {
  const t = useTranslations();

  return (
    <FilterChip
      activeValue={status === 'success' ? 200 : status === 'error' ? 500 : 400}
      isActive={status !== 'all'}
      label={t('general.status')}
      popoverTitle={t('general.select_status')}
      onApply={() => setStatus(tempStatus)}
      onClear={() => {
        setTempStatus(status);
      }}
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
          <Button
            className="flex items-center justify-start gap-2"
            variant={tempStatus === 'success' ? 'default' : 'outline'}
            onClick={() => setTempStatus('success')}
          >
            <CheckCircle className="h-4 w-4 text-[#22c55e]" />
            200
          </Button>
          <Button
            className="flex items-center justify-start gap-2"
            variant={tempStatus === 'error' ? 'default' : 'outline'}
            onClick={() => setTempStatus('error')}
          >
            <XCircle className="h-4 w-4 text-red-500" />
            500
          </Button>
          <Button
            className="flex items-center justify-start gap-2"
            variant={tempStatus === 'warning' ? 'default' : 'outline'}
            onClick={() => setTempStatus('warning')}
          >
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            400
          </Button>
        </div>
      </div>
    </FilterChip>
  );
}
