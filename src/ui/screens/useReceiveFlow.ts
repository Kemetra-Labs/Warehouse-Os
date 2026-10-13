import { useState } from 'react'
import {
  findDuplicateDelivery,
  type ExistingReceipt,
  type ReceiptDraft,
} from '../../domain/receipt'
import { addLine, lineFromItem, patchLine, resolveLine } from '../../domain/receiptEdit'
import {
  interpretClass,
  interpretScan,
  planHit,
  type LineHit,
  type ScanOutcome,
} from '../../domain/receiveScan'
import type { SearchClass } from '../../domain/search'
import type { Item, ReceiptLine } from '../../domain/types'
import type { ScanCode, ScanFeedback } from '../../scan/types'

export type ResolveTarget =
  { readonly kind: 'pending' } | { readonly kind: 'line'; readonly n: number }

export interface ReceiveFlowInput {
  readonly draft: ReceiptDraft
  readonly items: readonly Item[]
  readonly existing: readonly ExistingReceipt[]
  readonly selfId: string
  readonly onChange: (draft: ReceiptDraft) => void
  readonly onOpenExisting: (id: string) => void
}

export interface ReceiveFlow {
  /** The line being filled in; it joins the receipt on "إضافة للإذن". */
  readonly pending: ReceiptLine | null
  readonly notice: string | null
  /** Items to choose from after an ambiguous scan or search; null when no choice is open. */
  readonly chooseItems: readonly Item[] | null
  /** The line whose GTIN is being linked to an item; null when no resolver is open. */
  readonly resolving: ResolveTarget | null
  onCode(code: ScanCode): ScanFeedback
  onSearch(cls: SearchClass): void
  patchPending(patch: Partial<ReceiptLine>): void
  addPending(): void
  discardPending(): void
  startBatch(item: Item): void
  pickChosen(item: Item): void
  askResolve(target: ResolveTarget): void
  pickResolved(item: Item): void
  closeChoose(): void
  closeResolve(): void
}

const BUSY_NOTICE = 'كمّل السطر المفتوح الأول (أضفه للإذن أو امسحه)، وبعدين امسح الصنف اللي بعده.'
const unknownNotice = (gtin: string): string =>
  `الباركود ${gtin} مش معروف. اختار الصنف مرة واحدة والبرنامج هيفتكره.`

/** The state machine of the receiving screen: what a scan or a search does to the receipt. */
export function useReceiveFlow(input: ReceiveFlowInput): ReceiveFlow {
  const { draft, items, existing, selfId, onChange, onOpenExisting } = input
  const [pending, setPending] = useState<ReceiptLine | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [chooseItems, setChooseItems] = useState<readonly Item[] | null>(null)
  const [resolving, setResolving] = useState<ResolveTarget | null>(null)

  const applyHit = (hit: LineHit): ScanFeedback => {
    const plan = planHit(draft, pending, hit)
    setNotice(null)
    if (plan.kind === 'busy') {
      setNotice(BUSY_NOTICE)
      return 'known'
    }
    if (plan.kind === 'start') {
      setPending(plan.line)
      if (hit.kind === 'unknown-gtin') setNotice(unknownNotice(hit.gtin))
    } else if (plan.kind === 'bump-pending') {
      setPending((p) => (p ? { ...p, countedQty: p.countedQty + 1 } : p))
    } else {
      const line = draft.lines.find((l) => l.n === plan.n)
      if (line) onChange(patchLine(draft, plan.n, { countedQty: line.countedQty + 1 }))
    }
    return hit.kind === 'item' ? 'known' : 'unknown'
  }

  const applyDeliveryNo = (deliveryNo: string): ScanFeedback => {
    const dup = findDuplicateDelivery(existing, deliveryNo, selfId)
    if (dup) {
      onOpenExisting(dup.id)
      return 'known'
    }
    onChange({ ...draft, deliveryNo })
    setNotice(`رقم الإذن اتملى من الكود: ${deliveryNo}`)
    return 'known'
  }

  const applyOutcome = (outcome: ScanOutcome): ScanFeedback => {
    switch (outcome.kind) {
      case 'qr':
        return applyDeliveryNo(outcome.deliveryNo)
      case 'choose':
        setChooseItems(outcome.items)
        return 'known'
      case 'not-found':
        setNotice(`مفيش صنف بالرقم أو الاسم ده (${outcome.query})`)
        return 'unknown'
      default:
        return applyHit(outcome)
    }
  }

  const resolveInto = (item: Item, target: ResolveTarget): void => {
    if (target.kind === 'pending') {
      setPending((p) => (p ? resolveLine(p, item) : p))
      return
    }
    const line = draft.lines.find((l) => l.n === target.n)
    if (line) onChange(patchLine(draft, target.n, resolveLine(line, item)))
  }

  return {
    pending,
    notice,
    chooseItems,
    resolving,
    onCode: (code) => applyOutcome(interpretScan(items, code)),
    onSearch: (cls) => void applyOutcome(interpretClass(items, cls, 'typed')),
    patchPending: (patch) => setPending((p) => (p ? { ...p, ...patch } : p)),
    addPending() {
      if (!pending) return
      onChange(addLine(draft, pending))
      setPending(null)
      setNotice(null)
    },
    discardPending: () => setPending(null),
    startBatch(item) {
      if (pending) return setNotice(BUSY_NOTICE)
      setPending({ ...lineFromItem(draft.lines.length + 1, item), countedQty: 0 })
      setNotice(null)
    },
    pickChosen(item) {
      setChooseItems(null)
      applyHit({ kind: 'item', item, gtin: null, authorityCode: null, batchNo: null, expiry: null })
    },
    askResolve: setResolving,
    pickResolved(item) {
      if (resolving) resolveInto(item, resolving)
      setResolving(null)
    },
    closeChoose: () => setChooseItems(null),
    closeResolve: () => setResolving(null),
  }
}
