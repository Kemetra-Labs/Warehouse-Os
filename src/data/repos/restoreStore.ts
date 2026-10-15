import { collection, getDocsFromServer } from 'firebase/firestore'
import { getFirebase } from '../firebase'
import type { RestoreStore } from '../restoreWriter'
import { createImportStore } from './importStore'

/**
 * Thin Firestore adapter for the restore. It reuses the import store's reads from the server
 * (a stale cache could hide an existing document, and a repeated create fails its whole batch)
 * and its batch commit; only the movement ids differ: all of them, not just `imp-r*`.
 */
export function createRestoreStore(): RestoreStore {
  const { db } = getFirebase()
  const base = createImportStore()
  return {
    existingItemCodes: () => base.existingItemCodes(),
    async existingMovementIds() {
      const snap = await getDocsFromServer(collection(db, 'movements'))
      return new Set(snap.docs.map((d) => d.id))
    },
    commit: (ops) => base.commit(ops),
  }
}
