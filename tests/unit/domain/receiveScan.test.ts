import { describe, expect, it } from 'vitest'
import { classify } from '../../../src/domain/search'
import {
  interpretClass,
  interpretScan,
  planHit,
  stepBatch,
  stepHit,
  stepReview,
} from '../../../src/domain/receiveScan'
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

  it('the next box of a new barcode counts on its line after the first box was given an item', () => {
    const unknown = {
      kind: 'unknown-gtin',
      gtin: '6221234567893',
      batchNo: null,
      expiry: null,
    } as const
    const linked = { ...newLine(1), itemCode: 'AAA-01', scannedGtin: '6221234567893' }
    expect(planHit(draftWith(linked), null, unknown)).toEqual({ kind: 'bump-line', n: 1 })
    expect(planHit(draftWith(), linked, unknown)).toEqual({ kind: 'bump-pending' })
  })
})

describe('stepHit: the next scan finishes the open line by itself', () => {
  const day = '2026-10-12'
  const hit = (item: Item, over: object = {}) =>
    ({
      kind: 'item',
      item,
      gtin: null,
      authorityCode: null,
      batchNo: null,
      expiry: null,
      ...over,
    }) as const
  const ready = (over: object = {}) => ({
    ...newLine(1),
    itemCode: 'AAA-01',
    invoicedQty: 4,
    countedQty: 4,
    ...over,
  })

  it('a ready open line joins the receipt when another item comes, and that item starts a line', () => {
    const step = stepHit(newDraft(day), ready(), hit(B))
    expect(step.kind).toBe('step')
    if (step.kind !== 'step') return
    expect(step.joined).toBe(true)
    expect(step.draft.lines).toHaveLength(1)
    expect(step.draft.lines[0]).toMatchObject({ n: 1, itemCode: 'AAA-01', countedQty: 4 })
    expect(step.pending).toMatchObject({ n: 2, itemCode: 'AAA-02', countedQty: 1 })
  })

  it('the same item and batch as the open line counts on it; another batch joins and starts', () => {
    const same = stepHit(newDraft(day), ready(), hit(A))
    expect(same).toMatchObject({ kind: 'step', joined: false })
    expect(same.kind === 'step' && same.pending?.countedQty).toBe(5)
    expect(same.kind === 'step' && same.draft.lines).toHaveLength(0)
    const other = stepHit(newDraft(day), ready({ batchNo: 'B1' }), hit(A, { batchNo: 'B2' }))
    expect(other.kind === 'step' && other.draft.lines).toHaveLength(1)
    expect(other.kind === 'step' && other.pending).toMatchObject({ n: 2, batchNo: 'B2' })
  })

  it('after joining, a scan that matches a line already on the receipt counts on that line', () => {
    const d = addLine(newDraft(day), { ...newLine(1), itemCode: 'AAA-02', countedQty: 2 })
    const step = stepHit(d, ready({ n: 2 }), hit(B))
    expect(step).toMatchObject({ kind: 'step', joined: true, pending: null })
    if (step.kind !== 'step') return
    expect(step.draft.lines.map((l) => [l.itemCode, l.countedQty])).toEqual([
      ['AAA-02', 3],
      ['AAA-01', 4],
    ])
  })

  it('an open line that cannot join stays open: the new item is refused and nothing is added', () => {
    const step = stepHit(newDraft(day), ready({ invoicedQty: 0 }), hit(B))
    expect(step.kind).toBe('busy')
    expect(step.kind === 'busy' && step.problem).toContain('الكمية في الفاتورة')
  })

  it('an unresolved GTIN, an unreadable expiry and an unexplained expired batch are all refused', () => {
    for (const over of [{ itemCode: null }, { expiry: '13/2031' }, { expiry: '2026-01' }]) {
      expect(stepHit(newDraft(day), ready(over), hit(B)).kind).toBe('busy')
    }
  })

  it('with nothing open, a scan starts a line, or counts on one already there', () => {
    expect(stepHit(newDraft(day), null, hit(A))).toMatchObject({ kind: 'step', joined: false })
    const d = addLine(newDraft(day), { ...newLine(1), itemCode: 'AAA-01', countedQty: 1 })
    const step = stepHit(d, null, hit(A))
    expect(step.kind === 'step' && step.draft.lines[0]?.countedQty).toBe(2)
  })
})

describe('stepBatch: a second batch of the same item', () => {
  const day = '2026-10-12'
  const ready = { ...newLine(1), itemCode: 'AAA-01', invoicedQty: 4, countedQty: 4 }

  it('joins a ready open line and opens a fresh one with nothing counted', () => {
    const step = stepBatch(newDraft(day), ready, A)
    expect(step.kind).toBe('step')
    if (step.kind !== 'step') return
    expect(step.draft.lines).toHaveLength(1)
    expect(step.pending).toMatchObject({ n: 2, itemCode: 'AAA-01', countedQty: 0 })
  })

  it('is refused while the open line is not ready', () => {
    expect(stepBatch(newDraft(day), { ...ready, invoicedQty: 0 }, A).kind).toBe('busy')
  })
})

describe('stepReview: review takes the open line with it', () => {
  const day = '2026-10-12'
  const ready = { ...newLine(1), itemCode: 'AAA-01', invoicedQty: 4, countedQty: 4 }

  it('a ready open line joins the receipt', () => {
    const step = stepReview(newDraft(day), ready)
    expect(step.kind === 'ok' && step.draft.lines).toHaveLength(1)
  })

  it('with nothing open the draft goes through as it is', () => {
    const d = newDraft(day)
    expect(stepReview(d, null)).toEqual({ kind: 'ok', draft: d })
  })

  it('an open line that cannot join blocks the review and says why', () => {
    const step = stepReview(newDraft(day), { ...ready, itemCode: null })
    expect(step.kind).toBe('blocked')
    expect(step.kind === 'blocked' && step.problem).toContain('اختار الصنف')
  })
})

describe('a blocked open line (a quantity field holds text that is not a whole number)', () => {
  const day = '2026-10-12'
  const WHY = 'اكتب رقم صحيح'
  const ready = { ...newLine(1), itemCode: 'AAA-01', invoicedQty: 4, countedQty: 4 }
  const hitB = {
    kind: 'item',
    item: B,
    gtin: null,
    authorityCode: null,
    batchNo: null,
    expiry: null,
  } as const

  it('stepHit refuses another item and leaves the line and the receipt alone', () => {
    expect(stepHit(newDraft(day), ready, hitB, WHY)).toEqual({ kind: 'busy', problem: WHY })
  })

  it('stepHit still counts the same item on the open line', () => {
    const same = { ...hitB, item: A }
    const step = stepHit(newDraft(day), ready, same, WHY)
    expect(step.kind === 'step' && step.pending?.countedQty).toBe(5)
    expect(step.kind === 'step' && step.draft.lines).toHaveLength(0)
  })

  it('stepBatch and stepReview refuse', () => {
    expect(stepBatch(newDraft(day), ready, A, WHY)).toEqual({ kind: 'busy', problem: WHY })
    expect(stepReview(newDraft(day), ready, WHY)).toEqual({ kind: 'blocked', problem: WHY })
  })

  it('with no open line the reason changes nothing', () => {
    const d = newDraft(day)
    expect(stepReview(d, null, WHY)).toEqual({ kind: 'ok', draft: d })
  })
})
