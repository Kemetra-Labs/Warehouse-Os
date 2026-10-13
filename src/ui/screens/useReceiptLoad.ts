import { useEffect, useState } from 'react'
import { toMillis } from '../../data/convert'
import { getReceipt, type ReceiptDoc } from '../../data/repos/receipts'
import { cairoToday } from '../../domain/dates'
import { newDraft, type ReceiptDraft } from '../../domain/receipt'
import type { SealInfo } from './ReceiptReview'

export type ReceiptLoad =
  | { readonly status: 'loading' }
  | { readonly status: 'missing' }
  | { readonly status: 'ready'; readonly draft: ReceiptDraft; readonly sealed: SealInfo | null }

const MISSING: ReceiptLoad = { status: 'missing' }

export function draftOf(doc: ReceiptDoc): ReceiptDraft {
  return {
    supplier: doc.supplier,
    deliveryNo: doc.deliveryNo,
    invoiceNo: doc.invoiceNo,
    invoiceDate: doc.invoiceDate,
    supplyRequestNo: doc.supplyRequestNo,
    supplyOrderNo: doc.supplyOrderNo,
    businessDate: doc.businessDate,
    lines: doc.lines,
  }
}

function sealOf(doc: ReceiptDoc): SealInfo | null {
  if (doc.status === 'draft') return null
  const at = toMillis(doc.status === 'cancelled' ? doc.cancelledAt : doc.postedAt)
  return {
    variant: doc.status === 'cancelled' ? 'cancelled' : 'posted',
    day: at > 0 ? cairoToday(new Date(at)) : doc.businessDate,
  }
}

/**
 * The receipt to show. No id means a new draft; an id is read once from the local cache or the
 * server. The editor then keeps its own copy, so a sync echo never fights the user's typing.
 */
export function useReceiptLoad(id: string | undefined): ReceiptLoad {
  const [fresh] = useState<ReceiptLoad>(() => ({
    status: 'ready',
    draft: newDraft(),
    sealed: null,
  }))
  const [loaded, setLoaded] = useState<{ id: string; load: ReceiptLoad } | null>(null)

  useEffect(() => {
    if (!id) return
    let cancelled = false
    const finish = (load: ReceiptLoad): void => {
      if (!cancelled) setLoaded({ id, load })
    }
    getReceipt(id)
      .then((doc) =>
        finish(doc ? { status: 'ready', draft: draftOf(doc), sealed: sealOf(doc) } : MISSING),
      )
      .catch(() => finish(MISSING))
    return () => {
      cancelled = true
    }
  }, [id])

  if (!id) return fresh
  return loaded?.id === id ? loaded.load : { status: 'loading' }
}
