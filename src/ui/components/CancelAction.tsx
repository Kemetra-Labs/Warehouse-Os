import { useState } from 'react'
import type { CancelAttempt } from '../../data/cancelPost'
import { Button } from './Button'
import styles from './CancelAction.module.css'
import { ReasonSheet } from './ReasonSheet'

const CANCEL_FAILED = 'ما قدرناش نلغي. جرّب تاني.'

/** What is being cancelled, with its article and the verb that agrees with it. */
export interface CancelNoun {
  /** "الإذن" or "الدفعة". */
  readonly word: string
  /** "اتلغى" or "اتلغت". */
  readonly cancelled: string
}

export const RECEIPT_NOUN: CancelNoun = { word: 'الإذن', cancelled: 'اتلغى' }
export const BATCH_NOUN: CancelNoun = { word: 'الدفعة', cancelled: 'اتلغت' }

export interface CancelActionProps {
  readonly noun: CancelNoun
  /** The quick reasons offered in the sheet. */
  readonly presets: readonly string[]
  /** What the cancel does, shown above the reason. */
  readonly summary: string
  /** Queues the cancel. `{ok: false}` carries the Arabic reason it was refused. */
  readonly onCancel: (reason: string) => Promise<CancelAttempt>
  /** Called once the cancel is queued (it works offline), with the reason. */
  readonly onCancelled: (reason: string) => void
}

/**
 * The cancel action of a posted document: a red button, a sheet that asks for the reason, and
 * the refusal in words when the cancel is not allowed. Posted data is never edited: the cancel
 * writes reversals, which the caller shows as the red seal.
 */
export function CancelAction({ noun, presets, summary, onCancel, onCancelled }: CancelActionProps) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = (reason: string): void => {
    setBusy(true)
    setError(null)
    onCancel(reason)
      .then((result) => {
        if (result.ok) return onCancelled(reason.trim())
        setError(result.problem.message)
      })
      .catch(() => setError(CANCEL_FAILED))
      .finally(() => {
        setBusy(false)
        setOpen(false)
      })
  }

  return (
    <div className={styles.box}>
      <Button variant="danger" disabled={busy} onClick={() => setOpen(true)}>
        إلغاء {noun.word}
      </Button>
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      <ReasonSheet
        open={open}
        title={`سبب إلغاء ${noun.word}`}
        summary={summary}
        presets={presets}
        initial=""
        submitLabel={`تأكيد إلغاء ${noun.word}`}
        onSave={submit}
        onClose={() => setOpen(false)}
      />
    </div>
  )
}

export interface CancelledNoteProps {
  readonly noun: CancelNoun
  readonly reason: string | null
}

/** Shown under the red seal: the document is cancelled, and why. */
export function CancelledNote({ noun, reason }: CancelledNoteProps) {
  return (
    <p className={styles.note} role="status" data-testid="cancelled-note">
      {noun.word} {noun.cancelled}. الحركات الأصلية لسه ظاهرة ومعاها حركات عكسية بترجّع الأرصدة.
      {reason ? ` السبب: ${reason}` : ''}
    </p>
  )
}
