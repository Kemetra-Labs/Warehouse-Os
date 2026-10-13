import { describe, expect, it } from 'vitest'
import {
  deriveFixtureLedger,
  ITEM_COUNT,
  MOVEMENT_COUNT,
  resolveInput,
  searchItemsFixture,
  searchMovementsFixture,
  typeInItems,
} from '../../helpers/searchFixtures'

/**
 * T094 as a plain test, so CI catches a regression (a bench alone never fails CI). The budget
 * is 100 ms on a mid-range phone; this asserts 100 ms on the CI machine, which is several times
 * faster than a phone, so a pass here is only "no gross regression". It runs under v8 coverage,
 * so each case warms up first and takes the best of several runs. Measured numbers are in
 * `search.bench.ts` (`npm run bench`).
 */
const BUDGET_MS = 100
const RUNS = 7

const items = searchItemsFixture()
const movements = searchMovementsFixture(items)
const view = deriveFixtureLedger(items, movements)

/** The fastest of RUNS runs, after one warm-up, in ms. */
function bestOf(run: () => unknown): number {
  run()
  let best = Number.POSITIVE_INFINITY
  for (let i = 0; i < RUNS; i += 1) {
    const start = performance.now()
    run()
    best = Math.min(best, performance.now() - start)
  }
  return best
}

describe('search budget (97 items, 1,000 movements)', () => {
  it('uses the real store size', () => {
    expect(items).toHaveLength(ITEM_COUNT)
    expect(movements).toHaveLength(MOVEMENT_COUNT)
  })

  it('finds something for each query, so the timing measures real work', () => {
    expect(typeInItems(view, 'شريحة')).toBeGreaterThan(0)
    expect(typeInItems(view, 'ITM-4')).toBeGreaterThan(0)
    expect(typeInItems(view, '42')).toBe(1)
    expect(resolveInput(items, '6221000000010')).toBe(1)
  })

  it.each([
    ['a name search on the items screen', () => typeInItems(view, 'شريحة نخاعي')],
    ['a code search', () => typeInItems(view, 'ITM-4')],
    ['a GTIN lookup', () => resolveInput(items, '6221000000010')],
    [
      'deriving the ledger and then searching',
      () => typeInItems(deriveFixtureLedger(items, movements), 'مسمار'),
    ],
  ])('%s stays under 100 ms', (_name, run) => {
    expect(bestOf(run)).toBeLessThan(BUDGET_MS)
  })
})
