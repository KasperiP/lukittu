import {
  ILicensesGetResponse,
  ILicensesGetSuccessResponse,
} from '@/app/api/(dashboard)/licenses/route';
import { MultiSelect } from '@/components/ui/multi-select';
import { TeamContext } from '@/providers/TeamProvider';
import { License } from '@lukittu/prisma';
import { useTranslations } from 'next-intl';
import { useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import useSWR from 'swr';

const fetchLicenses = async (url: string) => {
  const response = await fetch(url);
  const data = (await response.json()) as ILicensesGetResponse;

  if ('message' in data) {
    throw new Error(data.message);
  }

  return data;
};

interface LicensesMultiselectProps {
  onChange: (licenseIds: string[], isClear?: boolean) => void;
  value?: string[];
  selectedLicenses?: Omit<License, 'licenseKeyLookup'>[] | undefined;
  disabled?: boolean;
}

export const LicensesMultiselect = ({
  onChange,
  value = [],
  selectedLicenses,
  disabled = false,
}: LicensesMultiselectProps) => {
  const t = useTranslations();
  const teamCtx = useContext(TeamContext);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [allLicenses, setAllLicenses] = useState<
    ILicensesGetSuccessResponse['licenses']
  >([]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const { data, isLoading, error } = useSWR<ILicensesGetResponse>(
    teamCtx.selectedTeam
      ? ['/api/licenses', teamCtx.selectedTeam, debouncedSearchQuery, page]
      : null,
    ([url]) =>
      fetchLicenses(
        `${url}?pageSize=25${
          debouncedSearchQuery ? `&search=${debouncedSearchQuery}` : ''
        }`,
      ),
  );

  useEffect(() => {
    setAllLicenses([]);
    setPage(1);
  }, [debouncedSearchQuery]);

  useEffect(() => {
    if (!data || 'message' in data) {
      if (data && 'message' in data) {
        toast.error(data.message || t('general.server_error'));
      }
      return;
    }

    setAllLicenses((prev) => {
      const newLicenses = [...prev];
      data.licenses.forEach((license) => {
        if (!newLicenses.find((l) => l.id === license.id)) {
          newLicenses.push(license);
        }
      });
      return newLicenses;
    });
  }, [data, t]);

  const defaultOptions = useMemo(
    () =>
      selectedLicenses?.map((license) => ({
        label: license.licenseKey,
        value: license.id,
      })) ?? [],
    [selectedLicenses],
  );

  const options = useMemo(
    () =>
      allLicenses.map((license) => ({
        label: license.licenseKey,
        value: license.id,
      })),
    [allLicenses],
  );

  const handleLoadMore = useCallback(() => {
    if (data?.licenses.length === pageSize) {
      setPage((prev) => prev + 1);
    }
  }, [data, pageSize]);

  const handleValueChange = (newValue: string[], isClear?: boolean) => {
    if (isClear) {
      onChange([], true);
      return;
    }

    const removedId = value.find((id) => !newValue.includes(id));
    if (removedId && newValue.length < value.length) {
      onChange(newValue);
    } else {
      onChange(newValue);
    }
  };

  if (error) {
    toast.error(error.message ?? t('general.server_error'));
  }

  return (
    <MultiSelect
      className="bg-background"
      defaultOptions={defaultOptions}
      disabled={disabled}
      hasMore={data?.licenses.length === pageSize}
      loading={isLoading}
      options={options}
      placeholder={t('general.select_licenses')}
      searchValue={searchQuery}
      value={value}
      onLoadMore={handleLoadMore}
      onSearch={setSearchQuery}
      onValueChange={handleValueChange}
    />
  );
};
