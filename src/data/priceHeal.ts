import type { PriceUpdate } from '../domain/receipt'
import type { Item } from '../domain/types'
import { toMillis } from './convert'
import type { MovementDoc } from './deriveLedger'

/** An item whose stored price should be the price of its latest purchase by business date. */
export interface PriceHeal {
  readonly itemCode: string
  readonly priceMinor: number
  /** The late purchase whose price is being corrected: what makes this a new correction. */
  readonly staleMovementId: string
}

const isPurchase = (m: MovementDoc): boolean =>
  m.type === 'إضافة' && (m.source.kind === 'receipt' || m.source.kind === 'import')

const posted = (m: MovementDoc): number => toMillis(m.postedAt)

/** Later business date first; then later posting time; then id, so the order is total. */
function newerByDate(a: MovementDoc, b: MovementDoc): number {
  if (a.businessDate !== b.businessDate) return a.businessDate < b.businessDate ? -1 : 1
  return posted(a) - posted(b) || (a.id < b.id ? -1 : 1)
}

const maxBy = (list: readonly MovementDoc[], cmp: (a: MovementDoc, b: MovementDoc) => number) =>
  list.reduce((best, m) => (cmp(m, best) > 0 ? m : best))

/** What the healer needs of a receipt: the prices its post wrote. A `ReceiptDoc` satisfies it. */
export interface ReceiptPrices {
  readonly id: string
  readonly priceUpdates: readonly PriceUpdate[]
}

/**
 * True when the purchase's post wrote this price onto the item. A post that saw the price already
 * writes no price, only the update time (and any GTIN link), so matching on time and price alone
 * would take it for a late overwrite and undo a price the owner set by hand. A receipt purchase
 * counts only if its receipt records that price for the item; an unknown receipt (not loaded yet)
 * does not. An imported purchase has no receipt: the import writes the item's price itself.
 */
function wrotePrice(
  p: MovementDoc,
  item: Item,
  receipts: ReadonlyMap<string, ReceiptPrices>,
): boolean {
  if (p.source.kind !== 'receipt') return true
  const receipt = p.source.id === null ? undefined : receipts.get(p.source.id)
  return (
    receipt?.priceUpdates.some((u) => u.itemCode === item.code && u.toMinor === item.priceMinor) ??
    false
  )
}

/**
 * The purchase whose post last wrote the item at its current price. A post writes the item and its
 * movements in one batch, so they share one server time. Nothing else matches: a hand edit has no
 * movement, a restore stamps movements after their items, and a post that wrote no price is no writer.
 */
function writerOf(
  item: Item,
  purchases: readonly MovementDoc[],
  receipts: ReadonlyMap<string, ReceiptPrices>,
): MovementDoc | undefined {
  const writtenAt = toMillis(item.updatedAt)
  if (writtenAt <= 0) return undefined
  return purchases.find(
    (p) =>
      posted(p) === writtenAt && p.priceMinor === item.priceMinor && wrotePrice(p, item, receipts),
  )
}

/**
 * The price follows the latest purchase, but it is written from whatever a device saw when it
 * posted, so a receipt posted offline and synced late can put an older purchase's price over a
 * newer one (the last write to reach the server wins). That leaves a signature in the ledger: the
 * item was last written by a purchase's post, at that purchase's price, and that purchase is older
 * by business date than the latest one. Later posts that did not touch the item (same price, as
 * their device saw it) do not hide it. A later post that only linked a GTIN does: it stamps the
 * update time without writing a price, and that cannot be told from a hand-set price followed by a
 * GTIN link, so the healer leaves it (the safe side).
 *
 * Only that case is corrected, to the price of the latest purchase by business date. A price the
 * owner set by hand afterwards (no purchase was posted with it) is never touched, neither is one
 * that differs from the writing purchase, one the writing receipt did not itself write, and
 * cancelled purchases do not count.
 */
export function planPriceHeals(
  items: readonly Item[],
  movements: readonly MovementDoc[],
  receipts: readonly ReceiptPrices[],
): PriceHeal[] {
  const receiptById = new Map(receipts.map((r) => [r.id, r]))
  const reversed = new Set(movements.flatMap((m) => (m.reverses === null ? [] : [m.reverses])))
  const byItem = new Map<string, MovementDoc[]>()
  for (const m of movements) {
    if (!isPurchase(m) || reversed.has(m.id)) continue
    const list = byItem.get(m.itemCode)
    if (list) list.push(m)
    else byItem.set(m.itemCode, [m])
  }

  const out: PriceHeal[] = []
  for (const item of items) {
    const purchases = byItem.get(item.code)
    if (!purchases || purchases.length < 2) continue
    const latest = maxBy(purchases, newerByDate)
    const writer = writerOf(item, purchases, receiptById)
    if (
      writer &&
      writer.businessDate < latest.businessDate &&
      writer.priceMinor !== latest.priceMinor
    ) {
      out.push({ itemCode: item.code, priceMinor: latest.priceMinor, staleMovementId: writer.id })
    }
  }
  return out
}

/** A write that keeps failing (refused by the rules, say) is given up on after this many tries. */
const MAX_ATTEMPTS = 3

/**
 * Applies the corrections once each, and only from a view that the server has confirmed (nothing
 * read from the cache, nothing still waiting to be sent): a decision taken on a stale view could
 * itself be the wrong write. A correction is the same one only while the same late purchase
 * causes it, so a second late overwrite of the same item is corrected too, and one whose write
 * failed is tried again (a few times). Returns how many it applied, for the caller and the tests.
 */
export function createPriceHealer(
  apply: (heal: PriceHeal) => Promise<unknown> | void,
): (
  items: readonly Item[],
  movements: readonly MovementDoc[],
  confirmed: boolean,
  receipts: readonly ReceiptPrices[],
) => number {
  const handled = new Set<string>()
  const failures = new Map<string, number>()
  return (items, movements, confirmed, receipts) => {
    if (!confirmed) return 0
    let applied = 0
    for (const heal of planPriceHeals(items, movements, receipts)) {
      const key = `${heal.itemCode}:${heal.staleMovementId}:${heal.priceMinor}`
      if (handled.has(key)) continue
      handled.add(key)
      applied += 1
      const result = apply(heal)
      if (result) {
        result.catch(() => {
          const n = (failures.get(key) ?? 0) + 1
          failures.set(key, n)
          if (n < MAX_ATTEMPTS) handled.delete(key)
        })
      }
    }
    return applied
  }
}
