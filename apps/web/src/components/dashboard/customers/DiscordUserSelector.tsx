'use client';

import {
  IDiscordUserGetResponse,
  IDiscordUserGetSuccessResponse,
} from '@/app/api/(dashboard)/discord/user/route';
import { DiscordAccountDisplay } from '@/components/shared/discord/DiscordAccountDisplay';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DiscordUser } from '@/lib/providers/discord';
import { SetCustomerSchema } from '@/lib/validation/customers/set-customer-schema';
import { regex } from '@lukittu/shared';
import { AlertCircle, Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Control, UseFormSetValue } from 'react-hook-form';
import useSWR from 'swr';

interface DiscordUserSelectorProps {
  control: Control<SetCustomerSchema>;
  setValue: UseFormSetValue<SetCustomerSchema>;
  discordId: string | null | undefined;
  currentCustomerId?: string | null;
  existingDiscordUser?: {
    discordId: string;
    username: string;
    avatar: string | null;
    globalName: string | null;
  } | null;
}

const normalizeDiscordUser = (user: DiscordUser): DiscordUser => ({
  id: user.id,
  username: user.username,
  avatar: user.avatar,
  global_name: user.global_name,
  discriminator: user.discriminator || '',
});

const convertExistingToDiscordUser = (existing: {
  discordId: string;
  username: string;
  avatar: string | null;
  globalName: string | null;
}): DiscordUser => ({
  id: existing.discordId,
  username: existing.username,
  avatar: existing.avatar,
  global_name: existing.globalName,
  discriminator: '',
});

const fetchDiscordUser = async (url: string) => {
  const res = await fetch(url);
  const data = (await res.json()) as IDiscordUserGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

export default function DiscordUserSelector({
  control,
  setValue,
  discordId,
  currentCustomerId,
  existingDiscordUser,
}: DiscordUserSelectorProps) {
  const t = useTranslations();
  const [debouncedDiscordId, setDebouncedDiscordId] = useState<string | null>(
    null,
  );

  // Debounce the Discord ID input
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      if (
        discordId &&
        regex.discordId.test(discordId) &&
        discordId.length >= 17
      ) {
        try {
          if (BigInt(discordId) <= BigInt('9223372036854775807')) {
            setDebouncedDiscordId(discordId);
          } else {
            setDebouncedDiscordId(null);
          }
        } catch {
          setDebouncedDiscordId(null);
        }
      } else {
        setDebouncedDiscordId(null);
      }
    }, 500);

    return () => clearTimeout(timeoutId);
  }, [discordId]);

  const { data, error, isLoading } = useSWR<IDiscordUserGetSuccessResponse>(
    debouncedDiscordId
      ? `/api/discord/user?discordId=${encodeURIComponent(debouncedDiscordId)}`
      : null,
    fetchDiscordUser,
  );

  const apiDiscordUser: DiscordUser | null =
    data && 'user' in data ? data.user : null;

  const existingCustomer =
    data && 'existingCustomer' in data ? data.existingCustomer : null;

  const errorMessage = data && 'message' in data ? data.message : null;

  // Determine which Discord user to display (API data takes precedence)
  const discordUser: DiscordUser | null = (() => {
    if (apiDiscordUser) {
      return normalizeDiscordUser(apiDiscordUser);
    }

    // Fallback to existing Discord user if ID matches current input
    if (existingDiscordUser && discordId === existingDiscordUser.discordId) {
      return convertExistingToDiscordUser(existingDiscordUser);
    }

    return null;
  })();

  // Determine when to show loading skeleton
  const shouldShowLoadingSkeleton = Boolean(
    isLoading &&
      debouncedDiscordId &&
      !apiDiscordUser &&
      !existingDiscordUser &&
      !error &&
      !errorMessage,
  );

  return (
    <>
      <FormField
        control={control}
        name="discordId"
        render={({ field }) => (
          <FormItem>
            <FormLabel className="flex items-center gap-2">
              {t('dashboard.customers.discord_id')}
            </FormLabel>
            <FormControl>
              <div className="relative">
                <Input
                  {...field}
                  placeholder="123456789012345678"
                  value={field.value ?? ''}
                  onChange={(e) => {
                    if (!e.target.value) {
                      return setValue('discordId', null);
                    }
                    return setValue('discordId', e.target.value);
                  }}
                />
                {isLoading && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    <Loader2 className="h-4 w-4 animate-spin" />
                  </div>
                )}
              </div>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      {discordUser && (
        <Card>
          <CardContent className="p-4">
            <DiscordAccountDisplay
              discordAccount={{
                discordId: discordUser.id,
                username: discordUser.username,
                avatar: discordUser.avatar,
                globalName: discordUser.global_name,
              }}
              size="lg"
            />
          </CardContent>
        </Card>
      )}

      {existingCustomer && existingCustomer.id !== currentCustomerId && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="text-sm font-medium">
                {t('validation.discord_account_already_linked')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t.rich('dashboard.customers.discord_account_linked_to', {
                  customerName:
                    existingCustomer.fullName ||
                    existingCustomer.username ||
                    existingCustomer.email ||
                    t('general.unknown'),
                  link: (child) => (
                    <Link
                      className="font-medium text-primary underline hover:text-primary/80"
                      href={`/dashboard/customers/${existingCustomer.id}`}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      {child}
                    </Link>
                  ),
                })}
              </p>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {(errorMessage || error) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {errorMessage ||
              error?.message ||
              t('validation.discord_api_error')}
          </AlertDescription>
        </Alert>
      )}

      {shouldShowLoadingSkeleton && (
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="h-3 w-24" />
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  );
}
