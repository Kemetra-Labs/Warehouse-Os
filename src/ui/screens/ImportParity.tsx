import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useAuth } from '../../app/AuthProvider'
import { toMillis } from '../../data/convert'
import { useData } from '../../data/DataProvider'
import { getDeviceId } from '../../data/deviceId'
import { createImportStore } from '../../data/repos/importStore'
import { AlreadyImportedError, runImport, type ImportProgress } from '../../data/importWriter'
import { ImportError } from '../../excel/errors'
import { importWorkbook } from '../../excel/importWorkbook'
import { computeParity, type ParityReport } from '../../excel/parity'
import type { ImportResult } from '../../excel/types'
import { AuthorityImport } from './AuthorityImport'
import { alreadyImportedMessage } from './importView'
import { ParityResult } from './ParityResult'
import styles from './ImportParity.module.css'

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready'; readonly fileName: string; readonly result: ImportResult }
  | { readonly kind: 'writing'; readonly progress: ImportProgress | null }
  | { readonly kind: 'done' }

function openingTotal(result: ImportResult): number {
  return Object.values(result.openingBalances).reduce((sum, n) => sum + n, 0)
}

const GENERIC_ERROR = 'حصلت مشكلة غير متوقعة. جرّب تاني.'

function messageOf(err: unknown): string {
  if (err instanceof AlreadyImportedError) return alreadyImportedMessage(err.importedAtMs)
  if (err instanceof Error && (err instanceof ImportError || err.name === 'ImportWriteError')) {
    return err.message
  }
  return GENERIC_ERROR
}

/** Import the workbook once (FR-004) and prove parity with its cached balances (FR-003). */
export default function ImportParity() {
  const { state } = useAuth()
  const { items, movements, settings } = useData()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [error, setError] = useState<string | null>(null)
  const fileName = useRef('')

  const imported = settings.workbookImport
  const importedAtMs = imported ? toMillis(imported.importedAt) : 0
  const result = stage.kind === 'ready' ? stage.result : null

  const report = useMemo((): { report: ParityReport; source: string } | null => {
    if (!result) return null
    const remappedCount = result.remappedRows.length
    // Already imported: compare the live Firestore data, which is the real proof.
    if (imported) {
      const live = computeParity({ items, movements, cached: result.cached, remappedCount })
      return { report: live, source: 'مقارنة بالبيانات المحفوظة في التطبيق' }
    }
    const preview = computeParity({
      items: result.items,
      movements: result.movements,
      cached: result.cached,
      remappedCount,
    })
    return { report: preview, source: 'معاينة قبل الحفظ' }
  }, [result, imported, items, movements])

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setError(null)
    setStage({ kind: 'reading' })
    try {
      fileName.current = file.name
      setStage({
        kind: 'ready',
        fileName: file.name,
        result: importWorkbook(await file.arrayBuffer()),
      })
    } catch (err) {
      setError(messageOf(err))
      setStage({ kind: 'idle' })
    }
  }

  const start = async (): Promise<void> => {
    if (!result || state.status !== 'signedIn') return
    setError(null)
    setStage({ kind: 'writing', progress: null })
    try {
      await runImport({
        store: createImportStore(),
        items: result.items,
        movements: result.movements,
        ctx: { uid: state.user.uid, deviceId: getDeviceId(), fileName: fileName.current },
        onProgress: (progress) => setStage({ kind: 'writing', progress }),
      })
      setStage({ kind: 'done' })
    } catch (err) {
      setError(messageOf(err))
      setStage({ kind: 'ready', fileName: fileName.current, result })
    }
  }

  const busy = stage.kind === 'reading' || stage.kind === 'writing'
  const progress = stage.kind === 'writing' ? stage.progress : null

  return (
    <section className={styles.screen} aria-labelledby="import-title">
      <h1 id="import-title" className={styles.title}>
        استيراد ملف الإكسيل
      </h1>

      {imported && stage.kind !== 'done' ? (
        <p className={styles.refusal} role="status">
          {alreadyImportedMessage(importedAtMs)}. مش هيتكرر الاستيراد. تقدر تختار الملف تاني عشان
          تقارن بس.
        </p>
      ) : (
        <p className={styles.note}>
          اختار ملف المخزن (.xlsx). هتشوف المطابقة الأول، وبعدين تأكد الاستيراد.
        </p>
      )}

      <label className={`${styles.pick} ${busy ? styles.disabled : ''}`}>
        {imported ? 'اختار الملف للمقارنة' : 'اختار ملف الإكسيل'}
        <input
          className={styles.file}
          type="file"
          accept=".xlsx"
          disabled={busy}
          onChange={(e) => void onFile(e)}
        />
      </label>

      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {stage.kind === 'reading' ? <p className={styles.note}>بقرا الملف...</p> : null}

      {result ? (
        <p className={styles.summary}>
          {result.items.length} صنف، {result.movements.length} حركة، {result.gtinCount} باركود
          {result.remappedRows.length > 0
            ? `، و${result.remappedRows.length} حركات اتصحح تاريخها لـ 01/08/2026`
            : ''}
          . مجموع الرصيد الافتتاحي في عمود I (للمرجع فقط، مش بيتستورد): {openingTotal(result)}
        </p>
      ) : null}

      {report ? <ParityResult report={report.report} source={report.source} /> : null}

      {result && result.warnings.length > 0 ? (
        <details className={styles.warnings}>
          <summary>تنبيهات ({result.warnings.length})</summary>
          <ul>
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </details>
      ) : null}

      {progress ? (
        <div className={styles.progress}>
          <progress max={progress.totalOps} value={progress.doneOps} aria-label="تقدم الاستيراد" />
          <span>
            {progress.doneOps} / {progress.totalOps}
          </span>
        </div>
      ) : null}

      {stage.kind === 'done' ? (
        <p className={styles.done} role="status">
          تم الاستيراد. الأرصدة دلوقتي في التطبيق.
        </p>
      ) : null}

      {result && !imported && stage.kind !== 'done' ? (
        <button type="button" className={styles.go} disabled={busy} onClick={() => void start()}>
          {stage.kind === 'writing' ? 'بيستورد...' : 'استورد'}
        </button>
      ) : null}

      <AuthorityImport />
    </section>
  )
}
