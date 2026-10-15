import { collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch } from 'firebase/firestore'
import { itemSchema, type Item } from '../../domain/types'
import { stripUndefined } from '../convert'
import { getFirebase } from '../firebase'
import type { Listener, Unsubscribe } from '../listener'
import { listenCollection } from './shared'
import { watchWrite } from '../sync'

export function subscribeItems(listener: Listener<Item>): Unsubscribe {
  const { db } = getFirebase()
  return listenCollection(collection(db, 'items'), itemSchema, {
    onData: (rows, meta) =>
      listener.onData(
        rows.map((r) => r.value),
        meta,
      ),
    onError: listener.onError,
  })
}

/** Creates a new item. `updatedAt` is stamped by the server. */
export function saveItem(item: Omit<Item, 'updatedAt'>): Promise<void> {
  const { db } = getFirebase()
  const data = stripUndefined({ ...item, updatedAt: serverTimestamp() })
  return watchWrite(setDoc(doc(db, 'items', item.code), data))
}

/**
 * Edits an existing item with only the changed fields (see `itemEditPatch`), so a price or GTIN
 * written meanwhile by a receipt on another device is not overwritten with the form's old copy.
 */
export function updateItem(
  code: string,
  patch: Partial<Omit<Item, 'updatedAt' | 'code'>>,
): Promise<void> {
  const { db } = getFirebase()
  return watchWrite(
    updateDoc(doc(db, 'items', code), stripUndefined({ ...patch, updatedAt: serverTimestamp() })),
  )
}

/** Firestore allows 500 writes per batch; the import writer stays under it the same way. */
const AUTHORITY_BATCH_SIZE = 450

/**
 * Sets the authority code (and `updatedAt`) on existing items, nothing else. Rules allow exactly
 * this write (`authorityCode` is on the items allowlist). The commits run side by side and the
 * promise settles when all of them are acknowledged; offline they queue on the device.
 */
export function setAuthorityCodes(
  updates: readonly { readonly itemCode: string; readonly authorityCode: string }[],
): Promise<void> {
  const { db } = getFirebase()
  const commits: Promise<void>[] = []
  for (let i = 0; i < updates.length; i += AUTHORITY_BATCH_SIZE) {
    const batch = writeBatch(db)
    for (const u of updates.slice(i, i + AUTHORITY_BATCH_SIZE)) {
      batch.update(doc(db, 'items', u.itemCode), {
        authorityCode: u.authorityCode,
        updatedAt: serverTimestamp(),
      })
    }
    commits.push(watchWrite(batch.commit()))
  }
  return Promise.all(commits).then(() => undefined)
}
