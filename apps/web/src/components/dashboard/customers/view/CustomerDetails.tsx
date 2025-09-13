import { ICustomerGetSuccessResponse } from '@/app/api/(dashboard)/customers/[slug]/route';
import { DateConverter } from '@/components/shared/DateConverter';
import { ClickableIdentifier } from '@/components/shared/misc/ClickableIdentifier';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { getDiscordAvatarUrl } from '@/lib/providers/discord';
import { User } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useState } from 'react';

interface CustomerDetailsProps {
  customer: ICustomerGetSuccessResponse['customer'] | null;
}

export function CustomerDetails({ customer }: CustomerDetailsProps) {
  const [showMore, setShowMore] = useState(false);
  const t = useTranslations();

  const getDiscordDisplayName = (
    discordAccount: NonNullable<typeof customer>['discordAccount'],
  ) => {
    if (!discordAccount) return '';

    return discordAccount.username;
  };

  const hasAddressData = (address: NonNullable<typeof customer>['address']) => {
    if (!address) return false;
    return Boolean(
      address.line1 ||
        address.city ||
        address.country ||
        address.postalCode ||
        address.state,
    );
  };

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center gap-2 border-b py-5">
        <CardTitle className="flex items-center text-xl font-bold">
          {t('general.details')}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">ID</h3>
            <div className="text-sm font-semibold">
              {customer ? (
                <ClickableIdentifier value={customer.id} />
              ) : (
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-4 shrink-0" />
                  <Skeleton className="h-4 w-48" />
                </div>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('general.email')}</h3>
            <div className="text-sm text-muted-foreground">
              {customer ? customer.email : <Skeleton className="h-4 w-56" />}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('general.full_name')}</h3>
            <div className="text-sm text-muted-foreground">
              {customer ? (
                customer.fullName ? (
                  customer.fullName
                ) : (
                  t('general.unknown')
                )
              ) : (
                <Skeleton className="h-4 w-40" />
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('general.username')}</h3>
            <div className="text-sm text-muted-foreground">
              {customer ? (
                customer.username ? (
                  customer.username
                ) : (
                  t('general.unknown')
                )
              ) : (
                <Skeleton className="h-4 w-40" />
              )}
            </div>
          </div>

          {/* Discord Connection Section */}
          {customer?.discordAccount && (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold">Discord</h3>
              <div className="flex items-center gap-3 text-sm text-muted-foreground">
                <Avatar className="h-8 w-8">
                  <AvatarImage
                    alt={getDiscordDisplayName(customer.discordAccount)}
                    src={
                      getDiscordAvatarUrl(
                        customer.discordAccount.discordId,
                        customer.discordAccount.avatar,
                      ) ?? undefined
                    }
                  />
                  <AvatarFallback className="bg-[#5865F2] text-xs text-white">
                    {customer.discordAccount.username.slice(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className="font-medium">
                      {getDiscordDisplayName(customer.discordAccount)}
                    </span>
                    <Badge
                      className="flex-shrink-0 text-xs"
                      variant="secondary"
                    >
                      @{customer.discordAccount.username}
                    </Badge>
                  </div>
                  <ClickableIdentifier
                    className="mt-1 text-xs text-muted-foreground"
                    value={customer.discordAccount.discordId}
                  >
                    {customer.discordAccount.discordId}
                  </ClickableIdentifier>
                </div>
              </div>
            </div>
          )}

          {/* Address Section */}
          {customer?.address && hasAddressData(customer.address) && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.address')}
                </h3>
              </div>
              <div className="space-y-0.5 text-sm text-muted-foreground">
                {customer.address.line1 && <div>{customer.address.line1}</div>}
                {customer.address.line2 && <div>{customer.address.line2}</div>}
                {(customer.address.city ||
                  customer.address.state ||
                  customer.address.postalCode) && (
                  <div>
                    {[
                      customer.address.city,
                      customer.address.state,
                      customer.address.postalCode,
                    ]
                      .filter(Boolean)
                      .join(', ')}
                  </div>
                )}
                {customer.address.country && (
                  <div>{customer.address.country}</div>
                )}
              </div>
            </div>
          )}

          {showMore && (
            <>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.created_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {customer ? (
                    <DateConverter date={customer.createdAt} />
                  ) : (
                    <Skeleton className="h-4 w-28" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.updated_at')}
                </h3>
                <div className="text-sm text-muted-foreground">
                  {customer ? (
                    <DateConverter date={customer.updatedAt} />
                  ) : (
                    <Skeleton className="h-4 w-28" />
                  )}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold">
                  {t('general.created_by')}
                </h3>
                <div className="text-sm font-semibold">
                  {customer ? (
                    customer.createdBy ? (
                      <span className="flex items-center gap-2">
                        <User className="h-4 w-4 shrink-0" />
                        <Link
                          className="text-primary hover:underline"
                          href={`/dashboard/team/members?memberId=${customer.createdBy.id}`}
                        >
                          {customer.createdBy.fullName}
                        </Link>
                      </span>
                    ) : (
                      t('general.unknown')
                    )
                  ) : (
                    <div className="flex items-center gap-2">
                      <Skeleton className="h-4 w-4 shrink-0" />
                      <Skeleton className="h-4 w-24" />
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <Button
          className="mt-2 px-0"
          size="sm"
          variant="link"
          onClick={() => setShowMore(!showMore)}
        >
          {showMore ? t('general.show_less') : t('general.show_more')}
        </Button>
      </CardContent>
    </Card>
  );
}
