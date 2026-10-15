import type { Item } from '../domain/types'
import { toMillis } from './convert'
import type { MovementDoc } from './deriveLedger'

/** An item whose stored price should be the price of its latest purchase by business date. */
export interface PriceHeal {
  readonly itemCode: string
  readonly priceMinor: number
}

const isPurchase = (m: MovementDoc): boolean =>
  m.type === 'إضافة' && (m.source.kind === 'receipt' || m.source.kind === 'import')

const posted = (m: MovementDoc): number => toMillis(m.postedAt)

/** Later business date first; then later posting time; then id, so the order is total. */
function newerByDate(a: MovementDoc, b: MovementDoc): number {
  if (a.businessDate !== b.businessDate) return a.businessDate < b.businessDate ? -1 : 1
  return posted(a) - posted(b) || (a.id < b.id ? -1 : 1)
}

function newerByPosting(a: MovementDoc, b: MovementDoc): number {
  return posted(a) - posted(b) || (a.id < b.id ? -1 : 1)
}

const maxBy = (list: readonly MovementDoc[], cmp: (a: MovementDoc, b: MovementDoc) => number) =>
  list.reduce((best, m) => (cmp(m, best) > 0 ? m : best))

/**
 * The price follows the latest purchase, but it is written from whatever a device saw when it
 * posted, so a receipt posted offline and synced late can put an older purchase's price over a
 * newer one (the last write to reach the server wins). That leaves a signature in the ledger: the
 * purchase written last is older by business date than the latest one, the item holds exactly its
 * price, and the item was last written by that very post (not edited since).
 *
 * Only that case is corrected, to the price of the latest purchase by business date. A price the
 * owner set by hand afterwards (the item is newer than the last purchase) is never touched,
 * neither is one that differs from the late purchase, and cancelled purchases do not count.
 */
export function planPriceHeals(
  items: readonly Item[],
  movements: readonly MovementDoc[],
): PriceHeal[] {
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
    const last = maxBy(purchases, newerByPosting)
    const itemWrittenAt = toMillis(item.updatedAt)
    const lateAndOlder = last.id !== latest.id && last.businessDate < latest.businessDate
    if (
      lateAndOlder &&
      item.priceMinor === last.priceMinor &&
      last.priceMinor !== latest.priceMinor &&
      itemWrittenAt > 0 &&
      itemWrittenAt <= posted(last)
    ) {
      out.push({ itemCode: item.code, priceMinor: latest.priceMinor })
    }
  }
  return out
}

/**
 * Applies the corrections once each, and only from a view that the server has confirmed (nothing
 * read from the cache, nothing still waiting to be sent): a decision taken on a stale view could
 * itself be the wrong write. Returns how many it applied, for the caller and the tests.
 */
export function createPriceHealer(
  apply: (heal: PriceHeal) => void,
): (items: readonly Item[], movements: readonly MovementDoc[], confirmed: boolean) => number {
  const attempted = new Set<string>()
  return (items, movements, confirmed) => {
    if (!confirmed) return 0
    let applied = 0
    for (const heal of planPriceHeals(items, movements)) {
      const key = `${heal.itemCode}:${heal.priceMinor}`
      if (attempted.has(key)) continue
      attempted.add(key)
      apply(heal)
      applied += 1
    }
    return applied
  }
}
