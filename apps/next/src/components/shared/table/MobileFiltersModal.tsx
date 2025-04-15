import LoadingButton from '@/components/shared/LoadingButton';
import { Input } from '@/components/ui/input';
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from '@/components/ui/responsive-dialog';
import { Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import React, { useState } from 'react';

interface MobileFilterOption {
  type: 'search' | 'multiselect';
  key: string;
  placeholder?: string;
  component?: React.ComponentType<{
    value?: string[];
    onChange: (value: string[], isClear?: boolean) => void;
    selectedProducts?: any[];
    selectedCustomers?: any[];
  }>;
}

interface MobileFilterModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  filterOptions: MobileFilterOption[];
  initialFilters: Record<string, any>;
  onApply: (filters: Record<string, any>) => void;
}

export default function MobileFilterModal({
  open,
  onOpenChange,
  title,
  filterOptions,
  initialFilters,
  onApply,
}: MobileFilterModalProps) {
  const t = useTranslations();
  const [tempFilters, setTempFilters] = useState(initialFilters);

  const handleOpenChange = (open: boolean) => {
    onOpenChange(open);
  };

  const handleApply = () => {
    onApply(tempFilters);
    handleOpenChange(false);
  };

  const updateFilter = (key: string, value: any) => {
    setTempFilters((prev) => ({ ...prev, [key]: value }));
  };

  return (
    <ResponsiveDialog open={open} onOpenChange={handleOpenChange}>
      <ResponsiveDialogContent className="sm:max-w-[625px]">
        <ResponsiveDialogHeader>
          <ResponsiveDialogTitle>{title}</ResponsiveDialogTitle>
        </ResponsiveDialogHeader>
        <form
          className="flex flex-col gap-4 max-md:px-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleApply();
          }}
        >
          {filterOptions.map((option) => (
            <div key={option.key}>
              {option.type === 'search' && (
                <div className="relative flex w-full items-center max-lg:w-full">
                  <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 transform" />
                  <Input
                    className="pl-8"
                    placeholder={option.placeholder || ''}
                    value={tempFilters[option.key] || ''}
                    onChange={(e) => updateFilter(option.key, e.target.value)}
                  />
                </div>
              )}
              {option.type === 'multiselect' && option.component && (
                <option.component
                  value={tempFilters[option.key] || []}
                  onChange={(value: any) => updateFilter(option.key, value)}
                />
              )}
            </div>
          ))}
        </form>
        <ResponsiveDialogFooter>
          <div>
            <LoadingButton
              className="w-full"
              variant="outline"
              onClick={() => handleOpenChange(false)}
            >
              {t('general.close')}
            </LoadingButton>
          </div>
          <div>
            <LoadingButton className="w-full" onClick={handleApply}>
              {t('general.apply')}
            </LoadingButton>
          </div>
        </ResponsiveDialogFooter>
      </ResponsiveDialogContent>
    </ResponsiveDialog>
  );
}
