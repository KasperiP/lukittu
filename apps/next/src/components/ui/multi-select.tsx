// src/components/multi-select.tsx

import {
  CheckIcon,
  ChevronDown,
  WandSparkles,
  XCircle,
  XIcon,
} from 'lucide-react';
import * as React from 'react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils/tailwind-helpers';
import { useTranslations } from 'next-intl';
import { LoadingSpinner } from '../shared/LoadingSpinner';

/**
 * Props for MultiSelect component
 */
interface MultiSelectProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /**
   * An array of option objects to be displayed in the multi-select component.
   * Each option object has a label, value, and an optional icon.
   */
  options: {
    /** The text to display for the option. */
    label: string;
    /** The unique value associated with the option. */
    value: string;
    /** Optional icon component to display alongside the option. */
    icon?: React.ComponentType<{ className?: string }>;
  }[];

  /**
   * Callback function triggered when the selected values change.
   * Receives an array of the new selected values.
   */
  onValueChange: (value: string[], isClear?: boolean) => void;

  /** The default selected values when the component mounts. */
  defaultValue?: string[];

  /**
   * Placeholder text to be displayed when no values are selected.
   * Optional, defaults to "Select options".
   */
  placeholder?: string;

  /**
   * Animation duration in seconds for the visual effects (e.g., bouncing badges).
   * Optional, defaults to 0 (no animation).
   */
  animation?: number;

  /**
   * Maximum number of items to display. Extra selected items will be summarized.
   * Optional, defaults to 3.
   */
  maxCount?: number;

  /**
   * The modality of the popover. When set to true, interaction with outside elements
   * will be disabled and only popover content will be visible to screen readers.
   * Optional, defaults to false.
   */
  modalPopover?: boolean;

  /**
   * If true, renders the multi-select component as a child of another component.
   * Optional, defaults to false.
   */
  asChild?: boolean;

  /**
   * Additional class names to apply custom styles to the multi-select component.
   * Optional, can be used to add custom styles.
   */
  className?: string;

  /**
   * The controlled value of the selected options.
   * Optional, can be used to control the selected values from outside the component.
   */
  value?: string[];

  /**
   * Callback function triggered when the search value changes.
   * Receives the new search value.
   */
  onSearch?: (value: string) => void;

  /**
   * The controlled value of the search input.
   * Optional, can be used to control the search input from outside the component.
   */
  searchValue?: string;

  /**
   * Indicates whether the component is in a loading state.
   * Optional, defaults to false.
   */
  loading?: boolean;

  /**
   * An array of default option objects to be displayed in the multi-select component.
   * Each option object has a label, value, and an optional icon.
   */
  defaultOptions?: {
    /** The text to display for the option. */
    label: string;
    /** The unique value associated with the option. */
    value: string;
    /** Optional icon component to display alongside the option. */
    icon?: React.ComponentType<{ className?: string }>;
  }[];

  /** Whether there are more items to load */
  hasMore?: boolean;

  /** Callback when user scrolls near bottom */
  onLoadMore?: () => void;
}

export const MultiSelect = React.forwardRef<
  HTMLButtonElement,
  MultiSelectProps
>(
  (
    {
      options,
      defaultOptions = [],
      hasMore = false,
      onLoadMore,
      onValueChange,
      value = [],
      placeholder = 'Select options',
      animation = 0,
      maxCount = 3,
      modalPopover = true,
      asChild = false,
      className,
      onSearch,
      searchValue,
      loading = false,
      ...props
    },
    ref,
  ) => {
    const t = useTranslations();
    const [seenOptions, setSeenOptions] = React.useState<typeof options>([]);

    React.useEffect(() => {
      setSeenOptions((prev) => {
        const newOptions = [...prev];
        options.forEach((opt) => {
          if (!newOptions.find((o) => o.value === opt.value)) {
            newOptions.push(opt);
          }
        });
        return newOptions;
      });
    }, [options]);

    const selectedOptions = React.useMemo(() => {
      const allOptions = [...defaultOptions, ...seenOptions];
      return value
        .map((val) => allOptions.find((opt) => opt.value === val))
        .filter((opt): opt is NonNullable<typeof opt> => opt !== undefined);
    }, [value, seenOptions, defaultOptions]);

    const [isPopoverOpen, setIsPopoverOpen] = React.useState(false);
    const [isAnimating, setIsAnimating] = React.useState(false);

    const commandListRef = React.useRef<HTMLDivElement>(null);
    const [scrollPosition, setScrollPosition] = React.useState(0);

    const handleInputKeyDown = (
      event: React.KeyboardEvent<HTMLInputElement>,
    ) => {
      if (event.key === 'Enter') {
        setIsPopoverOpen(true);
      }
    };

    const toggleOption = (option: string) => {
      const newSelectedValues = value.includes(option)
        ? value.filter((v) => v !== option)
        : [...value, option];

      onValueChange(newSelectedValues);
    };

    const handleClear = () => {
      onValueChange([], true);
    };

    const handleTogglePopover = () => {
      setIsPopoverOpen((prev) => !prev);
    };

    const clearExtraOptions = () => {
      const newSelectedValues = value.slice(0, maxCount);
      onValueChange(newSelectedValues);
    };

    const handleSearch = (value: string) => {
      if (onSearch) {
        setIsPopoverOpen(true);
        onSearch(value);
      }
    };

    const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
      if (!hasMore || !onLoadMore || loading) return;

      // Save scroll position before loading more
      setScrollPosition(e.currentTarget.scrollTop);

      const bottom =
        e.currentTarget.scrollHeight - e.currentTarget.scrollTop <=
        e.currentTarget.clientHeight * 1.5;
      if (bottom) {
        onLoadMore();
      }
    };

    // Restore scroll position after new items are loaded
    React.useEffect(() => {
      if (commandListRef.current && !loading) {
        commandListRef.current.scrollTop = scrollPosition;
      }
    }, [options, loading]);

    return (
      <Popover
        open={isPopoverOpen}
        onOpenChange={(open) => {
          if (!loading || !open) {
            setIsPopoverOpen(open);
          }
        }}
        modal={modalPopover}
      >
        <PopoverTrigger asChild>
          <Button
            ref={ref}
            {...props}
            onClick={handleTogglePopover}
            className={cn(
              'flex h-auto min-h-10 w-full items-center justify-between rounded-md border bg-inherit p-1 hover:bg-inherit [&_svg]:pointer-events-auto',
              className,
            )}
          >
            {value.length > 0 ? (
              <div className="flex w-full items-center justify-between">
                <div className="flex flex-wrap items-center">
                  {value.slice(0, maxCount).map((val) => {
                    const option = selectedOptions.find((o) => o.value === val);
                    const IconComponent = option?.icon;
                    return (
                      <Badge
                        key={val}
                        variant="primary"
                        className={cn(isAnimating ? 'animate-bounce' : '')}
                        style={{ animationDuration: `${animation}s` }}
                      >
                        {IconComponent && (
                          <IconComponent className="mr-2 h-4 w-4" />
                        )}
                        {option?.label}
                        <XCircle
                          className="ml-2 h-4 w-4 cursor-pointer"
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleOption(val);
                          }}
                        />
                      </Badge>
                    );
                  })}
                  {value.length > maxCount && (
                    <Badge
                      variant="primary"
                      className={cn(
                        'border-foreground/1 bg-transparent text-foreground hover:bg-transparent',
                        isAnimating ? 'animate-bounce' : '',
                      )}
                      style={{ animationDuration: `${animation}s` }}
                    >
                      {`+ ${value.length - maxCount} ${t('general.more')}`}
                      <XCircle
                        className="ml-2 h-4 w-4 cursor-pointer"
                        onClick={(event) => {
                          event.stopPropagation();
                          clearExtraOptions();
                        }}
                      />
                    </Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <XIcon
                    className="mx-2 h-4 cursor-pointer text-muted-foreground"
                    onClick={(event) => {
                      event.stopPropagation();
                      handleClear();
                    }}
                  />
                  <Separator
                    orientation="vertical"
                    className="flex h-full min-h-6"
                  />
                  <ChevronDown className="mx-2 h-4 cursor-pointer text-muted-foreground" />
                </div>
              </div>
            ) : (
              <div className="mx-auto flex w-full items-center justify-between">
                <span className="mx-3 text-sm text-muted-foreground">
                  {placeholder}
                </span>
                <ChevronDown className="mx-2 h-4 cursor-pointer text-muted-foreground" />
              </div>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          className="popover-content-width-full w-full p-0"
          align="start"
          onEscapeKeyDown={(e) => {
            if (loading) {
              e.preventDefault();
            } else {
              setIsPopoverOpen(false);
            }
          }}
        >
          <Command shouldFilter={false}>
            <CommandInput
              placeholder={`${t('general.search')}...`}
              value={searchValue}
              onValueChange={handleSearch}
              onKeyDown={handleInputKeyDown}
            />
            <CommandList ref={commandListRef} onScroll={handleScroll}>
              <CommandEmpty>
                {loading && options.length === 0 ? (
                  <div className="flex items-center justify-center">
                    <LoadingSpinner />
                  </div>
                ) : (
                  t('general.no_results')
                )}
              </CommandEmpty>
              <CommandGroup>
                {options
                  .filter((option) =>
                    searchValue
                      ? option.label
                          .toLowerCase()
                          .includes(searchValue.toLowerCase())
                      : true,
                  )
                  .map((option) => {
                    const isSelected = value.includes(option.value);
                    return (
                      <CommandItem
                        key={option.value}
                        onSelect={() => toggleOption(option.value)}
                        className="cursor-pointer"
                      >
                        <div
                          className={cn(
                            'mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-primary',
                            isSelected
                              ? 'bg-primary text-primary-foreground'
                              : 'opacity-50 [&_svg]:invisible',
                          )}
                        >
                          <CheckIcon className="h-4 w-4" />
                        </div>
                        {option.icon && (
                          <option.icon className="mr-2 h-4 w-4 text-muted-foreground" />
                        )}
                        <span>{option.label}</span>
                      </CommandItem>
                    );
                  })}
                {(hasMore || loading) && (
                  <CommandItem className="flex justify-center">
                    <LoadingSpinner />
                  </CommandItem>
                )}
              </CommandGroup>
              <CommandSeparator />
              <CommandGroup>
                <div className="flex items-center justify-between">
                  {value.length > 0 && (
                    <>
                      <CommandItem
                        onSelect={handleClear}
                        className="flex-1 cursor-pointer justify-center"
                      >
                        {t('general.clear')}
                      </CommandItem>
                      <Separator
                        orientation="vertical"
                        className="flex h-full min-h-6"
                      />
                    </>
                  )}
                  <CommandItem
                    onSelect={() => setIsPopoverOpen(false)}
                    className="max-w-full flex-1 cursor-pointer justify-center"
                  >
                    {t('general.close')}
                  </CommandItem>
                </div>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
        {animation > 0 && value.length > 0 && (
          <WandSparkles
            className={cn(
              'my-2 h-3 w-3 cursor-pointer bg-background text-foreground',
              isAnimating ? '' : 'text-muted-foreground',
            )}
            onClick={() => setIsAnimating(!isAnimating)}
          />
        )}
      </Popover>
    );
  },
);

MultiSelect.displayName = 'MultiSelect';
