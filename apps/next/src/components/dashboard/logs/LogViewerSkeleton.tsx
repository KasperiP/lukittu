'use client';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ChevronLeft, Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function LogViewerRightSkeleton() {
  const t = useTranslations();

  return (
    <div className="p-4">
      <div className="mb-4 flex items-center">
        <Button className="mr-2 md:hidden" variant="ghost">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <h2 className="flex-grow truncate text-lg font-semibold">
          <Skeleton className="h-6 w-1/2" />
        </h2>
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">{t('general.code')}</p>
          <Skeleton className="h-4 w-8" />
        </div>
        <div>
          <p className="text-sm text-muted-foreground">ID</p>
          <div className="text-sm">
            <span className="flex items-center gap-2">
              <Copy className="h-4 w-4 shrink-0" />
              <TooltipProvider>
                <Tooltip delayDuration={0}>
                  <TooltipTrigger asChild>
                    <span
                      className="truncate text-primary hover:underline"
                      role="button"
                    >
                      <Skeleton className="h-4 w-24" />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{t('general.click_to_copy')}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </span>
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t('general.created_at')}
          </p>
          <div className="text-sm">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t('general.ip_address')}
          </p>
          <div className="flex items-center gap-2 truncate text-sm">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('general.device')}</p>
          <div className="text-sm">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">{t('general.origin')}</p>
          <div className="text-sm">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <div>
          <p className="text-sm text-muted-foreground">
            {t('dashboard.licenses.status')}
          </p>
          <div className="text-sm">
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
      </div>
      <Separator className="my-4" />
      <h3 className="mb-2 font-semibold">{t('dashboard.logs.request_body')}</h3>
      <pre className="overflow-x-auto rounded-md bg-muted p-4">
        <code>
          <Skeleton className="h-24 w-full" />
        </code>
      </pre>
      <h3 className="mb-2 mt-4 font-semibold">
        {t('dashboard.logs.response_body')}
      </h3>
      <pre className="overflow-x-auto rounded-md bg-muted p-4">
        <code>
          <Skeleton className="h-4 w-24" />
        </code>
      </pre>
    </div>
  );
}

export function LogViewerLeftSkeleton() {
  return Array.from({ length: 8 }).map((_, index) => (
    <div key={index} className="mb-4">
      <h3 className="mb-2 text-sm font-normal text-muted-foreground">
        <Skeleton className="h-4 w-full max-w-24" />
      </h3>
      <Separator className="mb-2" />
      <div className="grid grid-cols-1 gap-2">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="mb-2">
            <Button
              className="w-full justify-start gap-2 text-left"
              variant="ghost"
            >
              <Skeleton className="h-4 w-8" />
              <span className="mr-2">
                <Skeleton className="h-4 w-8" />
              </span>
              <span className="truncate text-muted-foreground">
                <Skeleton className="h-4 w-full" />
              </span>
              <Skeleton className="h-4 w-full" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  ));
}
