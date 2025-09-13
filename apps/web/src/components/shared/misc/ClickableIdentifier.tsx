'use client';

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils/tailwind-helpers';
import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

interface ClickableIdentifierProps {
  value: string;
  children?: React.ReactNode;
  className?: string;
}

export function ClickableIdentifier({
  value,
  children,
  className,
}: ClickableIdentifierProps) {
  const t = useTranslations();

  const handleCopy = () => {
    navigator.clipboard.writeText(value);
    toast.success(t('general.copied_to_clipboard'));
  };

  return (
    <span className={cn('flex items-center gap-2', className)}>
      <Copy className="h-4 w-4 shrink-0" />
      <TooltipProvider>
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <span
              className="cursor-pointer truncate text-primary hover:underline"
              role="button"
              onClick={handleCopy}
            >
              {children || value}
            </span>
          </TooltipTrigger>
          <TooltipContent>
            <p>{t('general.click_to_copy')}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </span>
  );
}
