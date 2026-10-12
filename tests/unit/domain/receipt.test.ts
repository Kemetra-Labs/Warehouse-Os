import { describe, expect, it } from 'vitest'
import { cairoToday, expiryEndDay } from '../../../src/domain/dates'
import {
  findDuplicateDelivery,
  lineValueMinor,
  newDraft,
  newLine,
  previewPost,
  priceChanged,
  receiptTotalMinor,
  toDraftDoc,
  toPostBatch,
  validateForPost,
  type PostContext,
  type PostItem,
  type ReceiptDraft,
  type ValidationContext,
} from '../../../src/domain/receipt'
import { receiptSchema, type ReceiptLine } from '../../../src/domain/types'

const TODAY = '2026-10-12'

function line(over: Partial<ReceiptLine> = {}): ReceiptLine {
  return {
    ...newLine(1),
    itemCode: 'SCR-01',
    invoicedQty: 10,
    countedQty: 10,
    priceMinor: 1000,
    prevPriceMinor: 1000,
    ...over,
  }
}

function draft(lines: ReceiptLine[] = [line()], over: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    ...newDraft(TODAY),
    supplier: 'الهيئة',
    deliveryNo: 'D-1',
    invoiceNo: 'INV-1',
    lines,
    ...over,
  }
}

const vctx = (over: Partial<ValidationContext> = {}): ValidationContext => ({
  today: TODAY,
  existing: [],
  selfId: 'r1',
  ...over,
})

function item(code: string, over: Partial<PostItem> = {}): PostItem {
  return { code, priceMinor: 1000, gtins: [], ...over }
}

const pctx = (over: Partial<PostContext> = {}): PostContext => ({
  id: 'r1',
  items: [item('SCR-01'), item('SCR-02', { priceMinor: 500 })],
  uid: 'owner',
  deviceId: 'dev-1',
  ...over,
})

const codes = (d: ReceiptDraft, ctx = vctx()): string[] =>
  validateForPost(d, ctx).map((i) => i.code)

describe('validateForPost', () => {
  it('passes a clean draft', () => {
    expect(validateForPost(draft(), vctx())).toEqual([])
  })

  it('blocks an empty receipt', () => {
    expect(codes(draft([]))).toEqual(['no-lines'])
  })

  it('blocks unresolved lines, with Arabic text and the line number', () => {
    const issues = validateForPost(
      draft([line({ itemCode: null, scannedGtin: '6221234567890' })]),
      vctx(),
    )
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'unresolved', line: 1 })
    expect(issues[0]?.message).toMatch(/[؀-ۿ]/)
  })

  it('requires a difference reason when counted differs from invoiced', () => {
    expect(codes(draft([line({ countedQty: 8 })]))).toEqual(['diff-reason'])
    expect(codes(draft([line({ countedQty: 8, diffReason: '  ' })]))).toEqual(['diff-reason'])
    expect(codes(draft([line({ countedQty: 8, diffReason: 'نقص' })]))).toEqual([])
    expect(codes(draft([line({ countedQty: 12, diffReason: 'زيادة' })]))).toEqual([])
  })

  it('accepts counted 0 with a reason', () => {
    expect(codes(draft([line({ countedQty: 0, diffReason: 'لم يصل' })]))).toEqual([])
  })

  it('needs a reason for an expiry before the business date', () => {
    expect(codes(draft([line({ expiry: '2026-10-11' })]))).toEqual(['expired-reason'])
    expect(codes(draft([line({ expiry: '2026-09' })]))).toEqual(['expired-reason'])
    expect(codes(draft([line({ expiry: '2026-09', expiredReason: 'مستلم بموافقة' })]))).toEqual([])
  })

  it('does not flag an expiry on or after the business date', () => {
    expect(codes(draft([line({ expiry: '2026-10-12' })]))).toEqual([])
    expect(codes(draft([line({ expiry: '2026-10' })]))).toEqual([]) // month end is 31st
    expect(codes(draft([line({ expiry: '2028-01' })]))).toEqual([])
  })

  it('rejects an expiry that is not a date', () => {
    expect(codes(draft([line({ expiry: '12/2028' })]))).toEqual(['bad-expiry'])
  })

  it('compares an old expiry against the receipt business date, not today', () => {
    const d = draft([line({ expiry: '2026-09-30' })], { businessDate: '2026-09-29' })
    expect(codes(d)).toEqual([])
  })

  it('rejects a business date in the future (Cairo day)', () => {
    expect(codes(draft([line()], { businessDate: '2026-10-13' }))).toEqual(['future-date'])
    expect(codes(draft([line()], { businessDate: TODAY }))).toEqual([])
  })

  it('rejects a malformed business date', () => {
    expect(codes(draft([line()], { businessDate: '' }))).toEqual(['bad-date'])
  })

  it('rejects a zero or negative invoiced quantity and a negative counted quantity', () => {
    expect(codes(draft([line({ invoicedQty: 0, countedQty: 0 })]))).toEqual(['invoiced-qty'])
    expect(codes(draft([line({ invoicedQty: -1, countedQty: -1 })]))).toContain('invoiced-qty')
    expect(codes(draft([line({ countedQty: -2, diffReason: 'x' })]))).toEqual(['counted-qty'])
  })

  it('refuses a duplicate delivery number and returns the existing id (FR-030b)', () => {
    const existing = [
      { id: 'old', deliveryNo: 'D-1', status: 'posted' as const },
      { id: 'other', deliveryNo: 'D-2', status: 'draft' as const },
    ]
    const issues = validateForPost(draft(), vctx({ existing }))
    expect(issues).toHaveLength(1)
    expect(issues[0]).toMatchObject({ code: 'duplicate-delivery', existingId: 'old' })
  })

  it('does not count the receipt itself as a duplicate, and ignores case and spaces', () => {
    const self = [{ id: 'r1', deliveryNo: 'D-1', status: 'draft' as const }]
    expect(codes(draft(), vctx({ existing: self }))).toEqual([])
    const other = [{ id: 'x', deliveryNo: ' d-1 ', status: 'draft' as const }]
    expect(codes(draft(), vctx({ existing: other }))).toEqual(['duplicate-delivery'])
  })

  it('reports every problem with its line', () => {
    const d = draft([
      line({ n: 1, itemCode: null }),
      line({ n: 2, countedQty: 1 }),
      line({ n: 3, invoicedQty: 0, countedQty: 0 }),
    ])
    const issues = validateForPost(d, vctx())
    expect(issues.map((i) => [i.code, i.line])).toEqual([
      ['unresolved', 1],
      ['diff-reason', 2],
      ['invoiced-qty', 3],
    ])
  })
})

describe('findDuplicateDelivery', () => {
  const existing = [
    { id: 'old', deliveryNo: '555', status: 'posted' as const },
    { id: 'gone', deliveryNo: '777', status: 'cancelled' as const },
  ]
  it('finds a draft or posted receipt by delivery number', () => {
    expect(findDuplicateDelivery(existing, ' 555 ')?.id).toBe('old')
  })
  it('lets a cancelled delivery note be received again', () => {
    expect(findDuplicateDelivery(existing, '777')).toBeNull()
  })
  it('ignores an empty number and the excluded id', () => {
    expect(findDuplicateDelivery(existing, '  ')).toBeNull()
    expect(findDuplicateDelivery(existing, '555', 'old')).toBeNull()
  })
})

describe('toPostBatch', () => {
  it('writes one إضافة movement per line with id {id}-L{n} and the counted quantity', () => {
    const d = draft([
      line({
        n: 1,
        countedQty: 8,
        diffReason: 'نقص',
        priceMinor: 1100,
        batchNo: 'B1',
        expiry: '2028-01',
      }),
      line({ n: 2, itemCode: 'SCR-02', invoicedQty: 4, countedQty: 4, priceMinor: 520 }),
    ])
    const { movements } = toPostBatch(d, pctx())
    expect(movements.map((m) => m.id)).toEqual(['r1-L1', 'r1-L2'])
    expect(movements[0]?.data).toMatchObject({
      type: 'إضافة',
      itemCode: 'SCR-01',
      qty: 8,
      priceMinor: 1100,
      batchNo: 'B1',
      expiry: '2028-01',
      businessDate: TODAY,
      docNumber: 'D-1',
      reference: 'INV-1',
      supplier: 'الهيئة',
      source: { kind: 'receipt', id: 'r1' },
      deviceId: 'dev-1',
      createdBy: 'owner',
      reverses: null,
      substituteFor: null,
    })
    expect(movements[1]?.data.qty).toBe(4)
  })

  it('writes no movement for a line with counted 0, and keeps it on the receipt', () => {
    const d = draft([
      line({ n: 1, countedQty: 0, diffReason: 'لم يصل' }),
      line({ n: 2, itemCode: 'SCR-02', invoicedQty: 3, countedQty: 3 }),
    ])
    const batch = toPostBatch(d, pctx())
    expect(batch.movements.map((m) => m.id)).toEqual(['r1-L2'])
    // The receipt document itself keeps every line, counted 0 included.
    expect(toDraftDoc(d).lines[0]).toMatchObject({
      invoicedQty: 10,
      countedQty: 0,
      diffReason: 'لم يصل',
    })
  })

  it('updates the item price and records priceUpdates from the old price', () => {
    const d = draft([line({ priceMinor: 1100, prevPriceMinor: 1000 })])
    const batch = toPostBatch(d, pctx())
    expect(batch.priceUpdates).toEqual([{ itemCode: 'SCR-01', fromMinor: 1000, toMinor: 1100 }])
    expect(batch.itemUpdates).toEqual([{ code: 'SCR-01', priceMinor: 1100, addGtins: [] }])
    expect(batch.receiptPatch.status).toBe('posted')
    expect(batch.receiptPatch.priceUpdates).toEqual(batch.priceUpdates)
  })

  it('records no price update when the price is unchanged', () => {
    const batch = toPostBatch(draft([line({ priceMinor: 1000 })]), pctx())
    expect(batch.priceUpdates).toEqual([])
    expect(batch.itemUpdates).toEqual([])
  })

  it('uses the last line price when an item appears twice, from the original price', () => {
    const d = draft([
      line({ n: 1, priceMinor: 1100 }),
      line({ n: 2, priceMinor: 1200, batchNo: 'B2' }),
    ])
    const batch = toPostBatch(d, pctx())
    expect(batch.priceUpdates).toEqual([{ itemCode: 'SCR-01', fromMinor: 1000, toMinor: 1200 }])
    expect(batch.movements).toHaveLength(2)
  })

  it('does not update the price of an item that did not arrive', () => {
    const d = draft([line({ countedQty: 0, diffReason: 'x', priceMinor: 1500 })])
    expect(toPostBatch(d, pctx()).priceUpdates).toEqual([])
  })

  it('links a scanned GTIN to the resolved item', () => {
    const d = draft([line({ scannedGtin: '6221234567890', priceMinor: 1000 })])
    const batch = toPostBatch(d, pctx())
    expect(batch.itemUpdates).toEqual([
      { code: 'SCR-01', priceMinor: null, addGtins: ['6221234567890'] },
    ])
    expect(batch.warnings).toEqual([])
  })

  it('does not link a GTIN the item already holds', () => {
    const ctx = pctx({ items: [item('SCR-01', { gtins: ['6221234567890'] })] })
    const batch = toPostBatch(draft([line({ scannedGtin: '6221234567890' })]), ctx)
    expect(batch.itemUpdates).toEqual([])
  })

  it('warns when another item already holds the GTIN, and still links it to the chosen item', () => {
    const ctx = pctx({
      items: [item('SCR-01'), item('SCR-02', { gtins: ['6221234567890'] })],
    })
    const batch = toPostBatch(draft([line({ scannedGtin: '6221234567890' })]), ctx)
    expect(batch.warnings).toEqual([
      expect.objectContaining({ kind: 'gtin-held', line: 1, heldBy: ['SCR-02'] }),
    ])
    expect(batch.itemUpdates[0]?.addGtins).toEqual(['6221234567890'])
  })

  it('skips a GTIN the item schema cannot hold (14 digits) with a warning', () => {
    const batch = toPostBatch(draft([line({ scannedGtin: '16221234567897' })]), pctx())
    expect(batch.itemUpdates).toEqual([])
    expect(batch.warnings[0]).toMatchObject({ kind: 'gtin-unsupported', line: 1 })
  })

  it('links one GTIN once even when two lines scan it', () => {
    const d = draft([
      line({ n: 1, scannedGtin: '6221234567890' }),
      line({ n: 2, scannedGtin: '6221234567890', batchNo: 'B2' }),
    ])
    expect(toPostBatch(d, pctx()).itemUpdates[0]?.addGtins).toEqual(['6221234567890'])
  })

  it('links nothing for a line resolved by authority code (FR-017)', () => {
    const d = draft([line({ authorityCode: '70000409', scannedGtin: null })])
    const batch = toPostBatch(d, pctx())
    expect(batch.itemUpdates).toEqual([])
    expect(batch.warnings).toEqual([])
  })

  it('throws on a line that cannot be posted (unresolved or unknown item)', () => {
    expect(() => toPostBatch(draft([line({ itemCode: null })]), pctx())).toThrow()
    expect(() => toPostBatch(draft([line({ itemCode: 'ZZZ-99' })]), pctx())).toThrow()
  })

  it('does not mutate its inputs', () => {
    const d = draft([line({ priceMinor: 1100, scannedGtin: '6221234567890' })])
    const snapshot = JSON.stringify(d)
    const ctx = pctx()
    const ctxSnapshot = JSON.stringify(ctx)
    toPostBatch(d, ctx)
    expect(JSON.stringify(d)).toBe(snapshot)
    expect(JSON.stringify(ctx)).toBe(ctxSnapshot)
  })
})

describe('draft model and round trip', () => {
  it('validates and round-trips the header and line fields of FR-030', () => {
    const d = draft(
      [
        line({
          scannedGtin: '6221234567890',
          authorityCode: '70000409',
          mfgDate: '2026-01-15',
          batchNo: 'B7',
          expiry: '2028-01',
          priceMinor: 1100,
          prevPriceMinor: 1000,
          expiredReason: null,
        }),
      ],
      { invoiceDate: '2026-10-01', supplyRequestNo: 'SR-9', supplyOrderNo: 'SO-3' },
    )
    const doc = toDraftDoc(d)
    expect(doc).toMatchObject({
      status: 'draft',
      invoiceDate: '2026-10-01',
      supplyRequestNo: 'SR-9',
      supplyOrderNo: 'SO-3',
      postedAt: null,
      cancelledAt: null,
      cancelReason: null,
      priceUpdates: [],
    })
    const parsed = receiptSchema.parse(doc)
    expect(parsed.lines[0]).toMatchObject({
      authorityCode: '70000409',
      mfgDate: '2026-01-15',
      scannedGtin: '6221234567890',
    })
    expect(parsed.invoiceDate).toBe('2026-10-01')
  })

  it('fills the new optional fields with null when parsing an older document', () => {
    const parsed = receiptSchema.parse({
      status: 'draft',
      supplier: 's',
      deliveryNo: 'd',
      invoiceNo: 'i',
      businessDate: TODAY,
      lines: [
        {
          n: 1,
          itemCode: null,
          scannedGtin: null,
          batchNo: null,
          expiry: null,
          invoicedQty: 1,
          countedQty: 1,
          priceMinor: 0,
          prevPriceMinor: 0,
          diffReason: null,
        },
      ],
    })
    expect(parsed.invoiceDate).toBeNull()
    expect(parsed.lines[0]?.authorityCode).toBeNull()
    expect(parsed.lines[0]?.mfgDate).toBeNull()
  })

  it('newLine numbers lines and prefills nothing risky', () => {
    expect(newLine(3)).toMatchObject({ n: 3, itemCode: null, countedQty: 0, invoicedQty: 0 })
  })

  it('priceChanged flags a price different from the previous one (FR-031)', () => {
    expect(priceChanged(line({ priceMinor: 1100, prevPriceMinor: 1000 }))).toBe(true)
    expect(priceChanged(line({ priceMinor: 1000, prevPriceMinor: 1000 }))).toBe(false)
    expect(priceChanged(line({ itemCode: null, priceMinor: 1, prevPriceMinor: 0 }))).toBe(false)
  })
})

describe('totals', () => {
  it('values a line by the counted quantity (default) or the invoiced one', () => {
    const l = line({ invoicedQty: 10, countedQty: 8, priceMinor: 250 })
    expect(lineValueMinor(l)).toBe(2000)
    expect(lineValueMinor(l, 'invoiced')).toBe(2500)
  })
  it('sums the receipt', () => {
    const lines = [
      line({ countedQty: 2, priceMinor: 100 }),
      line({ countedQty: 3, priceMinor: 50 }),
    ]
    expect(receiptTotalMinor(lines)).toBe(350)
    expect(receiptTotalMinor([])).toBe(0)
  })
})

describe('dates', () => {
  it('cairoToday uses the Cairo calendar day', () => {
    // 22:30 UTC on 11 Oct is 01:30 on 12 Oct in Cairo (UTC+3 in October? UTC+2 or +3: both roll over).
    expect(cairoToday(new Date('2026-10-11T22:30:00Z'))).toBe('2026-10-12')
    expect(cairoToday(new Date('2026-10-11T10:00:00Z'))).toBe('2026-10-11')
  })
  it('expiryEndDay maps a month to its last day and rejects junk', () => {
    expect(expiryEndDay('2028-02')).toBe('2028-02-29')
    expect(expiryEndDay('2026-10-05')).toBe('2026-10-05')
    expect(expiryEndDay('2026-13')).toBeNull()
    expect(expiryEndDay('x')).toBeNull()
  })
})

describe('previewPost (FR-033: warn before posting)', () => {
  it('returns the issues and the gtin warnings without throwing on unresolved lines', () => {
    const items = [item('SCR-01'), item('SCR-02', { gtins: ['6221234567890'] })]
    const d = draft([
      line({ n: 1, scannedGtin: '6221234567890' }),
      line({ n: 2, itemCode: null, scannedGtin: '6221111111111' }),
    ])
    const p = previewPost(d, { ...vctx(), items })
    expect(p.issues.map((i) => i.code)).toEqual(['unresolved'])
    expect(p.warnings).toEqual([expect.objectContaining({ kind: 'gtin-held', line: 1 })])
  })
})
