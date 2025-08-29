import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

const truncateValue = (value: string, maxLength = 20) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
};

interface LicenseIpFilterChipProps {
  ipAddress: string;
  tempIpAddress: string;
  setIpAddress: (value: string) => void;
  setTempIpAddress: (value: string) => void;
}

export function LicenseIpFilterChip({
  ipAddress,
  tempIpAddress,
  setIpAddress,
  setTempIpAddress,
}: LicenseIpFilterChipProps) {
  const t = useTranslations();
  const isValueTruncated = ipAddress && ipAddress.length > 20;

  const filterChip = (
    <FilterChip
      activeValue={truncateValue(ipAddress)}
      isActive={!!ipAddress}
      label={t('general.ip_address')}
      popoverTitle={t('dashboard.licenses.filter_by_ip')}
      onApply={() => setIpAddress(tempIpAddress)}
      onClear={() => {
        setTempIpAddress(ipAddress);
      }}
      onReset={() => {
        setIpAddress('');
        setTempIpAddress('');
      }}
    >
      <div className="flex flex-col gap-2">
        <Input
          placeholder={t('dashboard.licenses.enter_ip_address')}
          title={tempIpAddress}
          value={tempIpAddress}
          onChange={(e) => setTempIpAddress(e.target.value)}
        />
      </div>
    </FilterChip>
  );

  if (isValueTruncated) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{filterChip}</TooltipTrigger>
          <TooltipContent>
            <p>{ipAddress}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return filterChip;
}
