import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

interface IpFilterChipProps {
  ipSearch: string;
  tempIpSearch: string;
  setIpSearch: (value: string) => void;
  setTempIpSearch: (value: string) => void;
}

export function IpFilterChip({
  ipSearch,
  tempIpSearch,
  setIpSearch,
  setTempIpSearch,
}: IpFilterChipProps) {
  const t = useTranslations();

  return (
    <FilterChip
      activeValue={ipSearch}
      isActive={!!ipSearch}
      label={t('general.ip_address')}
      popoverTitle={t('general.search_ip')}
      onApply={() => setIpSearch(tempIpSearch)}
      onClear={() => {
        setTempIpSearch(ipSearch);
      }}
      onReset={() => {
        setIpSearch('');
        setTempIpSearch('');
      }}
    >
      <div className="flex flex-col gap-2">
        <Input
          placeholder={t('dashboard.logs.search_ip')}
          value={tempIpSearch}
          onChange={(e) => setTempIpSearch(e.target.value)}
        />
      </div>
    </FilterChip>
  );
}
