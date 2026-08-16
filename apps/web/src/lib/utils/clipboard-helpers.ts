import { toast } from 'sonner';

/**
 * Safely copies a value to the clipboard.
 * Shows a success toast on success, and an error toast if the clipboard
 * write fails (e.g. document is not focused, permission denied).
 */
export async function copyToClipboard(
  value: string,
  successMessage: string,
  errorMessage: string,
): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(successMessage);
  } catch {
    toast.error(errorMessage);
  }
}
