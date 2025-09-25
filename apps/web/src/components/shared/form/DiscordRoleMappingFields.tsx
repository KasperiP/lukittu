'use client';
import {
  IDiscordHealthResponse,
  IDiscordHealthSuccessResponse,
} from '@/app/api/(dashboard)/auth/oauth/discord/health/route';
import {
  IDiscordGuildsGetResponse,
  IDiscordGuildsGetSuccessResponse,
} from '@/app/api/(dashboard)/discord/guilds/route';
import {
  IDiscordRolesGetResponse,
  IDiscordRolesGetSuccessResponse,
} from '@/app/api/(dashboard)/discord/roles/route';
import { Alert, AlertDescription } from '@/components/ui/alert';
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
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { TeamContext } from '@/providers/TeamProvider';
import { ProductDiscordRole } from '@lukittu/shared';
import { AlertCircle, Check, ChevronDown, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Image from 'next/image';
import Link from 'next/link';
import { useContext, useState } from 'react';
import { useFieldArray, UseFormReturn } from 'react-hook-form';
import useSWR from 'swr';
import { LoadingSpinner } from '../LoadingSpinner';

const fetchGuilds = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IDiscordGuildsGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

const fetchRoles = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IDiscordRolesGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

const fetchDiscordHealth = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as IDiscordHealthResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

interface DiscordRoleMappingFieldsProps {
  form: UseFormReturn<any>;
  existingDiscordRoles: ProductDiscordRole[];
}

export default function DiscordRoleMappingFields({
  form,
  existingDiscordRoles,
}: DiscordRoleMappingFieldsProps) {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [openGuildSelectors, setOpenGuildSelectors] = useState<Set<number>>(
    new Set(),
  );
  const [openRoleSelectors, setOpenRoleSelectors] = useState<Set<number>>(
    new Set(),
  );

  const { data: discordHealth, error: discordHealthError } =
    useSWR<IDiscordHealthSuccessResponse>(
      '/api/auth/oauth/discord/health',
      fetchDiscordHealth,
    );

  const { data: guildsData, error: guildsError } =
    useSWR<IDiscordGuildsGetSuccessResponse>(
      teamCtx.selectedTeam && discordHealth?.tokenValid
        ? '/api/discord/guilds'
        : null,
      fetchGuilds,
    );

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: 'discordRoleMapping',
  });

  const handleAddMapping = () => {
    append({ discordGuildId: '', discordRoleId: '' });
  };

  const handleGuildSelect = (index: number, guildId: string) => {
    form.setValue(`discordRoleMapping.${index}.discordGuildId`, guildId);

    // Reset role selection when guild changes
    form.setValue(`discordRoleMapping.${index}.discordRoleId`, '');
    setOpenGuildSelectors((prev) => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  const handleRoleSelect = (index: number, roleId: string) => {
    form.setValue(`discordRoleMapping.${index}.discordRoleId`, roleId);
    setOpenRoleSelectors((prev) => {
      const newSet = new Set(prev);
      newSet.delete(index);
      return newSet;
    });
  };

  // Show error state if Discord health check or guilds loading failed
  if (discordHealthError || guildsError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <div className="space-y-1">
            <p className="text-sm font-medium">
              {t('dashboard.products.discord_connection_error')}
            </p>
            <p className="text-sm text-muted-foreground">
              {t('dashboard.products.discord_connection_error_description')}
            </p>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  const isDiscordConnectionValid = Boolean(
    discordHealth?.connected && discordHealth?.tokenValid,
  );

  return (
    <>
      {/* Show connection warning if Discord is not properly connected and we have roles selected */}
      {discordHealth && !isDiscordConnectionValid && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-2">
              <p className="text-sm font-medium">
                {!discordHealth.connected
                  ? t('dashboard.products.discord_not_connected')
                  : t('dashboard.products.discord_token_expired')}
              </p>
              <p className="text-sm text-muted-foreground">
                {t.rich('dashboard.products.discord_reconnect_description', {
                  link: (child) => (
                    <Link
                      className="font-medium text-primary underline hover:text-primary/80"
                      href="/dashboard/profile"
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

      {fields.length === 0 ? (
        <div className="space-y-3">
          <div className="flex h-24 flex-col items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
            {t('dashboard.products.no_discord_mappings')}
          </div>
          <Button
            className="pl-0"
            size="sm"
            type="button"
            variant="link"
            onClick={handleAddMapping}
          >
            {t('dashboard.products.add_discord_role_mapping')}
          </Button>
        </div>
      ) : (
        <>
          {fields.map((field, index) => (
            <DiscordMappingRow
              key={field.id}
              discordHealth={discordHealth}
              discordHealthError={discordHealthError}
              existingDiscordRoles={existingDiscordRoles}
              form={form}
              guildsData={guildsData}
              guildsError={guildsError}
              index={index}
              isConnectionValid={isDiscordConnectionValid}
              openGuildSelectors={openGuildSelectors}
              openRoleSelectors={openRoleSelectors}
              setOpenGuildSelectors={setOpenGuildSelectors}
              setOpenRoleSelectors={setOpenRoleSelectors}
              onGuildSelect={handleGuildSelect}
              onRemove={() => remove(index)}
              onRoleSelect={handleRoleSelect}
            />
          ))}
          <Button
            className="pl-0"
            size="sm"
            type="button"
            variant="link"
            onClick={handleAddMapping}
          >
            {t('dashboard.products.add_another_discord_mapping')}
          </Button>
        </>
      )}
    </>
  );
}

interface DiscordMappingRowProps {
  index: number;
  form: UseFormReturn<any>;
  guildsData: IDiscordGuildsGetSuccessResponse | undefined;
  discordHealth: IDiscordHealthSuccessResponse | undefined;
  discordHealthError: any;
  guildsError: any;
  existingDiscordRoles: ProductDiscordRole[];
  isConnectionValid: boolean;
  onRemove: () => void;
  onGuildSelect: (index: number, guildId: string) => void;
  onRoleSelect: (index: number, roleId: string) => void;
  openGuildSelectors: Set<number>;
  setOpenGuildSelectors: React.Dispatch<React.SetStateAction<Set<number>>>;
  openRoleSelectors: Set<number>;
  setOpenRoleSelectors: React.Dispatch<React.SetStateAction<Set<number>>>;
}

function DiscordMappingRow({
  index,
  form,
  guildsData,
  discordHealth,
  discordHealthError,
  guildsError,
  existingDiscordRoles,
  isConnectionValid,
  onRemove,
  onGuildSelect,
  onRoleSelect,
  openGuildSelectors,
  setOpenGuildSelectors,
  openRoleSelectors,
  setOpenRoleSelectors,
}: DiscordMappingRowProps) {
  const t = useTranslations();
  const [selectedGuildId, selectedRoleId] = form.watch([
    `discordRoleMapping.${index}.discordGuildId`,
    `discordRoleMapping.${index}.discordRoleId`,
  ]);

  const { data: rolesData } = useSWR<IDiscordRolesGetSuccessResponse>(
    selectedGuildId ? `/api/discord/roles?guildId=${selectedGuildId}` : null,
    fetchRoles,
  );

  const selectedGuild = guildsData?.guilds.find(
    (guild) => guild.id === selectedGuildId,
  );
  const existingGuild = existingDiscordRoles?.find(
    (role) => role.guildId === selectedGuildId,
  );

  const selectedRole = rolesData?.roles.find(
    (role) => role.id === selectedRoleId,
  );
  const existingRole = existingDiscordRoles?.find(
    (role) => role.roleId === selectedRoleId,
  );

  return (
    <div className="flex items-start gap-2">
      <FormField
        control={form.control}
        name={`discordRoleMapping.${index}.discordGuildId`}
        render={() => (
          <FormItem className="min-w-0 flex-1">
            <FormLabel>
              {t('dashboard.products.discord_server')} {index + 1}
            </FormLabel>
            <FormControl>
              <Popover
                open={openGuildSelectors.has(index)}
                onOpenChange={(open) => {
                  setOpenGuildSelectors((prev) => {
                    const newSet = new Set(prev);
                    if (open) {
                      newSet.add(index);
                    } else {
                      newSet.delete(index);
                    }
                    return newSet;
                  });
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    className="w-full min-w-0 justify-between"
                    disabled={!isConnectionValid}
                    role="combobox"
                    variant="outline"
                  >
                    {selectedGuild ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {selectedGuild.icon && (
                          <Image
                            alt=""
                            className="h-4 w-4 shrink-0 rounded"
                            height={16}
                            src={`https://cdn.discordapp.com/icons/${selectedGuild.id}/${selectedGuild.icon}.png`}
                            width={16}
                          />
                        )}
                        <span className="truncate">{selectedGuild.name}</span>
                      </div>
                    ) : existingGuild ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        {existingGuild.guildIcon && (
                          <Image
                            alt=""
                            className="h-4 w-4 shrink-0 rounded"
                            height={16}
                            src={`https://cdn.discordapp.com/icons/${existingGuild.guildId}/${existingGuild.guildIcon}.png`}
                            width={16}
                          />
                        )}
                        <span className="truncate">
                          {existingGuild.guildName}
                        </span>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">
                        {t('dashboard.products.select_discord_server')}
                      </span>
                    )}
                    {(!discordHealth && !discordHealthError) ||
                    (!guildsData && !guildsError && isConnectionValid) ? (
                      <LoadingSpinner className="ml-2 h-4 w-4" />
                    ) : isConnectionValid ? (
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="md:popover-content-width-full w-[300px] p-0">
                  <Command>
                    <CommandInput
                      placeholder={t('dashboard.products.search_servers')}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {t('dashboard.products.no_servers_found')}
                      </CommandEmpty>
                      <CommandGroup>
                        {guildsData?.guilds.map((guild) => (
                          <CommandItem
                            key={guild.id}
                            onSelect={() => onGuildSelect(index, guild.id)}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              {guild.icon && (
                                <Image
                                  alt=""
                                  className="h-4 w-4 shrink-0 rounded"
                                  height={16}
                                  src={`https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png`}
                                  width={16}
                                />
                              )}
                              <span className="truncate">{guild.name}</span>
                            </div>
                            <Check
                              className={`ml-auto h-4 w-4 ${
                                selectedGuildId === guild.id
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              }`}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <FormField
        control={form.control}
        name={`discordRoleMapping.${index}.discordRoleId`}
        render={() => (
          <FormItem className="min-w-0 flex-1">
            <FormLabel>
              {t('dashboard.products.discord_role')} {index + 1}
            </FormLabel>
            <FormControl>
              <Popover
                open={openRoleSelectors.has(index)}
                onOpenChange={(open) => {
                  setOpenRoleSelectors((prev) => {
                    const newSet = new Set(prev);
                    if (open) {
                      newSet.add(index);
                    } else {
                      newSet.delete(index);
                    }
                    return newSet;
                  });
                }}
              >
                <PopoverTrigger asChild>
                  <Button
                    className="w-full min-w-0 justify-between"
                    disabled={!selectedGuildId || !isConnectionValid}
                    role="combobox"
                    variant="outline"
                  >
                    {selectedRole ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: selectedRole.color
                              ? `#${selectedRole.color.toString(16).padStart(6, '0')}`
                              : '#99aab5',
                          }}
                        />
                        <span className="truncate">{selectedRole.name}</span>
                      </div>
                    ) : existingRole ? (
                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <div
                          className="h-3 w-3 shrink-0 rounded-full"
                          style={{
                            backgroundColor: existingRole.roleColor
                              ? `#${existingRole.roleColor.toString(16).padStart(6, '0')}`
                              : '#99aab5',
                          }}
                        />
                        <span className="truncate">
                          {existingRole.roleName}
                        </span>
                      </div>
                    ) : selectedGuildId ? (
                      <span className="text-muted-foreground">
                        {t('dashboard.products.select_discord_role')}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        {t('dashboard.products.select_server_first')}
                      </span>
                    )}
                    {selectedGuildId && !rolesData && isConnectionValid ? (
                      <LoadingSpinner className="ml-2 h-4 w-4" />
                    ) : selectedGuildId && isConnectionValid ? (
                      <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    ) : null}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="md:popover-content-width-full w-[300px] p-0">
                  <Command>
                    <CommandInput
                      placeholder={t('dashboard.products.search_roles')}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {!rolesData ? (
                          <div className="flex w-full items-center justify-center p-4">
                            <LoadingSpinner />
                          </div>
                        ) : (
                          t('dashboard.products.no_roles_found')
                        )}
                      </CommandEmpty>
                      <CommandGroup>
                        {rolesData?.roles.map((role) => (
                          <CommandItem
                            key={role.id}
                            onSelect={() => onRoleSelect(index, role.id)}
                          >
                            <div className="flex min-w-0 flex-1 items-center gap-2">
                              <div
                                className="h-3 w-3 shrink-0 rounded-full"
                                style={{
                                  backgroundColor: role.color
                                    ? `#${role.color.toString(16).padStart(6, '0')}`
                                    : '#99aab5',
                                }}
                              />
                              <span className="truncate">{role.name}</span>
                            </div>
                            <Check
                              className={`ml-auto h-4 w-4 ${
                                selectedRoleId === role.id
                                  ? 'opacity-100'
                                  : 'opacity-0'
                              }`}
                            />
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
      <Button
        className="mt-8 shrink-0"
        size="icon"
        type="button"
        variant="secondary"
        onClick={onRemove}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
}
