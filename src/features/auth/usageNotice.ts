import type { Settings } from '../../lib/settings.ts'

/**
 * Whether the usage notice has to cover the app (plan M7): only once the
 * settings were read and say it was never accepted. While they load, or if
 * reading them fails, it is not shown: the screens show their own loading or
 * error, and it appears as soon as the settings arrive.
 */
export function mustAcceptUsageNotice(settings: Settings | undefined): boolean {
  return settings !== undefined && settings.usage_notice_accepted_at === null
}
