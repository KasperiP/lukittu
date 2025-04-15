import { Button } from '@/components/ui/button';
import { useTranslations } from 'next-intl';
import { FilterChip } from '../FilterChip';

interface TypeFilterChipProps {
  type: string;
  tempType: string;
  setType: (type: string) => void;
  setTempType: (type: string) => void;
}

export function TypeFilterChip({
  type,
  tempType,
  setType,
  setTempType,
}: TypeFilterChipProps) {
  const t = useTranslations();

  return (
    <FilterChip
      activeValue={
        type === 'HEARTBEAT'
          ? t('general.heartbeat')
          : type === 'VERIFY'
            ? t('general.verify')
            : type === 'DOWNLOAD'
              ? t('general.classloader')
              : undefined
      }
      isActive={type !== 'all'}
      label={t('general.type')}
      popoverTitle={t('general.select_type')}
      onApply={() => setType(tempType)}
      onClear={() => {
        setTempType(type);
      }}
      onReset={() => {
        setType('all');
        setTempType('all');
      }}
    >
      <div className="flex flex-col gap-2">
        <div className="grid grid-cols-1 gap-2">
          <Button
            className="justify-start"
            variant={tempType === 'all' ? 'default' : 'outline'}
            onClick={() => setTempType('all')}
          >
            {t('general.all')}
          </Button>
          <Button
            className="justify-start"
            variant={tempType === 'HEARTBEAT' ? 'default' : 'outline'}
            onClick={() => setTempType('HEARTBEAT')}
          >
            {t('general.heartbeat')}
          </Button>
          <Button
            className="justify-start"
            variant={tempType === 'VERIFY' ? 'default' : 'outline'}
            onClick={() => setTempType('VERIFY')}
          >
            {t('general.verify')}
          </Button>
          <Button
            className="justify-start"
            variant={tempType === 'DOWNLOAD' ? 'default' : 'outline'}
            onClick={() => setTempType('DOWNLOAD')}
          >
            {t('general.classloader')}
          </Button>
        </div>
      </div>
    </FilterChip>
  );
}
