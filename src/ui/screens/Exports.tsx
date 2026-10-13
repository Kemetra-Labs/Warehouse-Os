import { Link } from 'react-router'
import { useData } from '../../data/DataProvider'
import { ExportBackup } from './ExportBackup'
import { ExportLedger } from './ExportLedger'
import { ExportPrints } from './ExportPrints'
import styles from './Exports.module.css'

/** Printable documents, ledger rows for the workbook, and the backup (US6). */
export default function Exports() {
  const { status } = useData()
  return (
    <div className={styles.screen}>
      <h1 className={styles.title}>التصدير والطباعة</h1>
      {status === 'ready' ? (
        <>
          <ExportBackup />
          <ExportLedger />
          <ExportPrints />
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
