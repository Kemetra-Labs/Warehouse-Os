import type { BatchBalance } from './ledger'
import type { IssuedLine } from './types'

/** What the issue rules need from the ledger: the batches of an item, earliest expiry first. */
export interface StockView {
  batches(itemCode: string): readonly BatchBalance[]
}

export interface BatchRef {
  readonly batchNo: string | null
  readonly expiry: string | null
}

export interface BatchPart extends BatchRef {
  readonly qty: number
}

/** The same key `batchBalances` groups by, so batch sums line up with the ledger. */
export function batchKey(batch: BatchRef): string {
  return `${batch.batchNo ?? ''}\u0000${batch.expiry ?? ''}`
}

const itemBatchKey = (itemCode: string, batch: BatchRef): string =>
  `${itemCode}\u0001${batchKey(batch)}`

export function balanceOf(stock: StockView, itemCode: string): number {
  return stock.batches(itemCode).reduce((sum, b) => sum + b.balance, 0)
}

type TakenLine = Pick<IssuedLine, 'itemCode' | 'qty' | 'batchNo' | 'expiry'>

/** The stock of an item that no line of this batch has claimed yet. */
export function availableOf(
  stock: StockView,
  itemCode: string,
  lines: readonly TakenLine[],
): number {
  const taken = lines.filter((l) => l.itemCode === itemCode).reduce((sum, l) => sum + l.qty, 0)
  return Math.max(0, balanceOf(stock, itemCode) - taken)
}

/** Batches of an item with the quantity already claimed by `taken` taken out (never below 0). */
export function freeBatches(
  stock: StockView,
  itemCode: string,
  taken: readonly TakenLine[],
): BatchBalance[] {
  const claimed = new Map<string, number>()
  for (const l of taken) {
    if (l.itemCode !== itemCode) continue
    const key = batchKey(l)
    claimed.set(key, (claimed.get(key) ?? 0) + l.qty)
  }
  return stock
    .batches(itemCode)
    .map((b) => ({ ...b, balance: Math.max(0, b.balance - (claimed.get(batchKey(b)) ?? 0)) }))
}

/**
 * FEFO (FR-046): fills `qty` from `batches` in the order given, which is earliest expiry first.
 * Anything left over is dropped, or, with `allowOverflow`, added to the last batch used (or to
 * the first batch, or to the unspecified bucket when the item has never had stock).
 */
export function allocateFefo(
  batches: readonly BatchBalance[],
  qty: number,
  allowOverflow: boolean,
): BatchPart[] {
  const parts: BatchPart[] = []
  let left = qty
  for (const b of batches) {
    if (left <= 0) break
    if (b.balance <= 0) continue
    const take = Math.min(left, b.balance)
    parts.push({ batchNo: b.batchNo, expiry: b.expiry, qty: take })
    left -= take
  }
  if (left <= 0 || !allowOverflow) return parts

  const last = parts[parts.length - 1]
  if (last) return [...parts.slice(0, -1), { ...last, qty: last.qty + left }]
  const first = batches[0]
  return [{ batchNo: first?.batchNo ?? null, expiry: first?.expiry ?? null, qty: left }]
}

function sumBy<T>(lines: readonly IssuedLine[], key: (l: IssuedLine) => T): Map<T, number> {
  const out = new Map<T, number>()
  for (const l of lines) out.set(key(l), (out.get(key(l)) ?? 0) + l.qty)
  return out
}

/**
 * FR-044 / post rule 2: issued quantity is summed per item and per batch across every line of
 * the batch, substitutes included. The numbers of the lines that belong to an overdrawn item or
 * an overdrawn batch; each of them needs a reason.
 */
export function linesNeedingReason(lines: readonly IssuedLine[], stock: StockView): Set<number> {
  const perItem = sumBy(lines, (l) => l.itemCode)
  const perBatch = sumBy(lines, (l) => itemBatchKey(l.itemCode, l))
  const overItem = new Set(
    [...perItem].filter(([code, qty]) => qty > balanceOf(stock, code)).map(([code]) => code),
  )
  const batchBalance = (l: IssuedLine): number =>
    stock.batches(l.itemCode).find((b) => batchKey(b) === batchKey(l))?.balance ?? 0
  const overBatch = new Set(
    lines
      .filter((l) => (perBatch.get(itemBatchKey(l.itemCode, l)) ?? 0) > batchBalance(l))
      .map((l) => itemBatchKey(l.itemCode, l)),
  )
  return new Set(
    lines
      .filter((l) => overItem.has(l.itemCode) || overBatch.has(itemBatchKey(l.itemCode, l)))
      .map((l) => l.n),
  )
}
