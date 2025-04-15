import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from '@/components/ui/hover-card';
import { TriangleAlert } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function WarningIndicator() {
  const t = useTranslations();

  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <div className="cursor-pointer rounded-full p-1.5 transition-colors hover:bg-yellow-500/10">
          <TriangleAlert className="h-4 w-4 text-yellow-500 transition-transform hover:scale-110" />
        </div>
      </HoverCardTrigger>
      <HoverCardContent className="w-80">
        <div className="space-y-2">
          <h4 className="text-sm font-semibold">
            {t('dashboard.releases.no_latest_release')}
          </h4>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.releases.no_latest_release_description')}
          </p>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
