import { DEFAULT_SETTINGS } from '../../src/data/convert'
import { deriveLedger, type LedgerView, type MovementDoc } from '../../src/data/deriveLedger'
import { classify, resolve } from '../../src/domain/search'
import { filterItems, type ListQuery } from '../../src/domain/items'
import type { Item } from '../../src/domain/types'
import { item, mov } from './exportFixtures'

/** The size of the real store (plan.md): 97 items, and a thousand movements to scan per search. */
export const ITEM_COUNT = 97
export const MOVEMENT_COUNT = 1_000

const CATEGORIES = ['شرائح تشريحية', 'مسامير تثبيت', 'شرائح عامة', 'مسامير نخاعية', 'مثبتات خارجية']
const WORDS = ['شريحة', 'مسمار', 'نخاعي', 'تشريحي', 'ديناميكي', 'تثبيت', 'عظم', 'فخذ', 'ساق', 'عضد']

export function searchItemsFixture(): Item[] {
  return Array.from({ length: ITEM_COUNT }, (_, i) => {
    const n = String(i + 1).padStart(2, '0')
    return item(`ITM-${n}`, {
      page: i + 1,
      category: CATEGORIES[i % CATEGORIES.length] ?? '',
      nameAr: `${WORDS[i % WORDS.length]} ${WORDS[(i * 3 + 1) % WORDS.length]} مقاس ${2 + (i % 7)}.5x${30 + i}`,
      nameEn: `Plate ${n}`,
      gtins: i % 2 === 0 ? [String(6_221_000_000_000 + i)] : [],
    })
  })
}

export function searchMovementsFixture(items: readonly Item[]): MovementDoc[] {
  return Array.from({ length: MOVEMENT_COUNT }, (_, i) => {
    const code = items[i % items.length]?.code ?? 'ITM-01'
    return mov({
      itemCode: code,
      type: i % 3 === 0 ? 'صرف' : 'إضافة',
      qty: 1 + (i % 9),
      businessDate: `2026-0${1 + (i % 9)}-1${i % 9}`,
    })
  })
}

export const SEEN = { baseline: 0, byItem: {} } as const

export function deriveFixtureLedger(
  items: readonly Item[],
  movements: readonly MovementDoc[],
): LedgerView {
  return deriveLedger({ items, movements, settings: DEFAULT_SETTINGS, seen: SEEN })
}

const query = (text: string): ListQuery => ({ filter: 'all', category: null, text })

/** What a keystroke in the items screen runs: the list filtered by the typed text. */
export const typeInItems = (view: LedgerView, text: string): number =>
  filterItems(view.rows, query(text)).length

/** What the scanner's manual box and the receive/issue search run. */
export const resolveInput = (items: readonly Item[], text: string): number =>
  resolve(items, classify(text)).length
