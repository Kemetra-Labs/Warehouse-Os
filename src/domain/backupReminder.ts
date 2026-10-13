import { toMillis } from '../data/convert'

/** FR-062: the app nags once the last backup is older than this many days. */
export const BACKUP_REMINDER_DAYS = 7

const DAY_MS = 24 * 60 * 60 * 1000

export interface BackupReminder {
  /** True when no backup was ever made, or the last one is older than 7 days. */
  readonly due: boolean
  /** Whole days since the last backup; null when there is none. */
  readonly daysSince: number | null
}

/**
 * Whether a backup is due. `lastBackupAt` is `settings/app.lastBackupAt` (a server timestamp or
 * null). Exactly 7 days old is still fine; older than that is due.
 */
export function backupReminder(lastBackupAt: unknown, nowMs: number): BackupReminder {
  const at = toMillis(lastBackupAt)
  if (at <= 0) return { due: true, daysSince: null }
  const elapsed = Math.max(0, nowMs - at)
  return { due: elapsed > BACKUP_REMINDER_DAYS * DAY_MS, daysSince: Math.floor(elapsed / DAY_MS) }
}
