import { arrayUnion, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore'
import type { Settings } from '../../domain/types'
import { parseSettings, stripUndefined } from '../convert'
import { getFirebase } from '../firebase'
import { toDataError, type DataError, type SnapshotMeta, type Unsubscribe } from '../listener'

export interface SettingsListener {
  onData(settings: Settings, meta: SnapshotMeta): void
  onError(error: DataError): void
}

/** `settings/app`. A missing document yields the defaults (coverage 1.5, reorder 5). */
export function subscribeSettings(listener: SettingsListener): Unsubscribe {
  const { db } = getFirebase()
  return onSnapshot(
    doc(db, 'settings', 'app'),
    { includeMetadataChanges: true },
    (snap) => {
      const data = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : undefined
      listener.onData(parseSettings(data), {
        pendingCount: snap.metadata.hasPendingWrites ? 1 : 0,
        fromCache: snap.metadata.fromCache,
      })
    },
    (err) => listener.onError(toDataError(err)),
  )
}

/** Merges a partial update into `settings/app`. */
export function saveSettings(patch: Partial<Settings>): Promise<void> {
  const { db } = getFirebase()
  return setDoc(doc(db, 'settings', 'app'), stripUndefined(patch), { merge: true })
}

/** The patch that records pasted ledger rows: the ids are unioned in, never rewritten (R8). */
export function ledgerExportedPatch(ids: readonly string[]) {
  return { lastLedgerExportedIds: arrayUnion(...ids), lastLedgerExportAt: serverTimestamp() }
}

/**
 * "تم اللصق": adds the ids that were in the downloaded file to `lastLedgerExportedIds`. It is a
 * merge write (the document may not exist yet) and `arrayUnion`, so two devices cannot overwrite
 * each other. It settles on the server's ack, so offline it stays queued.
 */
export function markLedgerExported(ids: readonly string[]): Promise<void> {
  if (ids.length === 0) return Promise.resolve()
  const { db } = getFirebase()
  return setDoc(doc(db, 'settings', 'app'), ledgerExportedPatch(ids), { merge: true })
}

/** Records that a backup was just downloaded (the 7-day reminder reads it, FR-062). */
export function markBackupDone(): Promise<void> {
  const { db } = getFirebase()
  return setDoc(doc(db, 'settings', 'app'), { lastBackupAt: serverTimestamp() }, { merge: true })
}
