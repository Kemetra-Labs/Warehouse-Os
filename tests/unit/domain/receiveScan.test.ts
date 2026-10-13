import { describe, expect, it } from 'vitest'
import { classify } from '../../../src/domain/search'
import { interpretClass, interpretScan, planHit } from '../../../src/domain/receiveScan'
import { newDraft, newLine, type ReceiptDraft } from '../../../src/domain/receipt'
import { addLine } from '../../../src/domain/receiptEdit'
import type { Item } from '../../../src/domain/types'

const item = (code: string, over: Partial<Item> = {}): Item => ({
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

const A = item('AAA-01', { page: 1, gtins: ['6001234567890'] })
const B = item('AAA-02', { page: 2, gtins: ['12345678'] })
const C = item('BBB-01', { page: 2, nameAr: 'مسمار نخاعي', authorityCode: '70000409' })
const D = item('BBB-02', { page: 3, nameAr: 'مسمار قشري', authorityCode: '12345678' })
const ITEMS = [A, B, C, D]

describe('interpretScan: the QR is a delivery note, not an item', () => {
  it('routes by format before any shape check', () => {
    // 8 digits would otherwise classify as an ambiguous item number.
    expect(interpretScan(ITEMS, { rawValue: ' 70000409 ', format: 'qr_code' })).toEqual({
      kind: 'qr',
      deliveryNo: '70000409',
    })
  })

  it('sends every other format through the classifier', () => {
    const hit = interpretScan(ITEMS, { rawValue: '6001234567890', format: 'ean_13' })
    expect(hit).toMatchObject({ kind: 'item', item: A, gtin: '6001234567890' })
  })
})

describe('interpretClass', () => {
  it('a known GTIN hits one item; GS1 data carries batch and expiry', () => {
    const gs1 = classify('(01)06001234567890(17)310331(10)B7')
    expect(interpretClass(ITEMS, gs1, 'camera')).toMatchObject({
      kind: 'item',
      item: A,
      gtin: '6001234567890',
      batchNo: 'B7',
      expiry: '2031-03-31',
    })
  })

  it('an unknown GTIN asks to be resolved, keeping the GTIN', () => {
    expect(interpretClass(ITEMS, classify('6221234567893'), 'camera')).toMatchObject({
      kind: 'unknown-gtin',
      gtin: '6221234567893',
    })
    expect(interpretClass(ITEMS, classify('6221234567893'), 'typed')).toMatchObject({
      kind: 'unknown-gtin',
    })
  })

  it('an 8-9 digit number matching two different items asks the user to choose', () => {
    // 12345678 is B's EAN-8 and D's authority code.
    const r = interpretClass(ITEMS, classify('12345678'), 'typed')
    expect(r).toMatchObject({ kind: 'choose' })
    expect(r.kind === 'choose' && r.items.map((i) => i.code)).toEqual(['AAA-02', 'BBB-02'])
  })

  it('an authority code with one match is a hit and records the code as printed', () => {
    expect(interpretClass(ITEMS, classify('70000409'), 'typed')).toMatchObject({
      kind: 'item',
      item: C,
      authorityCode: '70000409',
      gtin: null,
    })
  })

  it('an unmatched 8-digit number from the camera is an unknown EAN-8; typed it is not found', () => {
    expect(interpretClass(ITEMS, classify('87654321'), 'camera')).toMatchObject({
      kind: 'unknown-gtin',
      gtin: '87654321',
    })
    expect(interpretClass(ITEMS, classify('87654321'), 'typed')).toMatchObject({
      kind: 'not-found',
    })
    expect(interpretClass(ITEMS, classify('876543210'), 'camera')).toMatchObject({
      kind: 'not-found',
    })
  })

  it('page, code and name resolve typed input; several matches mean choose', () => {
    expect(interpretClass(ITEMS, classify('1'), 'typed')).toMatchObject({ kind: 'item', item: A })
    expect(interpretClass(ITEMS, classify('2'), 'typed')).toMatchObject({ kind: 'choose' })
    expect(interpretClass(ITEMS, classify('bbb-02'), 'typed')).toMatchObject({
      kind: 'item',
      item: D,
    })
    expect(interpretClass(ITEMS, classify('مسمار'), 'typed')).toMatchObject({ kind: 'choose' })
    expect(interpretClass(ITEMS, classify('مسمار نخاعي'), 'typed')).toMatchObject({
      kind: 'item',
      item: C,
    })
    expect(interpretClass(ITEMS, classify('كرسي'), 'typed')).toMatchObject({ kind: 'not-found' })
  })

  it('from the camera, text that is not a GTIN is not searched as a name', () => {
    expect(interpretClass(ITEMS, classify('مسمار'), 'camera')).toMatchObject({ kind: 'not-found' })
    expect(interpretClass(ITEMS, classify('7'), 'camera')).toMatchObject({ kind: 'not-found' })
  })
})

describe('planHit', () => {
  const day = '2026-10-12'
  const draftWith = (...lines: ReturnType<typeof newLine>[]): ReceiptDraft =>
    lines.reduce(addLine, newDraft(day))
  const hitA = {
    kind: 'item',
    item: A,
    gtin: '6001234567890',
    authorityCode: null,
    batchNo: null,
    expiry: null,
  } as const

  it('with nothing in progress, starts a new line from the item', () => {
    const plan = planHit(draftWith(), null, hitA)
    expect(plan.kind).toBe('start')
    expect(plan.kind === 'start' && plan.line).toMatchObject({
      n: 1,
      itemCode: 'AAA-01',
      countedQty: 1,
      priceMinor: 1000,
    })
  })

  it('a line already in the receipt for the same item is bumped', () => {
    const d = draftWith({ ...newLine(1), itemCode: 'AAA-01', batchNo: 'B1' })
    expect(planHit(d, null, hitA)).toEqual({ kind: 'bump-line', n: 1 })
  })

  it('bumps the latest line when the item has several batches', () => {
    const d = draftWith(
      { ...newLine(1), itemCode: 'AAA-01', batchNo: 'B1' },
      { ...newLine(2), itemCode: 'AAA-01', batchNo: 'B2' },
    )
    expect(planHit(d, null, hitA)).toEqual({ kind: 'bump-line', n: 2 })
  })

  it('a GS1 batch that matches no line starts a new line; one that matches bumps it', () => {
    const d = draftWith({ ...newLine(1), itemCode: 'AAA-01', batchNo: 'B1' })
    expect(planHit(d, null, { ...hitA, batchNo: 'B9' }).kind).toBe('start')
    expect(planHit(d, null, { ...hitA, batchNo: 'B1' })).toEqual({ kind: 'bump-line', n: 1 })
  })

  it('a line being filled in for the same item is bumped, for another item it is busy', () => {
    const pending = { ...newLine(1), itemCode: 'AAA-01' }
    expect(planHit(draftWith(), pending, hitA)).toEqual({ kind: 'bump-pending' })
    const other = { ...hitA, item: B, gtin: '12345678' }
    expect(planHit(draftWith(), pending, other)).toEqual({ kind: 'busy' })
  })

  it('an unknown GTIN scanned twice counts on the same unresolved line', () => {
    const unknown = {
      kind: 'unknown-gtin',
      gtin: '6221234567893',
      batchNo: null,
      expiry: null,
    } as const
    expect(planHit(draftWith(), null, unknown).kind).toBe('start')
    const d = draftWith({ ...newLine(1), itemCode: null, scannedGtin: '6221234567893' })
    expect(planHit(d, null, unknown)).toEqual({ kind: 'bump-line', n: 1 })
    const pending = { ...newLine(1), itemCode: null, scannedGtin: '6221234567893' }
    expect(planHit(draftWith(), pending, unknown)).toEqual({ kind: 'bump-pending' })
  })
})
