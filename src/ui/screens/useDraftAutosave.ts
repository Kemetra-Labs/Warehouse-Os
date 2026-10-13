import { useCallback, useEffect, useRef } from 'react'
import { saveDraft } from '../../data/repos/receipts'
import type { ReceiptDraft } from '../../domain/receipt'
import { isBlankDraft } from '../../domain/receiptEdit'

const SAVE_DELAY_MS = 500

export interface DraftAutosave {
  /** Saves `draft` shortly after the last call, so typing does not write on every key. */
  schedule(draft: ReceiptDraft): void
  /** Stops saving, for the moment a post is in flight (rules refuse writes to a posted receipt). */
  pause(): void
  resume(): void
}

/**
 * Keeps the draft in Firestore (offline-first: the write queues locally, never awaited by the
 * UI). A new receipt with nothing in it is not saved. Leaving the screen saves what is pending.
 */
export function useDraftAutosave(id: string, skipBlank: boolean): DraftAutosave {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<ReceiptDraft | null>(null)
  const paused = useRef(false)

  const clear = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const flush = useCallback((): void => {
    clear()
    const draft = latest.current
    latest.current = null
    if (!draft || paused.current || (skipBlank && isBlankDraft(draft))) return
    saveDraft(id, draft).catch(() => undefined) // a refusal shows up in the sync pill
  }, [id, skipBlank, clear])

  useEffect(() => flush, [flush])

  return {
    schedule: useCallback(
      (draft) => {
        latest.current = draft
        clear()
        timer.current = setTimeout(flush, SAVE_DELAY_MS)
      },
      [clear, flush],
    ),
    pause: useCallback(() => {
      paused.current = true
      latest.current = null
      clear()
    }, [clear]),
    resume: useCallback(() => {
      paused.current = false
    }, []),
  }
}
