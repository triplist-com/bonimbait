/**
 * Error monitoring placeholder.
 * Replace with Sentry or other monitoring service in production.
 *
 * Usage:
 *   import { captureException, captureMessage } from '@/lib/monitoring';
 *   captureException(error);
 *   captureMessage('Something happened');
 */

export function captureException(error: unknown): void {
  // TODO: Replace with Sentry.captureException(error) when Sentry is configured
  console.error('[Monitoring] Exception captured:', error);
}

export function captureMessage(message: string, level: 'info' | 'warning' | 'error' = 'info'): void {
  // TODO: Replace with Sentry.captureMessage(message, level) when Sentry is configured
  const logFn = level === 'error' ? console.error : level === 'warning' ? console.warn : console.info;
  logFn(`[Monitoring] ${level}:`, message);
}
