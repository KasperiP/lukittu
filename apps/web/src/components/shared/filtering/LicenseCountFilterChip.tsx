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
import { ComparisonMode } from './IpCountFilterChip';

interface LicenseCountFilterChipProps {
  licenseCountMin: string;
  licenseCountMax: string;
  tempLicenseCountMin: string;
  tempLicenseCountMax: string;
  comparisonMode: ComparisonMode;
  tempComparisonMode: ComparisonMode;
  setLicenseCountMin: (value: string) => void;
  setLicenseCountMax: (value: string) => void;
  setTempLicenseCountMin: (value: string) => void;
  setTempLicenseCountMax: (value: string) => void;
  setComparisonMode: (value: ComparisonMode) => void;
  setTempComparisonMode: (value: ComparisonMode) => void;
}

export function LicenseCountFilterChip({
  licenseCountMin,
  licenseCountMax,
  tempLicenseCountMin,
  tempLicenseCountMax,
  comparisonMode,
  tempComparisonMode,
  setLicenseCountMin,
  setLicenseCountMax,
  setTempLicenseCountMin,
  setTempLicenseCountMax,
  setComparisonMode,
  setTempComparisonMode,
}: LicenseCountFilterChipProps) {
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
    if (!licenseCountMin) return '';

    switch (comparisonMode) {
      case 'between':
        return `${licenseCountMin} - ${licenseCountMax}`;
      case 'equals':
        return `= ${licenseCountMin}`;
      case 'greater':
        return `> ${licenseCountMin}`;
      case 'less':
        return `< ${licenseCountMin}`;
    }
  };

  return (
    <FilterChip
      activeValue={getActiveValue()}
      isActive={!!licenseCountMin}
      label={t('general.license_count')}
      popoverTitle={t('general.filter_license_count')}
      onApply={() => {
        setComparisonMode(tempComparisonMode);
        setLicenseCountMin(tempLicenseCountMin);
        setLicenseCountMax(tempLicenseCountMax);
      }}
      onClear={() => {
        setTempComparisonMode(comparisonMode);
        setTempLicenseCountMin(licenseCountMin);
        setTempLicenseCountMax(licenseCountMax);
      }}
      onReset={() => {
        setComparisonMode('equals');
        setTempComparisonMode('equals');
        setLicenseCountMin('');
        setLicenseCountMax('');
        setTempLicenseCountMin('');
        setTempLicenseCountMax('');
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
            value={tempLicenseCountMin}
            onChange={(e) =>
              handleNumberInput(e.target.value, setTempLicenseCountMin)
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
              value={tempLicenseCountMax}
              onChange={(e) =>
                handleNumberInput(e.target.value, setTempLicenseCountMax)
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
