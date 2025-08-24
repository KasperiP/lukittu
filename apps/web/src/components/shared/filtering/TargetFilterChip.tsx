import { Button } from '@/components/ui/button';
import { AuditLogTargetType } from '@lukittu/shared';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

interface TargetFilterChipProps {
  targetType: string;
  tempTargetType: string;
  setTargetType: (type: string) => void;
  setTempTargetType: (type: string) => void;
}

export function TargetFilterChip({
  targetType,
  tempTargetType,
  setTargetType,
  setTempTargetType,
}: TargetFilterChipProps) {
  const t = useTranslations();

  const targetTypes: AuditLogTargetType[] = [
    AuditLogTargetType.BLACKLIST,
    AuditLogTargetType.BRANCH,
    AuditLogTargetType.TEAM,
    AuditLogTargetType.CUSTOMER,
    AuditLogTargetType.PRODUCT,
    AuditLogTargetType.RELEASE,
    AuditLogTargetType.LICENSE,
    AuditLogTargetType.WEBHOOK,
    AuditLogTargetType.HARDWARE_IDENTIFIER,
    AuditLogTargetType.IP_ADDRESS,
  ];

  const activeValue = () => {
    if (targetType === 'all') return undefined;
    return t(`general.${targetType.toLowerCase()}` as any);
  };

  return (
    <FilterChip
      activeValue={activeValue()}
      isActive={targetType !== 'all'}
      label={t('general.target')}
      popoverContentClassName="min-w-[320px] md:w-auto"
      popoverTitle={t('general.select_target')}
      onApply={() => {
        setTargetType(tempTargetType);
      }}
      onClear={() => {
        setTempTargetType(targetType);
      }}
      onReset={() => {
        setTargetType('all');
        setTempTargetType('all');
      }}
    >
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 gap-2">
          <Button
            className="justify-start"
            variant={tempTargetType === 'all' ? 'default' : 'outline'}
            onClick={() => setTempTargetType('all')}
          >
            {t('general.all')}
          </Button>
          {targetTypes.map((type) => (
            <Button
              key={type}
              className="justify-start"
              variant={tempTargetType === type ? 'default' : 'outline'}
              onClick={() => setTempTargetType(type)}
            >
              {t(`general.${type.toLowerCase()}` as any)}
            </Button>
          ))}
        </div>
      </div>
    </FilterChip>
  );
}
