import { useCallback, useEffect, useRef } from 'react'

const SAVE_DELAY_MS = 500

/** What a kind of document needs to be autosaved: where to write it, and when it is still empty. */
export interface AutosaveAdapter<T> {
  readonly save: (id: string, draft: T) => Promise<void>
  readonly isBlank: (draft: T) => boolean
}

export interface DraftAutosave<T> {
  /** Saves `draft` shortly after the last call, so typing does not write on every key. */
  schedule(draft: T): void
  /** Stops saving, for the moment a post is in flight (rules refuse writes to a posted receipt). */
  pause(): void
  resume(): void
}

/**
 * Keeps the draft in Firestore (offline-first: the write queues locally, never awaited by the
 * UI). A new document with nothing in it is not saved. Leaving the screen saves what is pending.
 * `adapter` must be a stable reference (a module constant).
 */
export function useDraftAutosave<T>(
  id: string,
  skipBlank: boolean,
  adapter: AutosaveAdapter<T>,
): DraftAutosave<T> {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const latest = useRef<T | null>(null)
  const paused = useRef(false)

  const clear = useCallback((): void => {
    if (timer.current !== null) clearTimeout(timer.current)
    timer.current = null
  }, [])

  const flush = useCallback((): void => {
    clear()
    const draft = latest.current
    latest.current = null
    if (!draft || paused.current || (skipBlank && adapter.isBlank(draft))) return
    adapter.save(id, draft).catch(() => undefined) // a refusal shows up in the sync pill
  }, [id, skipBlank, adapter, clear])

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
