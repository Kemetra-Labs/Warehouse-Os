import { expect, test } from 'vitest'
import {
  deriveFixtureLedger,
  resolveInput,
  searchItemsFixture,
  searchMovementsFixture,
  typeInItems,
} from '../../helpers/searchFixtures'

/**
 * T094: search must answer in under 100 ms on a mid-range phone (plan.md) over the real store
 * size, 97 items and 1,000 movements. Run with `npm run bench` (Vitest 5 runs benchmarks in a
 * project of their own, so they never slow or flake the normal run). The plain test beside it,
 * `searchBudget.test.ts`, is what fails CI; this file reports the numbers.
 *
 * The means are asserted too, at 100 ms, which a laptop beats by two or three orders of
 * magnitude: that leaves the headroom a phone needs.
 */
const BUDGET_MS = 100
const items = searchItemsFixture()
const movements = searchMovementsFixture(items)
const view = deriveFixtureLedger(items, movements)

test('search over 97 items and 1,000 movements', async ({ bench }) => {
  const results = await bench.compare(
    bench('items screen: one keystroke (name words)', () => typeInItems(view, 'شريحة نخاعي')),
    bench('items screen: a code part', () => typeInItems(view, 'ITM-4')),
    bench('items screen: a page number', () => typeInItems(view, '42')),
    bench('receive/issue box: a GTIN', () => resolveInput(items, '6221000000010')),
    bench('derive the ledger once (after a sync)', () => deriveFixtureLedger(items, movements)),
    bench('derive, then search (worst single step)', () =>
      typeInItems(deriveFixtureLedger(items, movements), 'مسمار تثبيت'),
    ),
  )
  for (const name of [
    'items screen: one keystroke (name words)',
    'items screen: a code part',
    'items screen: a page number',
    'receive/issue box: a GTIN',
    'derive the ledger once (after a sync)',
    'derive, then search (worst single step)',
  ] as const) {
    expect(results.get(name).latency.mean, name).toBeLessThan(BUDGET_MS)
  }
})
