import { doc, onSnapshot, setDoc } from 'firebase/firestore'
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
