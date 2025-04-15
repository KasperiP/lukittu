import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

export type ComparisonMode = 'between' | 'equals' | 'greater' | 'less' | '';

interface IpCountFilterChipProps {
  ipCountMin: string;
  ipCountMax: string;
  tempIpCountMin: string;
  tempIpCountMax: string;
  comparisonMode: ComparisonMode;
  tempComparisonMode: ComparisonMode;
  setIpCountMin: (value: string) => void;
  setIpCountMax: (value: string) => void;
  setTempIpCountMin: (value: string) => void;
  setTempIpCountMax: (value: string) => void;
  setComparisonMode: (value: ComparisonMode) => void;
  setTempComparisonMode: (value: ComparisonMode) => void;
}

export function IpCountFilterChip({
  ipCountMin,
  ipCountMax,
  tempIpCountMin,
  tempIpCountMax,
  comparisonMode,
  tempComparisonMode,
  setIpCountMin,
  setIpCountMax,
  setTempIpCountMin,
  setTempIpCountMax,
  setComparisonMode,
  setTempComparisonMode,
}: IpCountFilterChipProps) {
  const t = useTranslations();

  const handleNumberInput = (
    value: string,
    setter: (value: string) => void,
  ) => {
    const number = parseInt(value);
    if (isNaN(number)) {
      setter('');
    } else if (number >= 0) {
      setter(number.toString());
    }
  };

  const getActiveValue = () => {
    if (!ipCountMin) return '';

    switch (comparisonMode) {
      case 'between':
        return `${ipCountMin} - ${ipCountMax}`;
      case 'equals':
        return `= ${ipCountMin}`;
      case 'greater':
        return `> ${ipCountMin}`;
      case 'less':
        return `< ${ipCountMin}`;
    }
  };

  return (
    <FilterChip
      activeValue={getActiveValue()}
      isActive={!!ipCountMin}
      label={t('general.ip_count')}
      popoverTitle={t('general.filter_ip_count')}
      onApply={() => {
        setComparisonMode(tempComparisonMode);
        setIpCountMin(tempIpCountMin);
        setIpCountMax(tempIpCountMax);
      }}
      onClear={() => {
        setTempComparisonMode(comparisonMode);
        setTempIpCountMin(ipCountMin);
        setTempIpCountMax(ipCountMax);
      }}
      onReset={() => {
        setComparisonMode('equals');
        setTempComparisonMode('equals');
        setIpCountMin('');
        setIpCountMax('');
        setTempIpCountMin('');
        setTempIpCountMax('');
      }}
    >
      <div className="flex flex-col gap-4">
        <Select
          value={tempComparisonMode}
          onValueChange={(value: ComparisonMode) =>
            setTempComparisonMode(value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder={t('general.select_comparison')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="between">{t('general.between')}</SelectItem>
            <SelectItem value="equals">{t('general.equals')}</SelectItem>
            <SelectItem value="greater">{t('general.greater_than')}</SelectItem>
            <SelectItem value="less">{t('general.less_than')}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex gap-2">
          <Input
            min="0"
            placeholder={
              tempComparisonMode === 'between'
                ? t('general.min')
                : t('general.value')
            }
            type="number"
            value={tempIpCountMin}
            onChange={(e) =>
              handleNumberInput(e.target.value, setTempIpCountMin)
            }
            onKeyDown={(e) => {
              if (e.key === '-') {
                e.preventDefault();
              }
            }}
          />
          {tempComparisonMode === 'between' && (
            <Input
              min="0"
              placeholder={t('general.max')}
              type="number"
              value={tempIpCountMax}
              onChange={(e) =>
                handleNumberInput(e.target.value, setTempIpCountMax)
              }
              onKeyDown={(e) => {
                if (e.key === '-') {
                  e.preventDefault();
                }
              }}
            />
          )}
        </div>
      </div>
    </FilterChip>
  );
}
