import { useState, type ChangeEvent } from 'react'
import { useAuth } from '../../app/AuthProvider'
import { createRestoreStore } from '../../data/repos/restoreStore'
import {
  previewRestore,
  runRestore,
  type RestoreStore,
  type RestoreSummary,
} from '../../data/restoreWriter'
import { readBackup, type BackupRead } from '../../excel/readBackup'
import { Button } from '../components/Button'
import shared from './ImportParity.module.css'
import styles from './Exports.module.css'

const GENERIC_ERROR = 'حصلت مشكلة غير متوقعة. جرّب تاني.'
const SHOWN_ERRORS = 8

type Stage =
  | { readonly kind: 'idle' }
  | { readonly kind: 'checking' }
  | { readonly kind: 'ready'; readonly read: BackupRead; readonly summary: RestoreSummary }
  | { readonly kind: 'writing'; readonly done: number; readonly total: number }
  | { readonly kind: 'done'; readonly summary: RestoreSummary }

export interface RestoreBackupProps {
  /** The Firestore adapter; tests pass a fake. */
  readonly makeStore?: () => RestoreStore
}

/**
 * Puts the items and movements of a backup file back. Nothing is written until the owner has seen
 * what would be: what the database already holds is left alone, so restoring into a live database
 * only fills in what is missing, and a run that stops can simply be run again.
 */
export function RestoreBackup({ makeStore = createRestoreStore }: RestoreBackupProps) {
  const { state } = useAuth()
  const [stage, setStage] = useState<Stage>({ kind: 'idle' })
  const [errors, setErrors] = useState<readonly string[]>([])

  const uid = state.status === 'signedIn' ? state.user.uid : null
  const busy = stage.kind === 'checking' || stage.kind === 'writing'

  const onFile = async (e: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || uid === null) return
    setErrors([])
    setStage({ kind: 'checking' })
    try {
      const read = readBackup(await file.arrayBuffer())
      if (read.errors.length > 0) {
        setErrors(read.errors)
        setStage({ kind: 'idle' })
        return
      }
      const summary = await previewRestore({
        store: makeStore(),
        items: read.items,
        movements: read.movements,
        ctx: { uid },
      })
      setStage({ kind: 'ready', read, summary })
    } catch (err) {
      setErrors([err instanceof Error && err.message !== '' ? err.message : GENERIC_ERROR])
      setStage({ kind: 'idle' })
    }
  }

  const apply = async (read: BackupRead, summary: RestoreSummary): Promise<void> => {
    if (uid === null) return
    setErrors([])
    setStage({ kind: 'writing', done: 0, total: summary.itemsToWrite + summary.movementsToWrite })
    try {
      const done = await runRestore({
        store: makeStore(),
        items: read.items,
        movements: read.movements,
        ctx: { uid },
        onProgress: (p) => setStage({ kind: 'writing', done: p.doneOps, total: p.totalOps }),
      })
      setStage({ kind: 'done', summary: done })
    } catch (err) {
      setErrors([err instanceof Error && err.message !== '' ? err.message : GENERIC_ERROR])
      setStage({ kind: 'ready', read, summary })
    }
  }

  const ready = stage.kind === 'ready' ? stage : null
  const nothing =
    ready !== null && ready.summary.itemsToWrite + ready.summary.movementsToWrite === 0

  return (
    <section className={styles.card} aria-labelledby="restore-title">
      <h2 id="restore-title" className={styles.heading}>
        استعادة من نسخة احتياطية
      </h2>
      <p className={styles.note}>
        اختار ملف النسخة الاحتياطية (.xlsx). بتتستعاد الأصناف والحركات. اللي موجود فعلًا في البرنامج
        بيتساب زي ما هو، فمفيش حاجة بتتكرر أو بتتمسح. المستندات (إذون الاستلام والصرف) مش بتتستعاد،
        بس الأرصدة بتطلع صح.
      </p>
      <label className={`${shared.pick} ${busy ? shared.disabled : ''}`}>
        اختار ملف النسخة الاحتياطية
        <input
          className={shared.file}
          type="file"
          accept=".xlsx"
          aria-label="ملف النسخة الاحتياطية"
          disabled={busy || uid === null}
          onChange={(e) => void onFile(e)}
        />
      </label>

      {errors.length > 0 ? (
        <div role="alert" className={styles.error} data-testid="restore-errors">
          <p>{errors.length === 1 ? errors[0] : 'الملف فيه مشاكل، ومفيش حاجة اتستعادت:'}</p>
          {errors.length > 1 ? (
            <ul>
              {errors.slice(0, SHOWN_ERRORS).map((m) => (
                <li key={m}>{m}</li>
              ))}
              {errors.length > SHOWN_ERRORS ? (
                <li>… و {errors.length - SHOWN_ERRORS} كمان</li>
              ) : null}
            </ul>
          ) : null}
        </div>
      ) : null}

      {stage.kind === 'checking' ? <p className={styles.note}>بيراجع الملف...</p> : null}
      {ready ? (
        <>
          <ul className={styles.list} aria-label="ملخص الاستعادة" data-testid="restore-summary">
            <li>
              أصناف هتتضاف: <b>{ready.summary.itemsToWrite}</b> (موجود قبل كده:{' '}
              {ready.summary.itemsSkipped})
            </li>
            <li>
              حركات هتتضاف: <b>{ready.summary.movementsToWrite}</b> (موجود قبل كده:{' '}
              {ready.summary.movementsSkipped})
            </li>
          </ul>
          <div className={styles.actions}>
            <Button
              variant="secondary"
              disabled={nothing}
              onClick={() => void apply(ready.read, ready.summary)}
            >
              {nothing ? 'مفيش حاجة تتستعاد' : 'استعد دلوقتي'}
            </Button>
          </div>
        </>
      ) : null}
      {stage.kind === 'writing' ? (
        <p className={styles.note} role="status">
          بيستعيد... {stage.done} من {stage.total}
        </p>
      ) : null}
      {stage.kind === 'done' ? (
        <p className={styles.done} role="status" data-testid="restore-done">
          اتستعاد {stage.summary.itemsToWrite} صنف و{stage.summary.movementsToWrite} حركة.
        </p>
      ) : null}
    </section>
  )
}
