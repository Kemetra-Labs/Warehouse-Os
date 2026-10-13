import { useState } from 'react'
import { toMillis } from '../../data/convert'
import { useData } from '../../data/DataProvider'
import { markBackupDone } from '../../data/repos/settings'
import { backupReminder } from '../../domain/backupReminder'
import { cairoToday } from '../../domain/dates'
import { formatDay } from '../../domain/fieldInput'
import { Button } from '../components/Button'
import { useNow } from '../useNow'
import { downloadBackup } from './exportActions'
import styles from './Exports.module.css'

const FAILED = 'ما قدرناش نجهّز النسخة الاحتياطية. جرّب تاني.'
const NOT_RECORDED = 'النسخة نزلت، بس ما قدرناش نسجّل تاريخها. التذكير ممكن يظهر تاني.'

/** FR-062: a full copy of items, movements and documents, and the 7-day reminder. */
export function ExportBackup() {
  const { items, movements, receipts, issueBatches, settings } = useData()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [justDone, setJustDone] = useState(false)

  const now = useNow()
  const reminder = backupReminder(settings.lastBackupAt, now)
  const lastMs = toMillis(settings.lastBackupAt)

  const run = (): void => {
    setBusy(true)
    setError(null)
    setJustDone(false)
    downloadBackup({ items, movements, receipts, issueBatches })
      .then(() => {
        setJustDone(true)
        // Settles on the server ack, so offline it stays queued. Not awaited.
        markBackupDone().catch(() => setError(NOT_RECORDED))
      })
      .catch(() => setError(FAILED))
      .finally(() => setBusy(false))
  }

  const last =
    lastMs > 0
      ? `آخر نسخة: ${formatDay(cairoToday(new Date(lastMs)))}${reminder.due ? ' (عدّى عليها أكتر من 7 أيام)' : ''}`
      : 'لسه ما اتعملتش نسخة احتياطية.'

  return (
    <section className={styles.card} aria-labelledby="backup-title">
      <h2 id="backup-title" className={styles.heading}>
        نسخة احتياطية
      </h2>
      <p className={styles.note}>
        ملف إكسيل فيه كل الأصناف والحركات والمستندات بكل بياناتها. احتفظ بيه في مكان تاني غير
        الجهاز.
      </p>
      <p className={reminder.due ? styles.warning : styles.note} data-testid="backup-status">
        {last}
      </p>
      <div className={styles.actions}>
        <Button variant="primary" disabled={busy} onClick={run}>
          {busy ? 'جاري التجهيز...' : 'نزّل نسخة احتياطية'}
        </Button>
      </div>
      {justDone ? (
        <p className={styles.done} role="status" data-testid="backup-done">
          النسخة نزلت.
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
    </section>
  )
}
