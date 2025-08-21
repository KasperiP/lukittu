import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { ITeamsSettingsValidationEditResponse } from '@/app/api/(dashboard)/teams/settings/validation/route';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  SetTeamValidationSettingsSchema,
  setTeamValidationSettingsSchema,
} from '@/lib/validation/team/set-team-validation-settings-schema';
import { zodResolver } from '@hookform/resolvers/zod';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

// Time unit multipliers (to convert to minutes)
const TIME_UNITS = {
  minutes: { label: 'Minutes', multiplier: 1 },
  hours: { label: 'Hours', multiplier: 60 },
  days: { label: 'Days', multiplier: 60 * 24 },
  weeks: { label: 'Weeks', multiplier: 60 * 24 * 7 },
  months: { label: 'Months', multiplier: 60 * 24 * 30 },
} as const;

type TimeUnit = keyof typeof TIME_UNITS;

interface DurationValue {
  value: number | null;
  unit: TimeUnit;
}

// Helper functions to convert between minutes and duration format
const minutesToDuration = (minutes: number | null): DurationValue => {
  if (minutes === null) return { value: null, unit: 'minutes' };

  // Find the best unit (largest unit that results in a whole number)
  const units: TimeUnit[] = ['months', 'weeks', 'days', 'hours', 'minutes'];

  for (const unit of units) {
    const multiplier = TIME_UNITS[unit].multiplier;
    if (minutes % multiplier === 0 && minutes >= multiplier) {
      return { value: minutes / multiplier, unit };
    }
  }

  return { value: minutes, unit: 'minutes' };
};

const durationToMinutes = (duration: DurationValue): number | null => {
  if (duration.value === null) return null;
  return duration.value * TIME_UNITS[duration.unit].multiplier;
};

interface TeamValidationSettingsProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

export default function TeamValidationSettings({
  team,
}: TeamValidationSettingsProps) {
  const t = useTranslations();
  const [loading, setLoading] = useState(false);

  // State for duration inputs
  const [hwidDuration, setHwidDuration] = useState<DurationValue>({
    value: null,
    unit: 'minutes',
  });
  const [ipDuration, setIpDuration] = useState<DurationValue>({
    value: null,
    unit: 'minutes',
  });

  const form = useForm<SetTeamValidationSettingsSchema>({
    resolver: zodResolver(setTeamValidationSettingsSchema(t)),
    defaultValues: {
      strictCustomers: false,
      strictProducts: false,
      strictReleases: false,
      hwidTimeout: null,
      ipTimeout: null,
    },
  });

  const { reset, handleSubmit, control, setValue } = form;

  useEffect(() => {
    const settings = {
      strictCustomers: team?.settings.strictCustomers ?? false,
      strictProducts: team?.settings.strictProducts ?? false,
      strictReleases: team?.settings.strictReleases ?? false,
      hwidTimeout: team?.settings.hwidTimeout ?? null,
      ipTimeout: team?.settings.ipTimeout ?? null,
    };

    reset(settings);

    // Initialize duration states
    setHwidDuration(minutesToDuration(settings.hwidTimeout));
    setIpDuration(minutesToDuration(settings.ipTimeout));
  }, [team, reset]);

  // Update form values when duration changes
  const handleHwidDurationChange = (duration: DurationValue) => {
    setHwidDuration(duration);
    setValue('hwidTimeout', durationToMinutes(duration));
  };

  const handleIpDurationChange = (duration: DurationValue) => {
    setIpDuration(duration);
    setValue('ipTimeout', durationToMinutes(duration));
  };

  const onSubmit = async (payload: SetTeamValidationSettingsSchema) => {
    setLoading(true);
    try {
      const response = await fetch('/api/teams/settings/validation', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data =
        (await response.json()) as ITeamsSettingsValidationEditResponse;

      if ('message' in data) {
        toast.error(data.message);
        return;
      }

      toast.success(t('dashboard.settings.team_settings_updated'));
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
          {t('dashboard.settings.validation_settings')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form
            className="space-y-4 max-md:px-2"
            onSubmit={handleSubmit(onSubmit)}
          >
            <FormField
              control={control}
              name="strictCustomers"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.settings.strict_customers')}
                  </FormLabel>
                  <Select
                    value={`${field.value}`}
                    onValueChange={(value) => field.onChange(value === 'true')}
                  >
                    <FormControl>
                      <SelectTrigger disabled={!team || loading}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="strictProducts"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.settings.strict_products')}
                  </FormLabel>
                  <Select
                    value={`${field.value}`}
                    onValueChange={(value) => field.onChange(value === 'true')}
                  >
                    <FormControl>
                      <SelectTrigger disabled={!team || loading}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={control}
              name="strictReleases"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {t('dashboard.settings.strict_releases')}
                  </FormLabel>
                  <Select
                    value={`${field.value}`}
                    onValueChange={(value) => field.onChange(value === 'true')}
                  >
                    <FormControl>
                      <SelectTrigger disabled={!team || loading}>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* HWID Timeout with Duration Input */}
            <FormField
              control={control}
              name="hwidTimeout"
              render={() => (
                <FormItem>
                  <FormLabel>{t('dashboard.settings.hwid_timeout')}</FormLabel>
                  <div className="flex space-x-2">
                    <FormControl>
                      <Input
                        disabled={!team || loading}
                        min={1}
                        placeholder={t('general.duration')}
                        type="number"
                        value={hwidDuration.value ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) {
                            handleHwidDurationChange({
                              ...hwidDuration,
                              value: null,
                            });
                          } else {
                            const numValue = Math.max(1, +value);
                            handleHwidDurationChange({
                              ...hwidDuration,
                              value: numValue,
                            });
                          }
                        }}
                      />
                    </FormControl>
                    <Select
                      value={hwidDuration.unit}
                      onValueChange={(unit: TimeUnit) =>
                        handleHwidDurationChange({ ...hwidDuration, unit })
                      }
                    >
                      <FormControl>
                        <SelectTrigger
                          className="w-32"
                          disabled={!team || loading}
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(TIME_UNITS).map(([key, { label }]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* IP Timeout with Duration Input */}
            <FormField
              control={control}
              name="ipTimeout"
              render={() => (
                <FormItem>
                  <FormLabel>{t('dashboard.settings.ip_timeout')}</FormLabel>
                  <div className="flex space-x-2">
                    <FormControl>
                      <Input
                        disabled={!team || loading}
                        min={1}
                        placeholder={t('general.duration')}
                        type="number"
                        value={ipDuration.value ?? ''}
                        onChange={(e) => {
                          const value = e.target.value;
                          if (!value) {
                            handleIpDurationChange({
                              ...ipDuration,
                              value: null,
                            });
                          } else {
                            const numValue = Math.max(1, +value);
                            handleIpDurationChange({
                              ...ipDuration,
                              value: numValue,
                            });
                          }
                        }}
                      />
                    </FormControl>
                    <Select
                      value={ipDuration.unit}
                      onValueChange={(unit: TimeUnit) =>
                        handleIpDurationChange({ ...ipDuration, unit })
                      }
                    >
                      <FormControl>
                        <SelectTrigger
                          className="w-32"
                          disabled={!team || loading}
                        >
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(TIME_UNITS).map(([key, { label }]) => (
                          <SelectItem key={key} value={key}>
                            {label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <LoadingButton
          pending={loading}
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
