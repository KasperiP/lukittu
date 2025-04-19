import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils/tailwind-helpers';
import { ChevronDown } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface FilterChipProps {
  label: string;
  popoverTitle?: string;
  isActive?: boolean;
  activeValue?: string | number;
  className?: string;
  children: React.ReactNode;
  disabled?: boolean;
  onApply?: () => void;
  onClear?: () => void;
  popoverContentClassName?: string;
  onPopoverOpenChange?: (open: boolean) => void;
  onReset?: () => void; // Add this new prop
}

export function FilterChip({
  label,
  popoverTitle,
  isActive,
  activeValue,
  className,
  disabled,
  children,
  onApply,
  onClear,
  popoverContentClassName,
  onPopoverOpenChange,
  onReset,
}: FilterChipProps) {
  const t = useTranslations();

  const [open, setOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      onClear?.();
    }
    setOpen(open);
    onPopoverOpenChange?.(open);
  };

  const handleClear = () => {
    // First reset
    onReset?.();
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          className={cn(
            'h-7 gap-1 rounded-full border-dashed text-xs',
            {
              'border-solid bg-secondary': isActive,
            },
            className,
          )}
          size="sm"
          variant="outline"
        >
          {isActive ? (
            <span className="flex items-center gap-2">
              <span className="text-muted-foreground">{label}</span>
              <span className="text-muted-foreground">|</span>
              <span className="font-medium text-primary">{activeValue}</span>
            </span>
          ) : (
            <span>{label}</span>
          )}
          <ChevronDown className="h-3 w-3 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn(
          'min-w-[280px] p-4 md:w-[var(--radix-popover-trigger-width)] md:min-w-[320px]',
          popoverContentClassName,
        )}
      >
        <div className="flex flex-col gap-4">
          <div className="space-y-4">
            {popoverTitle && (
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">{popoverTitle}</Label>
              </div>
            )}
            <div>{children}</div>
          </div>
          <div className="flex items-center justify-between border-t pt-4">
            <Button size="sm" variant="ghost" onClick={handleClear}>
              {t('general.clear')}
            </Button>
            <Button
              disabled={disabled}
              size="sm"
              onClick={() => {
                onApply?.();
                setOpen(false);
              }}
            >
              {t('general.apply')}
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
