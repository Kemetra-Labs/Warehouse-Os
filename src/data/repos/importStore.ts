import {
  collection,
  doc,
  documentId,
  getDocFromServer,
  getDocsFromServer,
  query,
  serverTimestamp,
  setDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { toMillis, stripUndefined } from '../convert'
import { getFirebase } from '../firebase'
import type { ImportMark, ImportStore, PlannedOp } from '../importWriter'

/**
 * Thin Firestore adapter for the import (no logic worth unit-testing; the planner and the
 * runner in importWriter.ts are tested with a fake store). Everything reads from the server:
 * a stale cache could hide an existing `imp-r*` document, and re-sending it would fail the
 * whole batch because movements are create-only.
 */
export function createImportStore(): ImportStore {
  const { db } = getFirebase()
  return {
    async readImportMark(): Promise<ImportMark | null> {
      const snap = await getDocFromServer(doc(db, 'settings', 'app'))
      const mark = snap.exists()
        ? (snap.data() as { workbookImport?: unknown }).workbookImport
        : null
      if (typeof mark !== 'object' || mark === null) return null
      return { importedAtMs: toMillis((mark as { importedAt?: unknown }).importedAt) }
    },

    async existingItemCodes(): Promise<ReadonlySet<string>> {
      const snap = await getDocsFromServer(collection(db, 'items'))
      return new Set(snap.docs.map((d) => d.id))
    },

    async existingMovementIds(): Promise<ReadonlySet<string>> {
      // Document-ID range: every id that starts with "imp-r".
      const q = query(
        collection(db, 'movements'),
        where(documentId(), '>=', 'imp-r'),
        where(documentId(), '<', 'imp-s'),
      )
      const snap = await getDocsFromServer(q)
      return new Set(snap.docs.map((d) => d.id))
    },

    async commit(ops: readonly PlannedOp[]): Promise<void> {
      const batch = writeBatch(db)
      for (const op of ops) {
        const data = stripUndefined({ ...op.data, [op.stamp]: serverTimestamp() })
        batch.set(doc(db, op.collection, op.id), data)
      }
      await batch.commit()
    },

    async markImported(mark): Promise<void> {
      const workbookImport = { ...mark, importedAt: serverTimestamp() }
      await setDoc(doc(db, 'settings', 'app'), { workbookImport }, { merge: true })
    },
  }
}
