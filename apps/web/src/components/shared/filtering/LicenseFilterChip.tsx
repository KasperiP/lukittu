import { Input } from '@/components/ui/input';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

interface LicenseFilterChipProps {
  licenseSearch: string;
  tempLicenseSearch: string;
  setLicenseSearch: (value: string) => void;
  setTempLicenseSearch: (value: string) => void;
}

export function LicenseFilterChip({
  licenseSearch,
  tempLicenseSearch,
  setLicenseSearch,
  setTempLicenseSearch,
}: LicenseFilterChipProps) {
  const t = useTranslations();

  return (
    <FilterChip
      activeValue={licenseSearch}
      isActive={!!licenseSearch}
      label={t('general.license')}
      popoverTitle={t('general.search_license')}
      onApply={() => setLicenseSearch(tempLicenseSearch)}
      onClear={() => {
        setTempLicenseSearch(licenseSearch);
      }}
      onReset={() => {
        setLicenseSearch('');
        setTempLicenseSearch('');
      }}
    >
      <div className="flex flex-col gap-2">
        <Input
          placeholder={t('dashboard.licenses.search_license')}
          value={tempLicenseSearch}
          onChange={(e) => setTempLicenseSearch(e.target.value)}
        />
      </div>
    </FilterChip>
  );
}
