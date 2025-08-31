import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { ITeamsSettingsCleanupEditResponse } from '@/app/api/(dashboard)/teams/settings/cleanup/route';
import LoadingButton from '@/components/shared/LoadingButton';
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import {
  SetTeamCleanupSettingsSchema,
  setTeamCleanupSettingsSchema,
} from '@/lib/validation/team/set-team-cleanup-settings-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

interface TeamCleanupSettingsProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

export default function TeamCleanupSettings({
  team,
}: TeamCleanupSettingsProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);
  const [expiredLicenseCleanupEnabled, setExpiredLicenseCleanupEnabled] =
    useState(false);
  const [danglingCustomerCleanupEnabled, setDanglingCustomerCleanupEnabled] =
    useState(false);

  const form = useForm<SetTeamCleanupSettingsSchema>({
    resolver: zodResolver(setTeamCleanupSettingsSchema(t)),
    defaultValues: {
      expiredLicenseCleanupDays: null,
      danglingCustomerCleanupDays: null,
    },
  });

  const { handleSubmit, reset, setError, control, watch, setValue } = form;

  // Watch the form values to sync with enabled states
  const expiredLicenseCleanupDays = watch('expiredLicenseCleanupDays');
  const danglingCustomerCleanupDays = watch('danglingCustomerCleanupDays');

  useEffect(() => {
    if (team?.settings) {
      const settings = team.settings;

      // Set form values
      reset({
        expiredLicenseCleanupDays: settings.expiredLicenseCleanupDays,
        danglingCustomerCleanupDays: settings.danglingCustomerCleanupDays,
      });

      // Set enabled states based on whether values exist
      setExpiredLicenseCleanupEnabled(
        settings.expiredLicenseCleanupDays !== null,
      );
      setDanglingCustomerCleanupEnabled(
        settings.danglingCustomerCleanupDays !== null,
      );
    }
  }, [team, reset]);

  // Handle enabling/disabling cleanup options
  const handleExpiredLicenseCleanupToggle = (enabled: boolean) => {
    setExpiredLicenseCleanupEnabled(enabled);
    if (!enabled) {
      setValue('expiredLicenseCleanupDays', null);
    } else if (expiredLicenseCleanupDays === null) {
      setValue('expiredLicenseCleanupDays', 30); // Default to 30 days
    }
  };

  const handleDanglingCustomerCleanupToggle = (enabled: boolean) => {
    setDanglingCustomerCleanupEnabled(enabled);
    if (!enabled) {
      setValue('danglingCustomerCleanupDays', null);
    } else if (danglingCustomerCleanupDays === null) {
      setValue('danglingCustomerCleanupDays', 90); // Default to 90 days
    }
  };

  const handleCleanupEdit = async (payload: SetTeamCleanupSettingsSchema) => {
    const response = await fetch('/api/teams/settings/cleanup', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });

    const data = (await response.json()) as ITeamsSettingsCleanupEditResponse;

    return data;
  };

  const onSubmit = async (data: SetTeamCleanupSettingsSchema) => {
    setLoading(true);
    try {
      const res = await handleCleanupEdit(data);

      if ('message' in res) {
        if (res.field) {
          return setError(res.field as keyof SetTeamCleanupSettingsSchema, {
            type: 'manual',
            message: res.message,
          });
        }

        return toast.error(res.message);
      }

      toast.success(t('dashboard.settings.cleanup_settings_updated'));
    } catch (error: any) {
      toast.error(error.message ?? t('general.error_occurred'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-xl font-bold">
          {t('dashboard.settings.cleanup_settings')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="space-y-4 max-md:px-2"
            onSubmit={handleSubmit(onSubmit)}
          >
            {/* Expired License Cleanup */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={expiredLicenseCleanupEnabled}
                  id="expired-license-cleanup"
                  onCheckedChange={handleExpiredLicenseCleanupToggle}
                />
                <FormLabel
                  className="text-sm font-medium"
                  htmlFor="expired-license-cleanup"
                >
                  {t('dashboard.settings.expired_license_cleanup')}
                </FormLabel>
              </div>

              {expiredLicenseCleanupEnabled && (
                <FormField
                  control={control}
                  name="expiredLicenseCleanupDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('dashboard.settings.expired_license_cleanup_days')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          max="1825"
                          min="1"
                          placeholder="30"
                          type="number"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const value =
                              e.target.value === ''
                                ? null
                                : parseInt(e.target.value, 10);
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'dashboard.settings.expired_license_cleanup_description',
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>

            {/* Dangling Customer Cleanup */}
            <div className="space-y-4">
              <div className="flex items-center space-x-2">
                <Switch
                  checked={danglingCustomerCleanupEnabled}
                  id="dangling-customer-cleanup"
                  onCheckedChange={handleDanglingCustomerCleanupToggle}
                />
                <FormLabel
                  className="text-sm font-medium"
                  htmlFor="dangling-customer-cleanup"
                >
                  {t('dashboard.settings.dangling_customer_cleanup')}
                </FormLabel>
              </div>

              {danglingCustomerCleanupEnabled && (
                <FormField
                  control={control}
                  name="danglingCustomerCleanupDays"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {t('dashboard.settings.dangling_customer_cleanup_days')}
                      </FormLabel>
                      <FormControl>
                        <Input
                          max="1825"
                          min="1"
                          placeholder="90"
                          type="number"
                          {...field}
                          value={field.value ?? ''}
                          onChange={(e) => {
                            const value =
                              e.target.value === ''
                                ? null
                                : parseInt(e.target.value, 10);
                            field.onChange(value);
                          }}
                        />
                      </FormControl>
                      <FormDescription>
                        {t(
                          'dashboard.settings.dangling_customer_cleanup_description',
                        )}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <LoadingButton
          pending={loading || !team}
          size="sm"
          type="submit"
          variant="secondary"
          onClick={handleSubmit(onSubmit)}
        >
          <Save className="mr-2 h-4 w-4" />
          {t('general.save')}
        </LoadingButton>
      </CardFooter>
    </Card>
  );
}
