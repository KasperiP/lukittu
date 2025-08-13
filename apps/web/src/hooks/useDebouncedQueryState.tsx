'use client';
import { useQueryState } from 'nuqs';
import { useCallback, useEffect, useRef, useState } from 'react';

type Timeout = ReturnType<typeof setTimeout>;

type DebounceOptions = {
  debounceMs?: number;
};

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
  parser: any,
  options: DebounceOptions = {},
): [T, T, (value: T) => void, (value: T) => void] {
  const { debounceMs = 500 } = options;

  const [urlValue, setUrlValue] = useQueryState<T>(key, parser);
  const [localValue, setLocalValue] = useState<T>(() => urlValue as T);

  const timerRef = useRef<Timeout | null>(null);
  const isUpdatingFromUrlRef = useRef(false);

  // Sync local state with URL when URL changes (e.g., navigation back/forward)
  useEffect(() => {
    if (!isUpdatingFromUrlRef.current) {
      setLocalValue(urlValue as T);
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
        setUrlValue(next as any);
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
      setUrlValue(next as any);
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

  return [urlValue as T, localValue, setValueDebounced, setValueInstant];
}
