import { expiryEndDay } from './dates'
import type { ReceiptDraft } from './receipt'
import { newLine } from './receipt'
import type { Item, ReceiptLine } from './types'

/** What a scan can tell about the line it starts. */
export interface LineExtras {
  readonly gtin?: string | null
  readonly authorityCode?: string | null
  readonly batchNo?: string | null
  readonly expiry?: string | null
}

/** A new line from a known item: price prefilled from the last purchase, one piece counted. */
export function lineFromItem(n: number, item: Item, extras: LineExtras = {}): ReceiptLine {
  return {
    ...newLine(n),
    itemCode: item.code,
    scannedGtin: extras.gtin ?? null,
    authorityCode: extras.authorityCode ?? null,
    batchNo: extras.batchNo ?? null,
    expiry: extras.expiry ?? null,
    countedQty: 1,
    priceMinor: item.priceMinor,
    prevPriceMinor: item.priceMinor,
  }
}

/** A new line for a GTIN no item holds yet. The item is chosen later (FR-033). */
export function unresolvedLine(
  n: number,
  gtin: string,
  extras: Pick<LineExtras, 'batchNo' | 'expiry'>,
): ReceiptLine {
  return {
    ...newLine(n),
    scannedGtin: gtin,
    batchNo: extras.batchNo ?? null,
    expiry: extras.expiry ?? null,
    countedQty: 1,
  }
}

/** Appends a line, numbering it after the last one. */
export function addLine(draft: ReceiptDraft, line: ReceiptLine): ReceiptDraft {
  return { ...draft, lines: [...draft.lines, { ...line, n: draft.lines.length + 1 }] }
}

export function patchLine(
  draft: ReceiptDraft,
  n: number,
  patch: Partial<ReceiptLine>,
): ReceiptDraft {
  return { ...draft, lines: draft.lines.map((l) => (l.n === n ? { ...l, ...patch } : l)) }
}

/** Drops a line and renumbers, so numbers stay 1..N (movement ids are only minted on post). */
export function removeLine(draft: ReceiptDraft, n: number): ReceiptDraft {
  const lines = draft.lines.filter((l) => l.n !== n).map((l, i) => ({ ...l, n: i + 1 }))
  return { ...draft, lines }
}

/** Points a line at an item. A price that was typed is kept; an empty one takes the item's. */
export function resolveLine(line: ReceiptLine, item: Item): ReceiptLine {
  return {
    ...line,
    itemCode: item.code,
    prevPriceMinor: item.priceMinor,
    priceMinor: line.priceMinor === 0 ? item.priceMinor : line.priceMinor,
  }
}

function hasExpiry(line: ReceiptLine): line is ReceiptLine & { expiry: string } {
  return line.expiry !== null && line.expiry !== ''
}

export function hasBadExpiry(line: ReceiptLine): boolean {
  return hasExpiry(line) && expiryEndDay(line.expiry) === null
}

/** The batch ran out before the receipt's business date. */
export function isExpired(line: ReceiptLine, businessDate: string): boolean {
  if (!hasExpiry(line)) return false
  const end = expiryEndDay(line.expiry)
  return end !== null && end < businessDate
}

/** Same condition as `validateForPost`: an expired batch that was counted needs a reason. */
export function lacksExpiredReason(line: ReceiptLine, businessDate: string): boolean {
  const reason = line.expiredReason
  const hasReason = reason !== null && reason.trim() !== ''
  return isExpired(line, businessDate) && line.countedQty > 0 && !hasReason
}

/** A line may join the receipt once its expiry reads and an expired batch has its reason. */
export function canAddLine(line: ReceiptLine, businessDate: string): boolean {
  return !hasBadExpiry(line) && !lacksExpiredReason(line, businessDate)
}

/** Counted minus invoiced: negative is short, positive is over. */
export function lineDiff(line: ReceiptLine): number {
  return line.countedQty - line.invoicedQty
}

/** No lines and no header text: nothing worth saving as a draft yet. */
export function isBlankDraft(draft: ReceiptDraft): boolean {
  const header = [
    draft.supplier,
    draft.deliveryNo,
    draft.invoiceNo,
    draft.invoiceDate,
    draft.supplyRequestNo,
    draft.supplyOrderNo,
  ]
  return draft.lines.length === 0 && header.every((h) => (h ?? '').trim() === '')
}
