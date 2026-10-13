import { useEffect, useRef, useState } from 'react'
import {
  findDuplicateDelivery,
  type ExistingReceipt,
  type ReceiptDraft,
} from '../../domain/receipt'
import { joinPending, joinProblem, patchLine, resolveLine } from '../../domain/receiptEdit'
import {
  interpretClass,
  interpretScan,
  stepBatch,
  stepHit,
  stepReview,
  type LineHit,
  type ScanOutcome,
  type Step,
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
  /** Goes to the review step. Called only once the open line (if any) has joined the receipt. */
  readonly onReview: () => void
}

export interface ReceiveFlow {
  /** The line being filled in. It joins the receipt by itself once it is ready and the next item, or the review, comes. */
  readonly pending: ReceiptLine | null
  /** Changes whenever a different line is opened, so a line card can start fresh for it. */
  readonly pendingKey: number
  /** What the open line still needs before it can join; null when it is ready. */
  readonly problem: string | null
  /** The lines the review will show: the receipt's, plus the open one when it is ready. */
  readonly lineCount: number
  readonly notice: string | null
  /** Items to choose from after an ambiguous scan or search; null when no choice is open. */
  readonly chooseItems: readonly Item[] | null
  /** The line whose GTIN is being linked to an item; null when no resolver is open. */
  readonly resolving: ResolveTarget | null
  onCode(code: ScanCode): ScanFeedback
  onSearch(cls: SearchClass): void
  patchPending(patch: Partial<ReceiptLine>): void
  /** The counted field now holds a whole number (true) or text that is not one (false). */
  setCountedValid(valid: boolean): void
  /** The invoiced field now holds a whole number (true) or text that is not one (false). */
  setInvoicedValid(valid: boolean): void
  discardPending(): void
  review(): void
  startBatch(item: Item): void
  pickChosen(item: Item): void
  askResolve(target: ResolveTarget): void
  pickResolved(item: Item): void
  closeChoose(): void
  closeResolve(): void
}

const busyNotice = (problem: string): string =>
  `كمّل السطر المفتوح الأول: ${problem}. وبعدين امسح الصنف اللي بعده.`
const reviewNotice = (problem: string): string =>
  `كمّل السطر المفتوح الأول: ${problem}. أو امسحه وكمّل للمراجعة.`
const INVALID_QTY = 'اكتب رقم صحيح'
const unknownNotice = (gtin: string): string =>
  `الباركود ${gtin} مش معروف. اختار الصنف مرة واحدة والبرنامج هيفتكره.`

/** The state machine of the receiving screen: what a scan or a search does to the receipt. */
export function useReceiveFlow(input: ReceiveFlowInput): ReceiveFlow {
  const { draft, items, existing, selfId, onChange, onOpenExisting, onReview } = input
  const [pending, setPending] = useState<ReceiptLine | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [chooseItems, setChooseItems] = useState<readonly Item[] | null>(null)
  const [resolving, setResolving] = useState<ResolveTarget | null>(null)

  const [pendingKey, setPendingKey] = useState(0)
  // Text that is not a whole number commits nothing, so the open line keeps the last good number
  // while the field shows something else. While either field is in that state the line never joins.
  const [countedValid, setCountedValid] = useState(true)
  const [invoicedValid, setInvoicedValid] = useState(true)
  const blocked = pending && !(countedValid && invoicedValid) ? INVALID_QTY : null
  const resetValid = (): void => {
    setCountedValid(true)
    setInvoicedValid(true)
  }

  /** The last rendered receipt and open line: leaving the screen comes after the last render. */
  const latest = useRef({ draft, pending, blocked, onChange })
  useEffect(() => {
    latest.current = { draft, pending, blocked, onChange }
  })

  // The card calls a ready line "it will be added", so leaving the screen (a nav tab, back) or the
  // app going to the background joins it, as the next scan would. A line that is not ready stays
  // out: it was never shown as added.
  useEffect(() => {
    const keepReady = (): void => {
      const { draft: d, pending: p, blocked: b, onChange: save } = latest.current
      const joined = p && b === null ? joinPending(d, p) : null
      if (!joined) return
      latest.current = { draft: joined, pending: null, blocked: null, onChange: save }
      save(joined)
      setPending(null)
      resetValid()
    }
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') keepReady()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      keepReady()
    }
  }, [])

  /** Writes one step: the receipt once (when a line joined or counted), then the open line. */
  const commit = (step: Extract<Step, { kind: 'step' }>): boolean => {
    const opened = step.pending !== null && (pending === null || step.joined)
    if (step.draft !== draft) onChange(step.draft)
    if (opened) setPendingKey((k) => k + 1)
    setPending(step.pending)
    if (opened || step.pending === null) resetValid()
    // Otherwise the same line counted one more: the counted field now shows that number again.
    else setCountedValid(true)
    return opened
  }

  const applyHit = (hit: LineHit): ScanFeedback => {
    const step = stepHit(draft, pending, hit, blocked)
    setNotice(null)
    if (step.kind === 'busy') {
      setNotice(busyNotice(step.problem))
      return 'known'
    }
    const opened = commit(step)
    if (opened && hit.kind === 'unknown-gtin') setNotice(unknownNotice(hit.gtin))
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

  const problem = pending ? (blocked ?? joinProblem(pending, draft.businessDate)) : null

  return {
    pending,
    pendingKey,
    problem,
    lineCount: draft.lines.length + (pending && problem === null ? 1 : 0),
    notice,
    chooseItems,
    resolving,
    onCode: (code) => applyOutcome(interpretScan(items, code)),
    onSearch: (cls) => void applyOutcome(interpretClass(items, cls, 'typed')),
    patchPending: (patch) => setPending((p) => (p ? { ...p, ...patch } : p)),
    setCountedValid,
    setInvoicedValid,
    discardPending() {
      resetValid()
      setPending(null)
    },
    review() {
      const step = stepReview(draft, pending, blocked)
      if (step.kind === 'blocked') return setNotice(reviewNotice(step.problem))
      if (step.draft !== draft) onChange(step.draft)
      setPending(null)
      resetValid()
      // The screen unmounts in this same render: the leaving effect must not join the line again.
      latest.current = { draft: step.draft, pending: null, blocked: null, onChange }
      onReview()
    },
    startBatch(item) {
      const step = stepBatch(draft, pending, item, blocked)
      if (step.kind === 'busy') return setNotice(busyNotice(step.problem))
      setNotice(null)
      commit(step)
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
