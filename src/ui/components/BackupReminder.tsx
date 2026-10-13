import { Link } from 'react-router'
import { useData } from '../../data/DataProvider'
import { backupReminder } from '../../domain/backupReminder'
import { useNow } from '../useNow'
import styles from './BackupReminder.module.css'

/** Reminds the user to download a backup when there is data and the last backup is over 7 days old. */
export function BackupReminder() {
  const { settings, items, movements, status } = useData()
  const now = useNow()
  const reminder = backupReminder(settings.lastBackupAt, now)
  const hasData = items.length > 0 || movements.length > 0
  if (status !== 'ready' || !hasData || !reminder.due) return null
  return (
    <p className={styles.banner} data-testid="backup-reminder">
      {reminder.daysSince === null
        ? 'لسه ما اتعملتش نسخة احتياطية.'
        : `عدّى ${reminder.daysSince} يوم على آخر نسخة احتياطية.`}{' '}
      <Link to="/exports">اعمل نسخة دلوقتي</Link>
    </p>
  )
}
