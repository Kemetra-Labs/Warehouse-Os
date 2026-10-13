import { newDraft, newLine, type ReceiptDraft } from '../../src/domain/receipt'
import type { Item, ReceiptLine } from '../../src/domain/types'

export const TODAY = '2026-10-12'

export const item = (code: string, over: Partial<Item> = {}): Item => ({
  code,
  page: 1,
  category: 'c',
  nameAr: `صنف ${code}`,
  nameEn: '',
  material: '',
  size: '',
  unit: 'قطعة',
  supplier: '',
  gtins: [],
  authorityCode: null,
  priceMinor: 1000,
  reorderManual: null,
  active: true,
  updatedAt: {},
  ...over,
})

export const ITEM_A = item('AAA-01', {
  page: 1,
  nameAr: 'صنف تجريبي ألف',
  gtins: ['6001234567890'],
  priceMinor: 1250,
})
export const ITEM_B = item('AAA-02', {
  page: 2,
  nameAr: 'صنف تجريبي باء',
  gtins: ['6001234567891'],
  priceMinor: 800,
})
export const ITEM_C = item('BBB-01', { page: 2, nameAr: 'صنف تجريبي جيم', priceMinor: 3025 })
export const ITEM_D = item('BBB-02', { page: 4, nameAr: 'صنف تجريبي دال', priceMinor: 500 })
export const ITEMS = [ITEM_A, ITEM_B, ITEM_C, ITEM_D]

/** A ready-to-post line for an item: invoiced and counted agree, price unchanged. */
export function goodLine(n: number, it: Item, over: Partial<ReceiptLine> = {}): ReceiptLine {
  return {
    ...newLine(n),
    itemCode: it.code,
    batchNo: `B${n}`,
    expiry: '2031-03',
    invoicedQty: 4,
    countedQty: 4,
    priceMinor: it.priceMinor,
    prevPriceMinor: it.priceMinor,
    ...over,
  }
}

export function draftWith(lines: readonly ReceiptLine[], over: Partial<ReceiptDraft> = {}) {
  return {
    ...newDraft(TODAY),
    supplier: 'المركز الدولي',
    deliveryNo: '19808953',
    invoiceNo: '47852',
    lines,
    ...over,
  }
}
