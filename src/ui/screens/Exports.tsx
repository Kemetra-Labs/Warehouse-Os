import { Link } from 'react-router'
import { useData } from '../../data/DataProvider'
import { backupReminder } from '../../domain/backupReminder'
import { useNow } from '../useNow'
import { ExportBackup } from './ExportBackup'
import { ExportLedger } from './ExportLedger'
import { ExportPrints } from './ExportPrints'
import { RestoreBackup } from './RestoreBackup'
import styles from './Exports.module.css'

/** Printable documents, ledger rows for the workbook, and the backup (US6). */
export default function Exports() {
  const { status, settings } = useData()
  // One reversed button on the screen: the backup when it is due, otherwise the ledger rows.
  const backupDue = backupReminder(settings.lastBackupAt, useNow()).due
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>التصدير والطباعة</h1>
      {status === 'ready' ? (
        <>
          <ExportBackup primary={backupDue} />
          <ExportLedger primary={!backupDue} />
          <ExportPrints />
          <RestoreBackup />
        </>
      ) : (
        <p className={styles.note}>جاري التحميل...</p>
      )}
      <p className={styles.note}>
        <Link to="/import">استيراد ملف الإكسيل ومطابقة الأرصدة وأكواد الهيئة</Link>
      </p>
      <p className={styles.note}>
        <Link to="/settings">إعدادات المخزن</Link>
      </p>
    </div>
  )
}
