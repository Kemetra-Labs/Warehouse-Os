import type { IssueDraft, RequestedLine } from './issue'
import {
  allocateFefo,
  availableOf,
  freeBatches,
  linesNeedingReason,
  type BatchPart,
  type BatchRef,
  type StockView,
} from './issueStock'
import { coverage } from './issue'
import { normalizeDigits } from './search'
import type { IssuedLine, Item } from './types'

const isWholeQty = (qty: number): boolean => Number.isInteger(qty) && qty > 0
const hasText = (value: string | null): value is string => value !== null && value.trim() !== ''

/** FR-041: the same item from several permits becomes one line with the quantities added up. */
export function aggregateRequested(lines: readonly RequestedLine[]): RequestedLine[] {
  const merged = new Map<string, RequestedLine>()
  for (const line of lines) {
    if (!isWholeQty(line.qty)) continue
    const known = merged.get(line.itemCode)
    merged.set(line.itemCode, known ? { ...known, qty: known.qty + line.qty } : { ...line })
  }
  return [...merged.values()]
}

/** A permit number as typed: digits only (Arabic-Indic digits are converted), else null. */
export function parsePermit(text: string): string | null {
  const digits = normalizeDigits(text).trim()
  return /^\d+$/.test(digits) ? digits : null
}

export function addPermit(draft: IssueDraft, text: string): IssueDraft {
  const permit = parsePermit(text)
  if (permit === null || draft.permits.includes(permit)) return draft
  return { ...draft, permits: [...draft.permits, permit] }
}

export function removePermit(draft: IssueDraft, permit: string): IssueDraft {
  return { ...draft, permits: draft.permits.filter((p) => p !== permit) }
}

const isDirect = (l: IssuedLine, code: string): boolean =>
  l.itemCode === code && l.forItemCode === null

/** Lines grouped by requested item (direct lines, then its substitutes), numbered 1..N. */
function layout(lines: readonly IssuedLine[], requested: readonly RequestedLine[]): IssuedLine[] {
  const ordered = requested.flatMap((r) => [
    ...lines.filter((l) => isDirect(l, r.itemCode)),
    ...lines.filter((l) => l.forItemCode === r.itemCode),
  ])
  const rest = lines.filter((l) => !ordered.includes(l))
  return [...ordered, ...rest].map((l, i) => ({ ...l, n: i + 1 }))
}

/** A reason that an item no longer needs is dropped, so it never lands on an ordinary issue. */
function pruneReasons(draft: IssueDraft, stock: StockView): IssueDraft {
  const needing = linesNeedingReason(draft.issued, stock)
  const issued = draft.issued.map((l) =>
    needing.has(l.n) || l.negativeReason === null ? l : { ...l, negativeReason: null },
  )
  return { ...draft, issued }
}

function finish(draft: IssueDraft, stock: StockView): IssueDraft {
  return pruneReasons({ ...draft, issued: layout(draft.issued, draft.requested) }, stock)
}

const reasonOf = (lines: readonly IssuedLine[], code: string): string | null =>
  lines.find((l) => l.itemCode === code && hasText(l.negativeReason))?.negativeReason ?? null

function lineOf(code: string, forItemCode: string | null, part: BatchPart, reason: string | null) {
  return {
    n: 0,
    itemCode: code,
    qty: part.qty,
    batchNo: part.batchNo,
    expiry: part.expiry,
    forItemCode,
    negativeReason: reason,
  }
}

/**
 * Rebuilds the lines that issue a requested item from itself: what is requested, less what
 * substitutes cover, taken FEFO from the batches nothing else in the batch has claimed. An item
 * that already carries a negative reason may overflow its stock.
 */
function refillDirect(
  draft: IssueDraft,
  code: string,
  stock: StockView,
  forcedReason: string | null = null,
): IssueDraft {
  const request = draft.requested.find((r) => r.itemCode === code)
  const others = draft.issued.filter((l) => !isDirect(l, code))
  if (!request) return finish({ ...draft, issued: others }, stock)

  const covered = others.filter((l) => l.forItemCode === code).reduce((s, l) => s + l.qty, 0)
  const reason = forcedReason ?? reasonOf(draft.issued, code)
  const free = freeBatches(stock, code, others)
  const parts = allocateFefo(free, Math.max(0, request.qty - covered), reason !== null)
  const direct = parts.map((p) => lineOf(code, null, p, reason))
  return finish({ ...draft, issued: [...others, ...direct] }, stock)
}

/** Adds `qty` of an item to the request (a second permit adds to the same line) and issues it. */
export function addRequested(
  draft: IssueDraft,
  item: Pick<Item, 'code' | 'priceMinor'>,
  qty: number,
  stock: StockView,
): IssueDraft {
  if (!isWholeQty(qty)) return draft
  const requested = aggregateRequested([
    ...draft.requested,
    { itemCode: item.code, qty, priceMinor: item.priceMinor },
  ])
  return refillDirect({ ...draft, requested }, item.code, stock)
}

/** Sets the requested quantity of an item; zero removes it. */
export function setRequestedQty(
  draft: IssueDraft,
  itemCode: string,
  qty: number,
  stock: StockView,
): IssueDraft {
  if (qty === 0) return removeRequested(draft, itemCode)
  if (!isWholeQty(qty)) return draft
  const requested = draft.requested.map((r) => (r.itemCode === itemCode ? { ...r, qty } : r))
  return refillDirect({ ...draft, requested }, itemCode, stock)
}

/** Drops a requested item with the lines that issue it and the substitutes given for it. */
export function removeRequested(draft: IssueDraft, itemCode: string): IssueDraft {
  const requested = draft.requested.filter((r) => r.itemCode !== itemCode)
  const issued = draft.issued.filter((l) => !isDirect(l, itemCode) && l.forItemCode !== itemCode)
  return { ...draft, requested, issued: layout(issued, requested) }
}

/**
 * Issues `qty` of a substitute for a requested item (FR-043). It is capped at what is still
 * missing and at what the substitute has free. Returns the same draft when nothing can be added.
 */
export function addSubstitute(
  draft: IssueDraft,
  forItemCode: string,
  subItemCode: string,
  qty: number,
  stock: StockView,
): IssueDraft {
  const row = coverage(draft).find((c) => c.itemCode === forItemCode)
  if (!row || !isWholeQty(qty) || subItemCode === forItemCode) return draft
  const wanted = Math.min(qty, row.shortQty)
  const parts = allocateFefo(freeBatches(stock, subItemCode, draft.issued), wanted, false)
  if (parts.length === 0) return draft
  const lines = parts.map((p) => lineOf(subItemCode, forItemCode, p, null))
  return refillDirect({ ...draft, issued: [...draft.issued, ...lines] }, forItemCode, stock)
}

/** Takes a substitute back: its lines go and the requested item is short again. */
export function removeSubstitute(
  draft: IssueDraft,
  forItemCode: string,
  subItemCode: string,
  stock: StockView,
): IssueDraft {
  const issued = draft.issued.filter(
    (l) => !(l.forItemCode === forItemCode && l.itemCode === subItemCode),
  )
  return refillDirect({ ...draft, issued }, forItemCode, stock)
}

/** Writes a reason on every line of an item (a line's overdraw is judged per item and batch). */
export function setItemReason(draft: IssueDraft, itemCode: string, reason: string): IssueDraft {
  const text = reason.trim()
  const issued = draft.issued.map((l) =>
    l.itemCode === itemCode ? { ...l, negativeReason: text === '' ? null : text } : l,
  )
  return { ...draft, issued }
}

/** FR-044: issue the missing quantity from the item itself, beyond its balance, with a reason. */
export function issueNegative(
  draft: IssueDraft,
  itemCode: string,
  reason: string,
  stock: StockView,
): IssueDraft {
  if (reason.trim() === '') return draft
  return refillDirect(setItemReason(draft, itemCode, reason), itemCode, stock, reason.trim())
}

/** FR-046: the user moves a line to another batch of the same item. */
export function setLineBatch(
  draft: IssueDraft,
  n: number,
  batch: BatchRef,
  stock: StockView,
): IssueDraft {
  const issued = draft.issued.map((l) =>
    l.n === n ? { ...l, batchNo: batch.batchNo, expiry: batch.expiry } : l,
  )
  return pruneReasons({ ...draft, issued }, stock)
}

/** The stock of an item that this batch has not claimed yet: what a substitute can still take. */
export function freeStock(draft: IssueDraft, itemCode: string, stock: StockView): number {
  return availableOf(stock, itemCode, draft.issued)
}

/** No requests, no representative, no permits: nothing worth saving as a draft yet. */
export function isBlankIssueDraft(draft: IssueDraft): boolean {
  return draft.requested.length === 0 && draft.rep.trim() === '' && draft.permits.length === 0
}
