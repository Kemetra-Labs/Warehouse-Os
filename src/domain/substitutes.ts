import { formatMoney, percentDiff } from './money'
import type { Item } from './types'

export interface SubstituteCandidate {
  readonly item: Item
  readonly balance: number
  /** The candidate's price minus the requested item's, in piastres. */
  readonly diffMinor: number
  /** The same difference in percent of the requested price; null when that price is 0. */
  readonly diffPercent: number | null
}

export interface RankOptions {
  /** The "كل الفئات" toggle: also offer items of other categories (a DHS screw and plate set). */
  readonly allCategories?: boolean
}

/**
 * FR-042: active items with stock, the requested item itself excluded, nearest price first;
 * ties go to the larger balance, then to the code so the order never flickers.
 * `balanceOf` is the stock still free for this batch (see `availableOf` in issueStock).
 */
export function rankSubstitutes(
  target: Item,
  items: readonly Item[],
  balanceOf: (code: string) => number,
  options: RankOptions = {},
): SubstituteCandidate[] {
  return items
    .filter((i) => i.active && i.code !== target.code)
    .filter((i) => options.allCategories === true || i.category === target.category)
    .map((item) => ({ item, balance: balanceOf(item.code) }))
    .filter((c) => c.balance > 0)
    .map(({ item, balance }) => ({
      item,
      balance,
      diffMinor: item.priceMinor - target.priceMinor,
      diffPercent: percentDiff(target.priceMinor, item.priceMinor),
    }))
    .sort(
      (a, b) =>
        Math.abs(a.diffMinor) - Math.abs(b.diffMinor) ||
        b.balance - a.balance ||
        a.item.code.localeCompare(b.item.code),
    )
}

/** `+2,168.43`, `-5.00`, or `±0`: a signed price difference in pounds. */
export function formatDiffMinor(diffMinor: number): string {
  if (diffMinor === 0) return '±0'
  return `${diffMinor > 0 ? '+' : ''}${formatMoney(diffMinor)}`
}

/** `+75%`, `-12%`, `±0` for an equal price; a dash when there is no base price to compare. */
export function formatDiffPercent(percent: number | null, diffMinor: number): string {
  if (diffMinor === 0) return '±0'
  if (percent === null) return '—'
  const rounded = Math.round(percent)
  if (rounded === 0) return '±0%'
  return `${rounded > 0 ? '+' : '-'}${Math.abs(rounded)}%`
}
