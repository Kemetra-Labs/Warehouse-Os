import type { ReceiptDraft } from './receipt'
import { lineFromItem, unresolvedLine } from './receiptEdit'
import { classify, findByGtin, findByNumber, resolve, type SearchClass } from './search'
import type { Item, ReceiptLine } from './types'

/** Where the text came from. A camera read is a code, so it is never searched as a name. */
export type ScanOrigin = 'camera' | 'typed'

export interface ItemHit {
  readonly kind: 'item'
  readonly item: Item
  /** The GTIN that was read, when the read was a GTIN. */
  readonly gtin: string | null
  /** The authority code as printed, when the number matched one (FR-017: it links nothing). */
  readonly authorityCode: string | null
  readonly batchNo: string | null
  readonly expiry: string | null
}

export interface UnknownGtinHit {
  readonly kind: 'unknown-gtin'
  readonly gtin: string
  readonly batchNo: string | null
  readonly expiry: string | null
}

export type LineHit = ItemHit | UnknownGtinHit

export type ScanOutcome =
  | LineHit
  | { readonly kind: 'qr'; readonly deliveryNo: string }
  | { readonly kind: 'choose'; readonly items: readonly Item[] }
  | { readonly kind: 'not-found'; readonly query: string }

const EAN8 = /^\d{8}$/
const QR_FORMAT = 'qr_code'

function queryOf(cls: SearchClass): string {
  switch (cls.kind) {
    case 'gtin':
      return cls.gtin
    case 'ambiguous':
      return cls.value
    case 'page':
      return String(cls.page)
    case 'code':
      return cls.code
    case 'name':
      return cls.query
  }
}

function single(items: readonly Item[], extras: Omit<ItemHit, 'kind' | 'item'>): ScanOutcome {
  const [only, ...rest] = items
  if (!only) return { kind: 'not-found', query: extras.gtin ?? extras.authorityCode ?? '' }
  return rest.length === 0 ? { kind: 'item', item: only, ...extras } : { kind: 'choose', items }
}

function fromGtin(
  items: readonly Item[],
  cls: Extract<SearchClass, { kind: 'gtin' }>,
): ScanOutcome {
  const found = findByGtin(items, cls.gtin)
  if (found.length === 0) {
    return { kind: 'unknown-gtin', gtin: cls.gtin, batchNo: cls.batchNo, expiry: cls.expiry }
  }
  return single(found, {
    gtin: cls.gtin,
    authorityCode: null,
    batchNo: cls.batchNo,
    expiry: cls.expiry,
  })
}

function fromNumber(items: readonly Item[], value: string, origin: ScanOrigin): ScanOutcome {
  const found = findByNumber(items, value)
  if (found.length === 0) {
    // A camera read of 8 digits that nothing holds is most likely a new EAN-8.
    return origin === 'camera' && EAN8.test(value)
      ? { kind: 'unknown-gtin', gtin: value, batchNo: null, expiry: null }
      : { kind: 'not-found', query: value }
  }
  const only = found.length === 1 ? found[0] : undefined
  return single(found, {
    gtin: only?.gtins.includes(value) ? value : null,
    authorityCode: only?.authorityCode === value ? value : null,
    batchNo: null,
    expiry: null,
  })
}

/** Resolves classified text (typed or read) against the item list; every match is kept. */
export function interpretClass(
  items: readonly Item[],
  cls: SearchClass,
  origin: ScanOrigin,
): ScanOutcome {
  if (cls.kind === 'gtin') return fromGtin(items, cls)
  if (cls.kind === 'ambiguous') return fromNumber(items, cls.value, origin)
  if (origin === 'camera') return { kind: 'not-found', query: queryOf(cls) }
  return single(resolve(items, cls), {
    gtin: null,
    authorityCode: null,
    batchNo: null,
    expiry: null,
  })
}

/**
 * Routes a camera read by its format first: a QR is the delivery note (FR-030b), whatever its
 * digits look like; everything else goes through the same classifier as the search box.
 */
export function interpretScan(
  items: readonly Item[],
  code: { readonly rawValue: string; readonly format: string },
): ScanOutcome {
  if (code.format === QR_FORMAT) return { kind: 'qr', deliveryNo: code.rawValue.trim() }
  return interpretClass(items, classify(code.rawValue), 'camera')
}

export type HitPlan =
  | { readonly kind: 'bump-pending' }
  | { readonly kind: 'bump-line'; readonly n: number }
  | { readonly kind: 'start'; readonly line: ReceiptLine }
  /** Another line is still being filled in; finish or discard it first. */
  | { readonly kind: 'busy' }

/** The same box again: same item (or same unknown GTIN), and the same batch when the scan has one. */
function isSameTarget(line: ReceiptLine, hit: LineHit): boolean {
  const sameBatch = hit.batchNo === null || line.batchNo === hit.batchNo
  if (hit.kind === 'item') return line.itemCode === hit.item.code && sameBatch
  return line.itemCode === null && line.scannedGtin === hit.gtin && sameBatch
}

function startLine(n: number, hit: LineHit): ReceiptLine {
  if (hit.kind === 'unknown-gtin') return unresolvedLine(n, hit.gtin, hit)
  return lineFromItem(n, hit.item, hit)
}

/**
 * Decides what a scan does to the receipt: count one more on the line it belongs to, or start
 * a new line to fill in. Each scan increments the counted quantity (T051).
 */
export function planHit(draft: ReceiptDraft, pending: ReceiptLine | null, hit: LineHit): HitPlan {
  if (pending) return isSameTarget(pending, hit) ? { kind: 'bump-pending' } : { kind: 'busy' }
  const same = [...draft.lines].reverse().find((l) => isSameTarget(l, hit))
  if (same) return { kind: 'bump-line', n: same.n }
  return { kind: 'start', line: startLine(draft.lines.length + 1, hit) }
}
