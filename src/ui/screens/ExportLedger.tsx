import { useMemo, useState } from 'react'
import { useData } from '../../data/DataProvider'
import {
  clearPendingLedger,
  loadPendingLedger,
  savePendingLedger,
} from '../../data/pendingLedgerExport'
import { markLedgerExported } from '../../data/repos/settings'
import { formatDay } from '../../domain/fieldInput'
import { ledgerPasteSteps, planLedgerExport } from '../../excel/ledgerPlan'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { downloadLedgerRows } from './exportActions'
import styles from './Exports.module.css'

const DOWNLOAD_FAILED = 'ما قدرناش نجهّز الملف. جرّب تاني.'
const MARK_FAILED = 'ما قدرناش نسجّل إن السطور اتلصقت. اضغط «تم اللصق» تاني.'

/** The rows that were in the downloaded file: only these are recorded when the user confirms. */
interface Downloaded {
  readonly ids: readonly string[]
}

/** FR-061: new movements as rows to paste into a copy of the workbook, then "تم اللصق". */
export function ExportLedger() {
  const { movements, items, settings } = useData()
  // Kept on the device: the phone downloads, the PC pastes, and the tab may be gone in between.
  const [downloaded, setDownloaded] = useState<Downloaded | null>(() => {
    const ids = loadPendingLedger(settings.lastLedgerExportedIds)
    return ids ? { ids } : null
  })
  const [pasted, setPasted] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const plan = useMemo(() => {
    const names = new Map(items.map((i) => [i.code, i.nameAr]))
    const nameOf = (code: string): string | null => names.get(code) ?? null
    return planLedgerExport(movements, settings.lastLedgerExportedIds, nameOf)
  }, [movements, items, settings.lastLedgerExportedIds])
  const count = plan.rows.length

  const download = (): void => {
    setBusy(true)
    setError(null)
    setPasted(null)
    downloadLedgerRows(plan)
      // The ids of THIS file, not of whatever arrives later: a movement that came in after the
      // download was never pasted, so it must not be marked.
      .then(() => {
        savePendingLedger(plan.ids)
        setDownloaded({ ids: plan.ids })
      })
      .catch(() => setError(DOWNLOAD_FAILED))
      .finally(() => setBusy(false))
  }

  const confirm = (): void => {
    if (!downloaded) return
    const { ids } = downloaded
    setError(null)
    // Offline the write waits in the queue and settles on the server ack; the screen does not.
    markLedgerExported(ids).catch(() => setError(MARK_FAILED))
    clearPendingLedger()
    setPasted(ids.length)
    setDownloaded(null)
  }

  return (
    <section className={styles.card} aria-labelledby="ledger-title">
      <h2 id="ledger-title" className={styles.heading}>
        سطور سجل الحركات للإكسيل
      </h2>
      <p className={styles.note}>
        الحركات الجديدة بعد الاستيراد، جاهزة تتلصق في نسخة من ملف المخزن. الحركات المستوردة مش
        بتتصدّر لأنها أصلاً في الملف.
      </p>
      <p className={styles.count} data-testid="ledger-count" role="status">
        {count === 0 ? (
          'مفيش سطور جديدة. كل اللي اتسجّل اتلصق قبل كده.'
        ) : (
          <>
            <b>{count}</b> سطر جديد
            {plan.from && plan.to ? (
              <>
                {' '}
                · من <Bdi>{formatDay(plan.from)}</Bdi> لحد <Bdi>{formatDay(plan.to)}</Bdi>
              </>
            ) : null}
          </>
        )}
      </p>
      {plan.capacity.warning ? (
        <p className={styles.warning} role="alert" data-testid="ledger-capacity">
          {plan.capacity.warning}
        </p>
      ) : null}
      <ol className={styles.steps} aria-label="خطوات اللصق">
        {ledgerPasteSteps(downloaded?.ids.length ?? count).map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      <div className={styles.actions}>
        <Button variant="primary" disabled={count === 0 || busy} onClick={download}>
          {busy ? 'جاري التجهيز...' : `نزّل ملف السطور (${count})`}
        </Button>
        {downloaded ? <Button onClick={confirm}>تم اللصق</Button> : null}
      </div>
      {downloaded ? (
        <p className={styles.note}>
          ما تضغطش «تم اللصق» إلا بعد ما تلصق فعلاً. لو ضغطت قبل كده السطور دي مش هتظهر في التصدير
          الجاي.
        </p>
      ) : null}
      {pasted !== null ? (
        <p className={styles.done} role="status" data-testid="ledger-pasted">
          اتسجّل إن {pasted} سطر اتلصقوا. التصدير الجاي هيبدأ من بعدهم.
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
