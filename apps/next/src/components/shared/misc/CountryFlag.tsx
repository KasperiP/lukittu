'use client';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { useTranslations } from 'next-intl';
import Image from 'next/image';

interface CountryFlagProps {
  countryCode: string | null;
  countryName: string | null;
}

export function CountryFlag({ countryCode, countryName }: CountryFlagProps) {
  const t = useTranslations();

  const FlagImage = (
    <Image
      alt={countryCode ?? t('general.unknown')}
      className="rounded-[2px]"
      height={20}
      src={`/countries/${countryCode?.toLowerCase()}.svg`}
      width={20}
      onError={(e) => {
        e.preventDefault();
        (e.target as HTMLImageElement).src = '/countries/unknown.svg';
      }}
    />
  );

  if (!countryName) return FlagImage;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{FlagImage}</TooltipTrigger>
        <TooltipContent>
          <p>{countryName}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
