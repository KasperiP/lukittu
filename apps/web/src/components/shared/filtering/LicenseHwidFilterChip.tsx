import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

const truncateValue = (value: string, maxLength = 16) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
};

interface LicenseHwidFilterChipProps {
  hwid: string;
  tempHwid: string;
  setHwid: (value: string) => void;
  setTempHwid: (value: string) => void;
}

export function LicenseHwidFilterChip({
  hwid,
  tempHwid,
  setHwid,
  setTempHwid,
}: LicenseHwidFilterChipProps) {
  const t = useTranslations();
  const isValueTruncated = hwid && hwid.length > 16;

  const filterChip = (
    <FilterChip
      activeValue={truncateValue(hwid)}
      isActive={!!hwid}
      label={t('general.hardware_identifier')}
      popoverTitle={t('dashboard.licenses.filter_by_hwid')}
      onApply={() => setHwid(tempHwid)}
      onClear={() => {
        setTempHwid(hwid);
      }}
      onReset={() => {
        setHwid('');
        setTempHwid('');
      }}
    >
      <div className="flex flex-col gap-2">
        <Input
          placeholder={t('dashboard.licenses.enter_hardware_identifier')}
          title={tempHwid}
          value={tempHwid}
          onChange={(e) => setTempHwid(e.target.value)}
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
            <p>{hwid}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return filterChip;
}
