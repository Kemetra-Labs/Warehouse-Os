import { useEffect, useState } from 'react'
import { toMillis } from '../../data/convert'
import { useData } from '../../data/DataProvider'
import { getIssueBatch, startIssueDraft, type IssueBatchDoc } from '../../data/repos/issues'
import { cairoToday } from '../../domain/dates'
import { postedTotals, type BatchTotals, type IssueDraft } from '../../domain/issue'
import type { SealInfo } from './ReceiptReview'

/** A posted or cancelled batch: its seal, and the totals stored when it was posted. */
export interface SealedBatch {
  readonly seal: SealInfo
  readonly totals: BatchTotals
}

export type IssueLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'ready'; readonly draft: IssueDraft; readonly sealed: SealedBatch | null }

const MISSING: IssueLoad = { status: 'missing' }

export function issueDraftOf(doc: IssueBatchDoc): IssueDraft {
  return {
    number: doc.number,
    rep: doc.rep,
    permits: doc.permits,
    businessDate: doc.businessDate,
    requested: doc.requested,
    issued: doc.issued,
  }
}

function sealedOf(doc: IssueBatchDoc): SealedBatch | null {
  if (doc.status === 'draft') return null
  const at = toMillis(doc.status === 'cancelled' ? doc.cancelledAt : doc.postedAt)
  return {
    seal: {
      variant: doc.status === 'cancelled' ? 'cancelled' : 'posted',
      day: at > 0 ? cairoToday(new Date(at)) : doc.businessDate,
      reason: doc.cancelReason,
    },
    totals: postedTotals(doc),
  }
}

/**
 * The batch to show. No id means a new draft, numbered once the batch list has loaded (R10);
 * an id is read once from the local cache or the server. The editor then keeps its own copy.
 */
export function useIssueLoad(id: string | undefined): IssueLoad {
  const { issueBatches, issueBatchesLoaded } = useData()
  const [fresh, setFresh] = useState<IssueDraft | null>(null)
  const [loaded, setLoaded] = useState<{ id: string; load: IssueLoad } | null>(null)

  if (!id && issueBatchesLoaded && fresh === null) setFresh(startIssueDraft(issueBatches))

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const finish = (load: IssueLoad): void => {
      if (!cancelled) setLoaded({ id, load })
    }
    getIssueBatch(id)
      .then((doc) =>
        finish(
          doc ? { status: 'ready', draft: issueDraftOf(doc), sealed: sealedOf(doc) } : MISSING,
        ),
      )
      .catch(() => finish(MISSING))
    return () => {
      cancelled = true
    }
  }, [id])

  if (!id) return fresh ? { status: 'ready', draft: fresh, sealed: null } : { status: 'loading' }
  return loaded?.id === id ? loaded.load : { status: 'loading' }
}
