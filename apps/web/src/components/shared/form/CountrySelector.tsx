import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { countries as initialCountries } from '@/lib/constants/countries';
import { iso3ToName } from '@/lib/utils/country-helpers';
import { cn } from '@/lib/utils/tailwind-helpers';
import { Check, ChevronsUpDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { CountryFlag } from '../misc/CountryFlag';

interface CountrySelectorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function CountrySelector({
  value: initialValue,
  onChange,
}: CountrySelectorProps) {
  const t = useTranslations();

  const initialCountry = iso3ToName(initialValue);

  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initialCountry || '');
  const [search, setSearch] = useState('');

  const countries = useMemo(
    () =>
      initialCountries.map(({ en_short_name, alpha_3_code, alpha_2_code }) => ({
        name: en_short_name,
        alpha3: alpha_3_code,
        alpha2: alpha_2_code,
      })),
    [],
  );

  const filteredCountries = useMemo(
    () =>
      countries.filter((country) =>
        country.name.toLowerCase().includes(search.toLowerCase()),
      ),
    [countries, search],
  );

  const visibleCountries = useMemo(
    () => filteredCountries.slice(0, 20),
    [filteredCountries],
  );

  return (
    <div className="flex w-full items-center gap-2">
      <Popover open={open} modal onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            aria-expanded={open}
            className="w-full justify-between"
            role="combobox"
            variant="outline"
          >
            {value
              ? countries.find((country) => country.name === value)?.alpha3 +
                ' ' +
                value
              : t('general.select_country')}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="popover-content-width-full w-full p-0">
          <Command>
            <CommandInput
              placeholder={t('general.search_country')}
              value={search}
              onValueChange={setSearch}
            />
            <CommandEmpty>{t('general.no_results')}</CommandEmpty>
            <CommandGroup>
              <CommandList>
                {visibleCountries.map((country) => (
                  <CommandItem
                    key={country.name}
                    value={country.name}
                    onSelect={(currentValue) => {
                      const iso3 = countries.find(
                        (c) => c.name === currentValue,
                      )?.alpha3;
                      setValue(currentValue === value ? '' : currentValue);
                      onChange(currentValue === value ? '' : iso3!);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === country.name ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    <CountryFlag
                      countryCode={country.alpha2}
                      countryName={country.name}
                    />
                    <span className="ml-2">{country.name}</span>
                  </CommandItem>
                ))}
              </CommandList>
            </CommandGroup>
          </Command>
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        onClick={() => {
          setValue('');
          onChange('');
        }}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
