import { Calendar } from '@/components/ui/calendar';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { addDays, format } from 'date-fns';
import { useTranslations } from 'next-intl';
import { DateRange } from 'react-day-picker';
import { FilterChip } from '../FilterChip';

interface DateRangeFilterChipProps {
  dateRange: DateRange | undefined;
  tempDateRange: DateRange | undefined;
  setDateRange: (range: DateRange | undefined) => void;
  setTempDateRange: (range: DateRange | undefined) => void;
}

export function DateRangeFilterChip({
  dateRange,
  tempDateRange,
  setDateRange,
  setTempDateRange,
}: DateRangeFilterChipProps) {
  const t = useTranslations();
  const isDesktop = useMediaQuery('(min-width: 640px)');

  return (
    <FilterChip
      activeValue={
        dateRange?.from && dateRange.to
          ? `${format(dateRange.from, 'MMM d')} - ${format(dateRange.to, 'MMM d')}`
          : undefined
      }
      isActive={!!dateRange?.from || !!dateRange?.to}
      label={t('general.date')}
      popoverContentClassName="min-w-[280px] md:w-auto md:min-w-[600px] max-h-[calc(100vh-100px)] overflow-y-auto flex flex-col"
      popoverTitle={t('general.select_date_range')}
      onApply={() => setDateRange(tempDateRange)}
      onClear={() => {
        setTempDateRange(dateRange);
      }}
      onReset={() => {
        setDateRange(undefined);
        setTempDateRange({
          from: addDays(new Date(), -7),
          to: new Date(),
        });
      }}
    >
      <div className="flex flex-1 flex-col items-center justify-center">
        <Calendar
          className="w-full md:w-auto"
          disabled={(date) =>
            date > new Date() || date < new Date('2000-01-01')
          }
          mode="range"
          numberOfMonths={isDesktop ? 2 : 1}
          selected={tempDateRange}
          onSelect={setTempDateRange}
        />
      </div>
    </FilterChip>
  );
}
