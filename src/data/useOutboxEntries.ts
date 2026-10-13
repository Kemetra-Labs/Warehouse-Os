import { useEffect, useState } from 'react'
import type { Outbox, OutboxEntry } from './outbox'

export interface OutboxEntries {
  readonly entries: readonly OutboxEntry[]
  /** False until the first read answers; true again if IndexedDB is blocked. */
  readonly loaded: boolean
}

/** The outbox rows, kept fresh whenever the outbox changes. */
export function useOutboxEntries(outbox: Pick<Outbox, 'list' | 'subscribe'>): OutboxEntries {
  const [state, setState] = useState<OutboxEntries>({ entries: [], loaded: false })

  useEffect(() => {
    let live = true
    const refresh = (): void => {
      outbox
        .list()
        .then((entries) => live && setState({ entries, loaded: true }))
        .catch(() => live && setState({ entries: [], loaded: true }))
    }
    refresh()
    const off = outbox.subscribe(refresh)
    return () => {
      live = false
      off()
    }
  }, [outbox])

  return state
}
