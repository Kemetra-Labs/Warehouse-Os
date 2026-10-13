import { describe, expect, it } from 'vitest'
import { buildHistory, type HistoryMovement } from '../../../src/domain/itemHistory'
import {
  applyItemEdit,
  buildItem,
  categoriesOf,
  draftFromItem,
  emptyDraft,
  filterCounts,
  filterItems,
  itemEditPatch,
  suggestItemCode,
  suggestPage,
  validateItemDraft,
  type ItemDraft,
} from '../../../src/domain/items'
import { MOVEMENT_TYPES, STATUS_LABELS, type Item } from '../../../src/domain/types'
import { item } from '../../helpers/receiptFixtures'

const SCR_1 = item('SCR-01', { page: 1, category: 'مسامير', nameAr: 'مسمار عظم', priceMinor: 1000 })
const SCR_2 = item('SCR-02', {
  page: 2,
  category: 'مسامير',
  nameAr: 'مسمار نخاع',
  nameEn: 'Nail',
  gtins: ['6001234567890'],
  authorityCode: '70000409',
})
const PLT_1 = item('PLT-07', { page: 9, category: 'شرائح', nameAr: 'شريحة ساق' })
const ITEMS: readonly Item[] = [SCR_1, SCR_2, PLT_1]

/** A valid draft for a brand-new item; tests change one field at a time. */
const fresh = (over: Partial<ItemDraft> = {}): ItemDraft => ({
  ...emptyDraft(ITEMS),
  code: 'SCR-03',
  page: 10,
  category: 'مسامير',
  nameAr: 'مسمار جديد',
  priceMinor: 500,
  ...over,
})

/** A draft of an existing item, as the edit form starts. */
const editing = (it: Item, over: Partial<ItemDraft> = {}): ItemDraft => ({
  ...draftFromItem(it),
  ...over,
})

describe('validateItemDraft: new item', () => {
  it('accepts a complete draft with no errors or warnings', () => {
    const res = validateItemDraft(fresh(), ITEMS, null)
    expect(res.errors).toEqual({})
    expect(res.warnings).toEqual([])
  })

  it('rejects a code that is already used (case does not matter)', () => {
    expect(validateItemDraft(fresh({ code: 'SCR-01' }), ITEMS, null).errors.code).toBeDefined()
    expect(validateItemDraft(fresh({ code: 'scr-02' }), ITEMS, null).errors.code).toBeDefined()
  })

  it('rejects a code that does not look like AAA-NN', () => {
    for (const bad of ['', 'SCR1', 'SC-01', 'SCR-1', 'SCR-0001']) {
      expect(validateItemDraft(fresh({ code: bad }), ITEMS, null).errors.code).toBeDefined()
    }
  })

  it('rejects a page that another item already has, naming that item', () => {
    const res = validateItemDraft(fresh({ page: 2 }), ITEMS, null)
    expect(res.errors.page).toContain('SCR-02')
  })

  it('rejects a missing, zero or fractional page', () => {
    for (const bad of [null, 0, -1, 2.5]) {
      expect(validateItemDraft(fresh({ page: bad }), ITEMS, null).errors.page).toBeDefined()
    }
  })

  it('needs a name, a category and a price of zero or more', () => {
    expect(validateItemDraft(fresh({ nameAr: '  ' }), ITEMS, null).errors.nameAr).toBeDefined()
    expect(validateItemDraft(fresh({ category: '' }), ITEMS, null).errors.category).toBeDefined()
    expect(
      validateItemDraft(fresh({ priceMinor: null }), ITEMS, null).errors.priceMinor,
    ).toBeDefined()
    expect(
      validateItemDraft(fresh({ priceMinor: -1 }), ITEMS, null).errors.priceMinor,
    ).toBeDefined()
    expect(validateItemDraft(fresh({ priceMinor: 0 }), ITEMS, null).errors).toEqual({})
  })

  it('accepts a manual reorder point that is empty or a whole number of 0 or more', () => {
    expect(validateItemDraft(fresh({ reorderManual: null }), ITEMS, null).errors).toEqual({})
    expect(validateItemDraft(fresh({ reorderManual: 12 }), ITEMS, null).errors).toEqual({})
    expect(
      validateItemDraft(fresh({ reorderManual: -3 }), ITEMS, null).errors.reorderManual,
    ).toBeDefined()
    expect(
      validateItemDraft(fresh({ reorderManual: 1.5 }), ITEMS, null).errors.reorderManual,
    ).toBeDefined()
  })
})

describe('validateItemDraft: GTINs and authority code', () => {
  it('accepts 8 and 13 digit GTINs and rejects any other length or letters', () => {
    expect(
      validateItemDraft(fresh({ gtins: ['12345670', '6009876543210'] }), ITEMS, null).errors,
    ).toEqual({})
    for (const bad of ['123456', '123456789012', '60012345678901', '60012345678AB']) {
      expect(validateItemDraft(fresh({ gtins: [bad] }), ITEMS, null).errors.gtins).toBeDefined()
    }
  })

  it('rejects the same GTIN twice in one item', () => {
    const res = validateItemDraft(fresh({ gtins: ['12345670', '12345670'] }), ITEMS, null)
    expect(res.errors.gtins).toBeDefined()
  })

  it('warns, but does not block, when a GTIN already belongs to another item', () => {
    const res = validateItemDraft(fresh({ gtins: ['6001234567890'] }), ITEMS, null)
    expect(res.errors).toEqual({})
    expect(res.warnings).toHaveLength(1)
    expect(res.warnings[0]).toContain('SCR-02')
  })

  it('does not warn again about a GTIN the edited item already had', () => {
    const twin = item('SCR-09', { page: 11, gtins: ['6001234567890'] })
    const res = validateItemDraft(editing(twin), [...ITEMS, twin], twin)
    expect(res.warnings).toEqual([])
  })

  it('takes an empty authority code, or 8 to 9 digits', () => {
    expect(validateItemDraft(fresh({ authorityCode: '' }), ITEMS, null).errors).toEqual({})
    expect(validateItemDraft(fresh({ authorityCode: '150004771' }), ITEMS, null).errors).toEqual({})
    for (const bad of ['1234567', '1234567890', '7000040A']) {
      expect(
        validateItemDraft(fresh({ authorityCode: bad }), ITEMS, null).errors.authorityCode,
      ).toBeDefined()
    }
  })

  it('rejects an authority code that another item holds', () => {
    const res = validateItemDraft(fresh({ authorityCode: '70000409' }), ITEMS, null)
    expect(res.errors.authorityCode).toContain('SCR-02')
  })
})

describe('validateItemDraft: editing an existing item', () => {
  it('never checks the code: it is locked to the item', () => {
    const res = validateItemDraft(editing(SCR_1, { code: 'whatever' }), ITEMS, SCR_1)
    expect(res.errors.code).toBeUndefined()
  })

  it('lets an item keep a page that data already shares, as long as it is unchanged', () => {
    const clash = item('SCR-04', { page: 1 })
    const all = [...ITEMS, clash]
    expect(validateItemDraft(editing(clash, { priceMinor: 2000 }), all, clash).errors).toEqual({})
  })

  it('rejects changing the page to one that another item has', () => {
    const res = validateItemDraft(editing(SCR_1, { page: 9 }), ITEMS, SCR_1)
    expect(res.errors.page).toContain('PLT-07')
  })

  it('lets an item keep its own authority code but not take another item’s', () => {
    expect(validateItemDraft(editing(SCR_2), ITEMS, SCR_2).errors).toEqual({})
    const taken = validateItemDraft(editing(SCR_1, { authorityCode: '70000409' }), ITEMS, SCR_1)
    expect(taken.errors.authorityCode).toBeDefined()
  })
})

describe('building the stored item', () => {
  it('trims text, drops blank GTINs, and turns a blank authority code into null', () => {
    const built = buildItem(
      fresh({
        nameAr: '  مسمار جديد ',
        nameEn: ' Nail ',
        gtins: [' 12345670 ', ''],
        authorityCode: ' ',
        unit: '',
      }),
    )
    expect(built).toMatchObject({
      code: 'SCR-03',
      nameAr: 'مسمار جديد',
      nameEn: 'Nail',
      gtins: ['12345670'],
      authorityCode: null,
      unit: 'قطعة',
      priceMinor: 500,
      page: 10,
    })
    expect('updatedAt' in built).toBe(false)
  })

  it('keeps the code of the original item when editing', () => {
    const edited = applyItemEdit(SCR_2, editing(SCR_2, { code: 'XXX-99', priceMinor: 4321 }))
    expect(edited.code).toBe('SCR-02')
    expect(edited.priceMinor).toBe(4321)
    expect(edited.authorityCode).toBe('70000409')
    expect(edited.gtins).toEqual(['6001234567890'])
    expect(edited.active).toBe(true)
  })

  it('does not change the original item', () => {
    const frozen = Object.freeze({ ...SCR_1, gtins: Object.freeze(['12345670']) as string[] })
    expect(() => applyItemEdit(frozen, editing(frozen, { priceMinor: 1 }))).not.toThrow()
    expect(frozen.priceMinor).toBe(1000)
  })

  it('refuses a draft that has no page or price', () => {
    expect(() => buildItem(fresh({ page: null }))).toThrow()
    expect(() => buildItem(fresh({ priceMinor: null }))).toThrow()
  })
})

describe('an edit writes only the fields the user changed', () => {
  it('is empty when nothing was changed', () => {
    expect(itemEditPatch(SCR_2, editing(SCR_2))).toEqual({})
  })

  it('holds just the changed field', () => {
    expect(itemEditPatch(SCR_2, editing(SCR_2, { nameEn: 'Nail 4.5' }))).toEqual({
      nameEn: 'Nail 4.5',
    })
  })

  it('leaves out the price when the form did not touch it, so a newer price from a receipt survives', () => {
    // The form opened on SCR_2; meanwhile a receipt on another device changed the price.
    const patch = itemEditPatch(SCR_2, editing(SCR_2, { size: '4.5 مم' }))
    expect('priceMinor' in patch).toBe(false)
    expect('gtins' in patch).toBe(false)
  })

  it('compares GTIN lists by value', () => {
    expect(itemEditPatch(SCR_2, editing(SCR_2, { gtins: ['6001234567890'] }))).toEqual({})
    expect(itemEditPatch(SCR_2, editing(SCR_2, { gtins: ['6001234567890', '12345670'] }))).toEqual({
      gtins: ['6001234567890', '12345670'],
    })
  })

  it('never carries the code', () => {
    expect('code' in itemEditPatch(SCR_2, editing(SCR_2, { code: 'XXX-99' }))).toBe(false)
  })
})

describe('an item edit never touches the prices of past movements', () => {
  const ts = (ms: number): object => ({ toMillis: () => ms })
  const move = (
    id: string,
    type: HistoryMovement['type'],
    qty: number,
    priceMinor: number,
    businessDate: string,
  ): HistoryMovement => ({
    id,
    type,
    itemCode: 'SCR-01',
    qty,
    businessDate,
    postedAt: ts(Date.parse(businessDate)),
    priceMinor,
    batchNo: null,
    expiry: null,
    docNumber: null,
    reference: null,
    note: null,
    supplier: null,
    source: { kind: 'import', id: null },
    substituteFor: null,
    reverses: null,
    reason: null,
    deviceId: 'd',
    createdBy: 'u',
  })

  it('shows the same price on every movement before and after the price changes', () => {
    const movements: readonly HistoryMovement[] = Object.freeze([
      move('m1', MOVEMENT_TYPES.ADD, 10, 1000, '2026-08-01'),
      move('m2', MOVEMENT_TYPES.ISSUE, 4, 1000, '2026-08-05'),
      move('m3', MOVEMENT_TYPES.ADD, 6, 1250, '2026-09-01'),
    ])
    const millisOf = (t: unknown): number => (t as { toMillis(): number }).toMillis()
    const before = buildHistory(movements, 'SCR-01', millisOf)

    const edited = applyItemEdit(SCR_1, editing(SCR_1, { priceMinor: 999_999 }))
    const after = buildHistory(movements, 'SCR-01', millisOf)

    expect(edited.priceMinor).toBe(999_999)
    expect(after.map((e) => e.movement.priceMinor)).toEqual([1000, 1000, 1250])
    expect(after).toEqual(before)
  })
})

describe('suggestions for a new item', () => {
  it('suggests the next number after the highest one on the category prefix', () => {
    expect(suggestItemCode(ITEMS, 'مسامير')).toBe('SCR-03')
    expect(suggestItemCode(ITEMS, 'شرائح')).toBe('PLT-08')
  })

  it('pads to two digits, and grows to three after 99', () => {
    const big = [item('SCR-99', { category: 'مسامير' })]
    expect(suggestItemCode(big, 'مسامير')).toBe('SCR-100')
    expect(suggestItemCode([item('SCR-04', { category: 'مسامير' })], 'مسامير')).toBe('SCR-05')
  })

  it('uses the most common prefix for a new category, and ITM for an empty list', () => {
    expect(suggestItemCode(ITEMS, 'فئة جديدة')).toBe('SCR-03')
    expect(suggestItemCode([], '')).toBe('ITM-01')
  })

  it('never suggests a code that exists', () => {
    const codes = ITEMS.map((i) => i.code)
    expect(codes).not.toContain(suggestItemCode(ITEMS, 'مسامير'))
  })

  it('suggests one more than the highest page, or 1 when there are no items', () => {
    expect(suggestPage(ITEMS)).toBe(10)
    expect(suggestPage([])).toBe(1)
  })

  it('starts a new draft with both suggestions filled in', () => {
    const draft = emptyDraft(ITEMS)
    expect(draft.page).toBe(10)
    expect(draft.code).toBe('SCR-03')
    expect(draft.active).toBe(true)
    expect(draft.gtins).toEqual([])
  })
})

describe('filtering the item list', () => {
  const row = (it: Item, status: string, pending = false) => ({
    item: it,
    status,
    pendingSettlement: pending,
  })
  const rows = [
    row(SCR_1, STATUS_LABELS.REORDER),
    row(SCR_2, STATUS_LABELS.OUT),
    row(PLT_1, STATUS_LABELS.OVERDRAWN, true),
    row(item('OLD-01', { page: 20, active: false }), STATUS_LABELS.AVAILABLE),
  ]
  const codes = (list: readonly { item: Item }[]): string[] => list.map((r) => r.item.code)
  const none = { filter: 'all', category: null, text: '' } as const

  it('lists active items by page, hiding stopped ones', () => {
    expect(codes(filterItems(rows, none))).toEqual(['SCR-01', 'SCR-02', 'PLT-07'])
  })

  it('filters by status label (the constant, not the filter name)', () => {
    expect(codes(filterItems(rows, { ...none, filter: 'reorder' }))).toEqual(['SCR-01'])
    expect(codes(filterItems(rows, { ...none, filter: 'out' }))).toEqual(['SCR-02'])
    expect(codes(filterItems(rows, { ...none, filter: 'pending' }))).toEqual(['PLT-07'])
  })

  it('shows only the stopped items in their own filter', () => {
    expect(codes(filterItems(rows, { ...none, filter: 'inactive' }))).toEqual(['OLD-01'])
  })

  it('filters by category and combines it with a status', () => {
    expect(codes(filterItems(rows, { ...none, category: 'مسامير' }))).toEqual(['SCR-01', 'SCR-02'])
    expect(codes(filterItems(rows, { ...none, category: 'مسامير', filter: 'out' }))).toEqual([
      'SCR-02',
    ])
  })

  it('searches by page, code, name, GTIN and authority code', () => {
    const find = (text: string) => codes(filterItems(rows, { ...none, text }))
    expect(find('9')).toEqual(['PLT-07'])
    expect(find('SCR-02')).toEqual(['SCR-02'])
    expect(find('scr-0')).toEqual(['SCR-01', 'SCR-02'])
    expect(find('مسمار نخاع')).toEqual(['SCR-02'])
    expect(find('nail')).toEqual(['SCR-02'])
    expect(find('6001234567890')).toEqual(['SCR-02'])
    expect(find('70000409')).toEqual(['SCR-02'])
    expect(find('لا يوجد')).toEqual([])
  })

  it('counts each filter over all rows', () => {
    expect(filterCounts(rows)).toEqual({ all: 3, reorder: 1, out: 1, pending: 1, inactive: 1 })
  })

  it('lists every category once, sorted', () => {
    expect(categoriesOf([...ITEMS, SCR_2])).toEqual(['شرائح', 'مسامير'])
    expect(categoriesOf([])).toEqual([])
  })
})
