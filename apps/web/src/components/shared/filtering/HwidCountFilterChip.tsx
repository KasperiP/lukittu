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

interface HwidCountFilterChipProps {
  hwidCountMin: string;
  hwidCountMax: string;
  tempHwidCountMin: string;
  tempHwidCountMax: string;
  comparisonMode: ComparisonMode;
  tempComparisonMode: ComparisonMode;
  setHwidCountMin: (value: string) => void;
  setHwidCountMax: (value: string) => void;
  setTempHwidCountMin: (value: string) => void;
  setTempHwidCountMax: (value: string) => void;
  setComparisonMode: (value: ComparisonMode) => void;
  setTempComparisonMode: (value: ComparisonMode) => void;
}

export function HwidCountFilterChip({
  hwidCountMin,
  hwidCountMax,
  tempHwidCountMin,
  tempHwidCountMax,
  comparisonMode,
  tempComparisonMode,
  setHwidCountMin,
  setHwidCountMax,
  setTempHwidCountMin,
  setTempHwidCountMax,
  setComparisonMode,
  setTempComparisonMode,
}: HwidCountFilterChipProps) {
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
    if (!hwidCountMin) return '';

    switch (comparisonMode) {
      case 'between':
        return `${hwidCountMin} - ${hwidCountMax}`;
      case 'equals':
        return `= ${hwidCountMin}`;
      case 'greater':
        return `> ${hwidCountMin}`;
      case 'less':
        return `< ${hwidCountMin}`;
    }
  };

  return (
    <FilterChip
      activeValue={getActiveValue()}
      disabled={
        !tempComparisonMode ||
        !tempHwidCountMin ||
        (tempComparisonMode === 'between' && !tempHwidCountMax)
      }
      isActive={!!hwidCountMin}
      label={t('general.hwid_count')}
      popoverTitle={t('general.filter_hwid_count')}
      onApply={() => {
        if (tempComparisonMode && tempHwidCountMin) {
          if (tempComparisonMode === 'between' && !tempHwidCountMax) {
            return;
          }
          setComparisonMode(tempComparisonMode);
          setHwidCountMin(tempHwidCountMin);
          setHwidCountMax(tempHwidCountMax);
        }
      }}
      onClear={() => {
        setTempComparisonMode(comparisonMode);
        setTempHwidCountMin(hwidCountMin);
        setTempHwidCountMax(hwidCountMax);
      }}
      onReset={() => {
        setComparisonMode('');
        setTempComparisonMode('');
        setHwidCountMin('');
        setHwidCountMax('');
        setTempHwidCountMin('');
        setTempHwidCountMax('');
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
            max="1000"
            min="0"
            placeholder={
              tempComparisonMode === 'between'
                ? t('general.min')
                : t('general.value')
            }
            type="number"
            value={tempHwidCountMin}
            onChange={(e) =>
              handleNumberInput(e.target.value, setTempHwidCountMin)
            }
            onKeyDown={(e) => {
              if (e.key === '-') {
                e.preventDefault();
              }
            }}
          />
          {tempComparisonMode === 'between' && (
            <Input
              max="1000"
              maxLength={4}
              min="0"
              placeholder={t('general.max')}
              type="number"
              value={tempHwidCountMax}
              onChange={(e) =>
                handleNumberInput(e.target.value, setTempHwidCountMax)
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
