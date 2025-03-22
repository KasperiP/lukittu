'use client';
import buildByBitSvg from '@/../public/integrations/buildbybit.svg';
import stripeSvg from '@/../public/integrations/stripe.svg';
import {
  ITeamsIntegrationsGetResponse,
  ITeamsIntegrationsGetSuccessResponse,
} from '@/app/api/(dashboard)/teams/integrations/route';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { TeamContext } from '@/providers/TeamProvider';
import { CheckCircle, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useContext, useEffect, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';
import SetBuildByBitIntegrationModal from './modals/SetBuildByBitIntegrationModal';
import SetStripeIntegrationModal from './modals/SetStripeIntegrationModal';

interface InitialIntegration {
  name: string;
  description: string;
  logo: any;
  key: keyof ITeamsIntegrationsGetSuccessResponse['integrations'];
}

const initialIntegrations: InitialIntegration[] = [
  {
    name: 'Stripe',
    description:
      'Stripe is a suite of payment APIs that powers commerce for businesses of all sizes.',
    logo: stripeSvg,
    key: 'stripeIntegration',
  },
  {
    name: 'BuildByBit',
    description:
      'The largest independent marketplace for buying and selling gaming-related goods and services.',
    logo: buildByBitSvg,
    key: 'buildByBitIntegration',
  },
];

const fetchIntegrations = async (url: string) => {
  const res = await fetch(url);
  const data = (await res.json()) as ITeamsIntegrationsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data.integrations;
};

export default function IntegrationsGrid() {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [openSetupModal, setOpenSetupModal] = useState<
    keyof ITeamsIntegrationsGetSuccessResponse['integrations'] | null
  >(null);

  const {
    data: integrations,
    error,
    isLoading,
    mutate,
  } = useSWR<ITeamsIntegrationsGetSuccessResponse['integrations']>(
    teamCtx.selectedTeam
      ? ['/api/teams/integrations', teamCtx.selectedTeam]
      : null,
    ([url]) => fetchIntegrations(url),
  );

  useEffect(() => {
    if (error) {
      toast.error(error.message ?? t('general.error_occurred'));
    }
  }, [error, t]);

  const handleIntegrationModalClose = (open: boolean) => {
    mutate();
    setOpenSetupModal(null);
  };

  return (
    <>
      <SetStripeIntegrationModal
        open={openSetupModal === 'stripeIntegration'}
        stripeIntegration={integrations?.stripeIntegration ?? null}
        onOpenChange={handleIntegrationModalClose}
      />
      <SetBuildByBitIntegrationModal
        buildByBitIntegration={integrations?.buildByBitIntegration ?? null}
        open={openSetupModal === 'buildByBitIntegration'}
        onOpenChange={handleIntegrationModalClose}
      />
      <div className="grid grid-cols-3 gap-6 max-xl:grid-cols-2 max-md:grid-cols-1">
        {initialIntegrations.map((integration) => (
          <Card key={integration.name} className="flex flex-col">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-2xl font-bold">
                {integration.name}
              </CardTitle>
              <Image
                alt={integration.name}
                height={30}
                src={integration.logo}
              />
            </CardHeader>
            <CardContent className="flex-grow">
              <CardDescription>{integration.description}</CardDescription>
            </CardContent>
            <CardFooter className="mt-auto flex items-center justify-between">
              <Badge
                variant={
                  integrations?.[integration.key]?.active
                    ? 'success'
                    : 'secondary'
                }
              >
                {integrations?.[integration.key]?.active ? (
                  <>
                    <CheckCircle className="mr-1 h-3 w-3" />{' '}
                    {t('general.active')}
                  </>
                ) : (
                  <>
                    <XCircle className="mr-1 h-3 w-3" /> {t('general.inactive')}
                  </>
                )}
              </Badge>
              <Button
                disabled={isLoading}
                size="sm"
                variant={
                  integrations?.[integration.key] ? 'secondary' : 'default'
                }
                onClick={() => setOpenSetupModal(integration.key)}
              >
                {integrations?.[integration.key] ? 'Manage' : 'Setup'}
              </Button>
            </CardFooter>
          </Card>
        ))}
        <Card className="flex items-center justify-center p-6">
          <p className="text-sm text-muted-foreground">
            {t.rich('dashboard.integrations.need_integrations', {
              strong: (children) => <strong>{children}</strong>,
              emailElement: (children) => (
                <Link
                  className="font-semibold text-primary"
                  href="mailto:support@lukittu.com"
                >
                  {children}
                </Link>
              ),
            })}
          </p>
        </Card>
      </div>
    </>
  );
}
