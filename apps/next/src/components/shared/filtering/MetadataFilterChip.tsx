import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { metadataSchema } from '@/lib/validation/shared/metadata-schema';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { FilterChip } from '../FilterChip';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import { TeamContext } from '@/providers/TeamProvider';
import { useContext, useState } from 'react';
import useSWR from 'swr';
import {
  IMetadataGetResponse,
  IMetadataGetSuccessResponse,
} from '@/app/api/(dashboard)/metadata/route';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils/tailwind-helpers';
import { LoadingSpinner } from '@/components/shared/LoadingSpinner';

interface MetadataFilterChipProps {
  metadataKey: string;
  metadataValue: string;
  tempMetadataKey: string;
  tempMetadataValue: string;
  setMetadataKey: (key: string) => void;
  setMetadataValue: (value: string) => void;
  setTempMetadataKey: (key: string) => void;
  setTempMetadataValue: (value: string) => void;
}

export function MetadataFilterChip({
  metadataKey,
  metadataValue,
  tempMetadataKey,
  tempMetadataValue,
  setMetadataKey,
  setMetadataValue,
  setTempMetadataKey,
  setTempMetadataValue,
}: MetadataFilterChipProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useSWR<IMetadataGetSuccessResponse>(
    teamCtx.selectedTeam ? ['/api/metadata', teamCtx.selectedTeam] : null,
    async ([url, _]) => {
      const response = await fetch(url);
      const data = (await response.json()) as IMetadataGetResponse;
      if ('message' in data) throw new Error(data.message);
      return data;
    },
  );

  const existingMetadataKeys = data?.metadata.map((m) => m.key) || [];

  return (
    <FilterChip
      activeValue={
        metadataKey && metadataValue
          ? `${metadataKey}: ${metadataValue}`
          : t('general.metadata')
      }
      disabled={Boolean(!tempMetadataKey || !tempMetadataValue)}
      isActive={Boolean(metadataKey && metadataValue)}
      label={t('general.metadata')}
      popoverTitle={t('general.metadata')}
      onApply={async () => {
        try {
          await metadataSchema(t).parseAsync([
            {
              key: tempMetadataKey,
              value: tempMetadataValue,
              locked: false,
            },
          ]);
          setMetadataKey(tempMetadataKey);
          setMetadataValue(tempMetadataValue);
        } catch (error) {
          setTempMetadataKey('');
          setTempMetadataValue('');
          toast.error(t('validation.invalid_metadata'));
        }
      }}
      onClear={() => {
        setTempMetadataKey(metadataKey);
        setTempMetadataValue(metadataValue);
      }}
      onReset={() => {
        setMetadataKey('');
        setMetadataValue('');
        setTempMetadataKey('');
        setTempMetadataValue('');
      }}
    >
      <div className="flex flex-col gap-4">
        <div>
          <Label htmlFor="metadata-key">{t('general.key')}</Label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button
                className="mt-2 w-full justify-between"
                disabled={isLoading}
                role="combobox"
                variant="outline"
              >
                {isLoading ? (
                  <LoadingSpinner className="mr-2 h-4 w-4" />
                ) : tempMetadataKey ? (
                  existingMetadataKeys.find((key) => key === tempMetadataKey)
                ) : (
                  t('general.select_key')
                )}
                <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              className="popover-content-width-full w-full p-0"
            >
              <Command>
                <CommandInput
                  className="h-9"
                  disabled={isLoading}
                  placeholder={t('general.search_keys')}
                />
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <LoadingSpinner className="h-6 w-6" />
                  </div>
                ) : (
                  <>
                    <CommandEmpty>{t('general.no_results')}</CommandEmpty>
                    <CommandGroup>
                      {existingMetadataKeys.map((key) => (
                        <CommandItem
                          key={key}
                          value={key}
                          onSelect={() => {
                            setTempMetadataKey(key);
                            setOpen(false);
                          }}
                        >
                          {key}
                          <Check
                            className={cn(
                              'ml-auto h-4 w-4',
                              tempMetadataKey === key
                                ? 'opacity-100'
                                : 'opacity-0',
                            )}
                          />
                        </CommandItem>
                      ))}
                    </CommandGroup>
                  </>
                )}
              </Command>
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <Label htmlFor="metadata-value">{t('general.value')}</Label>
          <Input
            className="mt-2"
            id="metadata-value"
            placeholder={t('general.value')}
            value={tempMetadataValue}
            onChange={(e) => setTempMetadataValue(e.target.value)}
          />
        </div>
      </div>
    </FilterChip>
  );
}
