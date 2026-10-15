import { describe, expect, it } from 'vitest'
import {
  expectedLines,
  PostConflictError,
  sameIssuePost,
  sameReceiptPost,
} from '../../../src/data/postConflict'

const rline = (n: number, over: Record<string, unknown> = {}) => ({
  n,
  itemCode: 'SCR-01',
  countedQty: 5,
  invoicedQty: 5,
  batchNo: 'LOT7',
  expiry: '2028-03',
  priceMinor: 1000,
  note: 'x',
  ...over,
})

const iline = (n: number, over: Record<string, unknown> = {}) => ({
  n,
  itemCode: 'SCR-01',
  qty: 2,
  batchNo: 'LOT7',
  expiry: '2028-03',
  forItemCode: null,
  negativeReason: null,
  ...over,
})

describe('sameReceiptPost', () => {
  it('is the same post when the lines write the same movements', () => {
    expect(sameReceiptPost([rline(1), rline(2)], [rline(2), rline(1)])).toBe(true)
  })

  it('ignores fields no movement is written from, and lines that counted nothing', () => {
    const mine = [rline(1), rline(2, { countedQty: 0 })]
    const server = [rline(1, { note: 'other', invoicedQty: 9 })]
    expect(sameReceiptPost(server, mine)).toBe(true)
  })

  it('treats a missing batch or expiry like null', () => {
    const bare: Record<string, unknown> = rline(1)
    delete bare['batchNo']
    delete bare['expiry']
    expect(sameReceiptPost([{ ...bare, batchNo: null, expiry: null }], [bare])).toBe(true)
  })

  it.each([
    ['a different quantity', [rline(1, { countedQty: 6 })]],
    ['a different item', [rline(1, { itemCode: 'SCR-02' })]],
    ['a different batch', [rline(1, { batchNo: 'LOT8' })]],
    ['a different expiry', [rline(1, { expiry: '2029-01' })]],
    ['a different price', [rline(1, { priceMinor: 1100 })]],
    ['an extra line', [rline(1), rline(2)]],
    ['a missing line', []],
    ['a different line number', [rline(2)]],
  ])('is a conflict for %s', (_name, server) => {
    expect(sameReceiptPost(server, [rline(1)])).toBe(false)
  })

  it('reads a server value that is not a list as no lines', () => {
    expect(sameReceiptPost(undefined, [rline(1)])).toBe(false)
    expect(sameReceiptPost(undefined, [])).toBe(true)
  })
})

describe('sameIssuePost', () => {
  it('matches the same issued lines in any order', () => {
    expect(sameIssuePost([iline(1), iline(2)], [iline(2), iline(1)])).toBe(true)
  })

  it('ignores the negative-stock reason, which writes no movement field of its own', () => {
    expect(sameIssuePost([iline(1, { negativeReason: 'ناقص' })], [iline(1)])).toBe(true)
  })

  it.each([
    ['a different quantity', [iline(1, { qty: 3 })]],
    ['a different substitute', [iline(1, { forItemCode: 'SCR-02' })]],
    ['a different batch', [iline(1, { batchNo: 'LOT8' })]],
    ['an extra line', [iline(1), iline(2)]],
  ])('is a conflict for %s', (_name, server) => {
    expect(sameIssuePost(server, [iline(1)])).toBe(false)
  })
})

describe('expectedLines', () => {
  it('reads the commit plan and the stored payload', () => {
    const lines = [rline(1)]
    expect(expectedLines({ draftDoc: { lines } }, 'lines')).toBe(lines)
    expect(expectedLines({ draft: { lines } }, 'lines')).toBe(lines)
    expect(expectedLines({ draft: { issued: [iline(1)] } }, 'issued')).toHaveLength(1)
  })

  it('gives null when there is nothing to compare with', () => {
    expect(expectedLines(undefined, 'lines')).toBeNull()
    expect(expectedLines({ draft: {} }, 'lines')).toBeNull()
    expect(expectedLines('x', 'issued')).toBeNull()
  })
})

describe('PostConflictError', () => {
  it('says in Arabic that the lines were kept', () => {
    expect(new PostConflictError().message).toContain('محفوظة هنا')
  })
})
