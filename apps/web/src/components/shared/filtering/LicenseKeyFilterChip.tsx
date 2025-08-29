import { Input } from '@/components/ui/input';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

const formatLicenseKey = (value: string) => {
  // Remove all non-alphanumeric characters and convert to uppercase
  const cleaned = value.replace(/[^A-Za-z0-9]/g, '').toUpperCase();

  // Add dashes every 5 characters, up to 25 characters total
  const formatted = cleaned.match(/.{1,5}/g)?.join('-') || cleaned;

  // Limit to 29 characters (25 chars + 4 dashes)
  return formatted.slice(0, 29);
};

const isValidLicenseKeyFormat = (value: string) => {
  // Check if it matches the XXXXX-XXXXX-XXXXX-XXXXX-XXXXX pattern
  const licenseKeyRegex =
    /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;
  return licenseKeyRegex.test(value);
};

const truncateValue = (value: string, maxLength = 20) => {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength)}...`;
};

interface LicenseKeyFilterChipProps {
  licenseKey: string;
  tempLicenseKey: string;
  setLicenseKey: (value: string) => void;
  setTempLicenseKey: (value: string) => void;
}

export function LicenseKeyFilterChip({
  licenseKey,
  tempLicenseKey,
  setLicenseKey,
  setTempLicenseKey,
}: LicenseKeyFilterChipProps) {
  const t = useTranslations();
  const isValueTruncated = licenseKey && licenseKey.length > 20;
  const isValidFormat =
    !tempLicenseKey || isValidLicenseKeyFormat(tempLicenseKey);

  const handleInputChange = (value: string) => {
    const formatted = formatLicenseKey(value);
    setTempLicenseKey(formatted);
  };

  const filterChip = (
    <FilterChip
      activeValue={truncateValue(licenseKey)}
      disabled={!tempLicenseKey || !isValidLicenseKeyFormat(tempLicenseKey)}
      isActive={!!licenseKey}
      label={t('general.license')}
      popoverTitle={t('dashboard.licenses.filter_by_license_key')}
      onApply={() => setLicenseKey(tempLicenseKey)}
      onClear={() => {
        setTempLicenseKey(licenseKey);
      }}
      onReset={() => {
        setLicenseKey('');
        setTempLicenseKey('');
      }}
    >
      <div className="flex flex-col gap-2">
        <Input
          className={!isValidFormat ? 'border-destructive' : ''}
          placeholder="XXXXX-XXXXX-XXXXX-XXXXX-XXXXX"
          title={tempLicenseKey}
          value={tempLicenseKey}
          onChange={(e) => handleInputChange(e.target.value)}
        />
        {!isValidFormat && tempLicenseKey && (
          <p className="text-xs text-destructive">
            {t('dashboard.licenses.invalid_license_key_format')}
          </p>
        )}
      </div>
    </FilterChip>
  );

  if (isValueTruncated) {
    return (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{filterChip}</TooltipTrigger>
          <TooltipContent>
            <p>{licenseKey}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    );
  }

  return filterChip;
}
