import { Portal } from '@radix-ui/react-hover-card';
import { useLocale, useTranslations } from 'next-intl';
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '../ui/hover-card';

interface DateConverterProps {
  date: Date;
  displayType?: 'date' | 'time' | 'datetime';
}

const dateFormats = {
  datetime: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
  },
  date: {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  },
  time: {
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
  },
} as const;

export function DateConverter({
  date,
  displayType = 'datetime',
}: DateConverterProps) {
  const t = useTranslations();
  const dateObj = new Date(date);
  const locale = useLocale();

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer underline">
          {new Intl.DateTimeFormat(locale, dateFormats[displayType]).format(
            dateObj,
          )}
        </span>
      </HoverCardTrigger>
      <Portal>
        <HoverCardContent className="w-80">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold">
              {t('general.time_conversion')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-sm font-medium">UTC</p>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                    timeZone: 'UTC',
                  }).format(dateObj)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                    timeZone: 'UTC',
                  }).format(dateObj)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium">
                  {Intl.DateTimeFormat().resolvedOptions().timeZone}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    hour: 'numeric',
                    minute: 'numeric',
                    second: 'numeric',
                  }).format(dateObj)}
                </p>
                <p className="text-sm text-muted-foreground">
                  {new Intl.DateTimeFormat(locale, {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  }).format(dateObj)}
                </p>
              </div>
            </div>
          </div>
        </HoverCardContent>
      </Portal>
    </HoverCard>
  );
}
