'use client';
import { ParserBuilder, useQueryState } from 'nuqs';
import { useCallback, useEffect, useRef, useState } from 'react';

type Timeout = ReturnType<typeof setTimeout>;

type DebounceOptions = {
  debounceMs?: number;
};

type DebouncedQueryStateReturn<T> = [
  urlValue: T | null,
  localValue: T,
  setValueDebounced: (value: T) => void,
  setValueInstant: (value: T) => void,
];

/**
 * Debounced wrapper around nuqs useQueryState.
 * - Keeps URL in sync with state using nuqs parsers
 * - Provides a debounced setter to avoid thrashing the URL while typing
 * - Handles navigation back/forward by syncing local state with URL state
 * - Returns both the URL state (for queries) and local state (for input)
 * - Provides both debounced and instant setters
 *
 * Usage example:
 * const [search, localSearch, setSearchDebounced, setSearchInstant] = useDebouncedQueryState(
 *   'search',
 *   parseAsString.withDefault('')
 * );
 */
export function useDebouncedQueryState<T>(
  key: string,
  parser: ParserBuilder<T>,
  options: DebounceOptions = {},
): DebouncedQueryStateReturn<T> {
  const { debounceMs = 500 } = options;

  const [urlValue, setUrlValue] = useQueryState<T>(key, parser);

  // Initialize local value with URL value or parser's default value
  const [localValue, setLocalValue] = useState<T>(() => {
    if (urlValue !== null) {
      return urlValue;
    }

    // Try to extract default value from parser
    const defaultValue = (parser as any).defaultValue;
    if (defaultValue !== undefined) {
      return defaultValue;
    }

    // Fallback - this should match the parser's expected type
    throw new Error(
      `useDebouncedQueryState: No initial value available for key "${key}". Consider using a parser with a default value.`,
    );
  });

  const timerRef = useRef<Timeout | null>(null);
  const isUpdatingFromUrlRef = useRef(false);

  // Sync local state with URL when URL changes (e.g., navigation back/forward)
  useEffect(() => {
    if (!isUpdatingFromUrlRef.current && urlValue !== null) {
      setLocalValue(urlValue);
    }
    isUpdatingFromUrlRef.current = false;
  }, [urlValue]);

  const setValueDebounced = useCallback(
    (next: T) => {
      // Update local state immediately for responsive UI
      setLocalValue(next);

      // Clear any pending URL updates
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Debounce URL updates
      timerRef.current = setTimeout(() => {
        isUpdatingFromUrlRef.current = true;
        setUrlValue(next as Parameters<typeof setUrlValue>[0]);
      }, debounceMs);
    },
    [debounceMs, setUrlValue],
  );

  const setValueInstant = useCallback(
    (next: T) => {
      // Clear any pending debounced updates
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }

      // Update both local and URL state immediately
      setLocalValue(next);
      isUpdatingFromUrlRef.current = true;
      setUrlValue(next as Parameters<typeof setUrlValue>[0]);
    },
    [setUrlValue],
  );

  // Cleanup timeout on unmount
  useEffect(
    () => () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    },
    [],
  );

  return [urlValue, localValue, setValueDebounced, setValueInstant];
}
