import { describe, expect, it, vi } from 'vitest'
import { cachedStock } from '../../../src/data/stockView'

describe('cachedStock', () => {
  it('works each item out once, however often it is asked', () => {
    const batchBalancesFor = vi.fn((code: string) => [
      { batchNo: 'B1', expiry: null, balance: code.length, label: 'B1' },
    ])
    const stock = cachedStock({ batchBalancesFor })
    expect(stock.batches('AAA-01')).toBe(stock.batches('AAA-01'))
    stock.batches('BBB-01')
    expect(batchBalancesFor).toHaveBeenCalledTimes(2)
  })
})
