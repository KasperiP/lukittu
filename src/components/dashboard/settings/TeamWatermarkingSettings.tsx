import { ITeamGetSuccessResponse } from '@/app/api/(dashboard)/teams/[slug]/route';
import { ITeamsSettingsWatermarkingEditResponse } from '@/app/api/(dashboard)/teams/settings/watermarking/route';
import LoadingButton from '@/components/shared/LoadingButton';
import { Badge } from '@/components/ui/badge';
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
} from '@/components/ui/form';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils/tailwind-helpers';
import { SetTeamWatermarkingSettingsSchema } from '@/lib/validation/team/set-team-watermarking-settings-schema';
import { TeamContext } from '@/providers/TeamProvider';
import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useContext, useEffect, useState } from 'react';
import { Control, useForm, useWatch } from 'react-hook-form';
import { toast } from 'sonner';

interface TeamWatermarkingSettingsProps {
  team: ITeamGetSuccessResponse['team'] | null;
}

const DEFAULT_VALUES: SetTeamWatermarkingSettingsSchema = {
  watermarkingEnabled: false,
  staticConstantPoolSynthesis: false,
  staticConstantPoolDensity: 0,
  dynamicBytecodeInjection: false,
  dynamicBytecodeDensity: 0,
  temporalAttributeEmbedding: false,
  temporalAttributeDensity: 0,
};

export default function TeamWatermarkingSettings({
  team,
}: TeamWatermarkingSettingsProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [loading, setLoading] = useState(false);

  const selectedTeam = teamCtx.teams.find(
    (team) => team.id === teamCtx.selectedTeam,
  );

  const hasWatermarkingPermission =
    selectedTeam?.limits?.allowWatermarking ?? false;

  const form = useForm<SetTeamWatermarkingSettingsSchema>({
    defaultValues: DEFAULT_VALUES,
  });

  const { handleSubmit, control, reset } = form;

  useEffect(() => {
    reset(
      hasWatermarkingPermission && team?.watermarkingSettings
        ? {
            watermarkingEnabled: team.watermarkingSettings.watermarkingEnabled,
            staticConstantPoolSynthesis:
              team.watermarkingSettings.staticConstantPoolSynthesis,
            staticConstantPoolDensity:
              team.watermarkingSettings.staticConstantPoolDensity,
            dynamicBytecodeInjection:
              team.watermarkingSettings.dynamicBytecodeInjection,
            dynamicBytecodeDensity:
              team.watermarkingSettings.dynamicBytecodeDensity,
            temporalAttributeEmbedding:
              team.watermarkingSettings.temporalAttributeEmbedding,
            temporalAttributeDensity:
              team.watermarkingSettings.temporalAttributeDensity,
          }
        : DEFAULT_VALUES,
    );
  }, [team, reset, hasWatermarkingPermission]);

  const onSubmit = async (payload: SetTeamWatermarkingSettingsSchema) => {
    setLoading(true);
    try {
      const response = await fetch('/api/teams/settings/watermarking', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      const data =
        (await response.json()) as ITeamsSettingsWatermarkingEditResponse;

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

  const isDisabled = !team || loading || !hasWatermarkingPermission;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center text-xl font-bold">
          {t('dashboard.settings.watermarking')}
          {!hasWatermarkingPermission && (
            <Badge className="ml-2 text-xs" variant="primary">
              PRO
            </Badge>
          )}
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          {t('dashboard.settings.watermarking_description')}
        </p>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            <FormField
              control={control}
              name="watermarkingEnabled"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between">
                    <FormLabel className="text-base font-semibold">
                      {t('general.enabled')}
                    </FormLabel>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        disabled={isDisabled}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </div>
                </FormItem>
              )}
            />

            <div
              className={cn(
                'space-y-6',
                (!form.watch('watermarkingEnabled') ||
                  !hasWatermarkingPermission) &&
                  'opacity-50',
              )}
            >
              <WatermarkingMethodField
                control={control}
                densityName="staticConstantPoolDensity"
                disabled={isDisabled || !form.watch('watermarkingEnabled')}
                label={t('dashboard.settings.static_constant_pool_synthesis')}
                methodName="staticConstantPoolSynthesis"
              />
              <WatermarkingMethodField
                control={control}
                densityName="dynamicBytecodeDensity"
                disabled={isDisabled || !form.watch('watermarkingEnabled')}
                label={t('dashboard.settings.dynamic_bytecode_injection')}
                methodName="dynamicBytecodeInjection"
              />
              <WatermarkingMethodField
                control={control}
                densityName="temporalAttributeDensity"
                disabled={isDisabled || !form.watch('watermarkingEnabled')}
                label={t('dashboard.settings.temporal_attribute_embedding')}
                methodName="temporalAttributeEmbedding"
              />
            </div>
          </form>
        </Form>
      </CardContent>
      <CardFooter>
        <LoadingButton
          disabled={isDisabled}
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

interface WatermarkingMethodFieldProps {
  control: Control<SetTeamWatermarkingSettingsSchema>;
  methodName: keyof NonNullable<SetTeamWatermarkingSettingsSchema>;
  densityName:
    | 'staticConstantPoolDensity'
    | 'dynamicBytecodeDensity'
    | 'temporalAttributeDensity';
  label: string;
  disabled: boolean;
}

function WatermarkingMethodField({
  control,
  methodName,
  densityName,
  label,
  disabled,
}: WatermarkingMethodFieldProps) {
  const t = useTranslations();
  const methodEnabled = Boolean(
    useWatch({
      control,
      name: methodName,
    }),
  );

  return (
    <div className="space-y-2">
      <FormField
        control={control}
        name={methodName}
        render={({ field }) => (
          <FormItem className="flex items-center justify-between space-y-0">
            <FormLabel className="font-normal">{label}</FormLabel>
            <FormControl>
              <Switch
                checked={Boolean(field.value)}
                disabled={disabled}
                onCheckedChange={field.onChange}
              />
            </FormControl>
          </FormItem>
        )}
      />

      <FormField
        control={control}
        name={densityName}
        render={({ field }) => (
          <FormItem className={cn('space-y-1', !methodEnabled && 'opacity-50')}>
            <div className="flex items-center justify-between">
              <FormLabel className="text-sm font-normal">
                {t('general.density')}
              </FormLabel>
              <span className="text-sm font-medium">{field.value}%</span>
            </div>
            <FormControl>
              <Slider
                disabled={disabled || !methodEnabled}
                max={100}
                min={0}
                step={1}
                value={[field.value]}
                onValueChange={([value]) => field.onChange(value)}
              />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}
