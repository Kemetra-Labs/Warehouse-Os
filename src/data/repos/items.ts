import { collection, doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { itemSchema, type Item } from '../../domain/types'
import { stripUndefined } from '../convert'
import { getFirebase } from '../firebase'
import type { Listener, Unsubscribe } from '../listener'
import { listenCollection } from './shared'

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

/** Creates or updates an item. `updatedAt` is stamped by the server. Not awaited by the UI. */
export function saveItem(item: Omit<Item, 'updatedAt'>): Promise<void> {
  const { db } = getFirebase()
  const data = stripUndefined({ ...item, updatedAt: serverTimestamp() })
  return setDoc(doc(db, 'items', item.code), data)
}
