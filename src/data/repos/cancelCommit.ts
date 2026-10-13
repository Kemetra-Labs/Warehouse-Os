import { doc, getDocFromServer, serverTimestamp, writeBatch } from 'firebase/firestore'
import type { CancelCollection, CancelCommitPlan } from '../cancelPost'
import { docIdOfCancelEntry } from '../cancelPost'
import { stripUndefined } from '../convert'
import { getFirebase } from '../firebase'

/**
 * One atomic batch: the reversals, the price restores, then the document from posted to
 * cancelled. The document patch is exactly the three keys the rules allow. There is no draft
 * `setDoc` first, unlike a post: the document is posted, so the rules would refuse it.
 */
export function commitCancel(plan: CancelCommitPlan): Promise<void> {
  const { db } = getFirebase()
  const batch = writeBatch(db)
  for (const w of plan.writes) {
    if (w.op === 'movement') {
      const data = stripUndefined({ ...w.data, postedAt: serverTimestamp() })
      batch.set(doc(db, 'movements', w.id), data)
    } else if (w.op === 'item-price') {
      batch.update(doc(db, 'items', w.code), {
        priceMinor: w.priceMinor,
        updatedAt: serverTimestamp(),
      })
    } else {
      batch.update(doc(db, plan.collection, plan.docId), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelReason: w.reason,
      })
    }
  }
  return batch.commit()
}

/**
 * True when the server (not the cache) holds the document as `cancelled`. Only that counts: a
 * document that is still `posted` means the cancel did not land, and the entry must fail, not
 * clear. The batch is atomic, so a cancelled document means every `rev-*` movement exists too.
 */
export async function cancelledOnServer(
  collection: CancelCollection,
  entryId: string,
): Promise<boolean> {
  const { db } = getFirebase()
  const snap = await getDocFromServer(doc(db, collection, docIdOfCancelEntry(entryId)))
  return snap.exists() && snap.get('status') === 'cancelled'
}
