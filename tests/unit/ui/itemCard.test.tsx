import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ItemRow } from '../../../src/data/deriveLedger'
import { buildHistory, type HistoryMovement } from '../../../src/domain/itemHistory'
import { batchBalances } from '../../../src/domain/ledger'
import { MOVEMENT_TYPES } from '../../../src/domain/types'
import { ItemCardView } from '../../../src/ui/screens/ItemCard'
import { item } from '../../helpers/receiptFixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const render = (el: ReactElement): void => act(() => root.render(<MemoryRouter>{el}</MemoryRouter>))

const millisOf = (t: unknown): number => (t as { ms: number }).ms

let seq = 0
function move(
  over: Partial<HistoryMovement> & Pick<HistoryMovement, 'id' | 'type' | 'qty'>,
): HistoryMovement {
  seq += 1
  return {
    itemCode: 'SCR-01',
    businessDate: '2026-09-01',
    postedAt: { ms: seq },
    priceMinor: 1000,
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
    ...over,
  }
}

// An addition, an issue, a substitute issue, and a reversal of the first issue.
const MOVEMENTS: readonly HistoryMovement[] = [
  move({ id: 'a', type: MOVEMENT_TYPES.ADD, qty: 20, batchNo: 'B1', expiry: '2027-03' }),
  move({
    id: 'b',
    type: MOVEMENT_TYPES.ISSUE,
    qty: 5,
    businessDate: '2026-09-05',
    priceMinor: 1250,
    batchNo: 'B1',
    expiry: '2027-03',
    docNumber: '1001',
    reference: 'دفعة 14',
    source: { kind: 'issue', id: 'batch-14' },
  }),
  move({
    id: 'c',
    type: MOVEMENT_TYPES.ISSUE,
    qty: 2,
    businessDate: '2026-09-06',
    batchNo: 'B1',
    expiry: '2027-03',
    substituteFor: { itemCode: 'SCR-09', qty: 2 },
  }),
  move({
    id: 'rev-b',
    type: MOVEMENT_TYPES.ADJUST,
    qty: 5,
    businessDate: '2026-09-07',
    priceMinor: 1250,
    batchNo: 'B1',
    expiry: '2027-03',
    reverses: 'b',
    reason: 'اتصرف بالغلط',
    source: { kind: 'manual', id: null },
  }),
]

const ROW: ItemRow = {
  item: item('SCR-01', {
    page: 12,
    category: 'مسامير',
    nameAr: 'مسمار عظم',
    nameEn: 'Bone Screw',
    gtins: ['6001234567890'],
    authorityCode: '70000409',
    priceMinor: 9999,
  }),
  balance: 18,
  issued: 7,
  reorder: 6,
  status: 'متاح',
  pendingSettlement: false,
  lastPostedAt: 10,
  changedSinceSeen: false,
}

function show(over: Partial<ItemRow> = {}, today = '2026-10-12'): void {
  render(
    <ItemCardView
      row={{ ...ROW, ...over }}
      batches={batchBalances(MOVEMENTS, 'SCR-01')}
      history={buildHistory(MOVEMENTS, 'SCR-01', millisOf)}
      today={today}
    />,
  )
}

const rows = (): HTMLElement[] => [
  ...host.querySelectorAll<HTMLElement>('[data-testid=history-row]'),
]

describe('ItemCardView: master data, balance and status', () => {
  it('shows the name, page, code, balance, status and reorder point', () => {
    show()
    const text = host.textContent ?? ''
    for (const part of ['مسمار عظم', 'Bone Screw', '12', 'SCR-01', 'متاح', 'مسامير']) {
      expect(text).toContain(part)
    }
    expect(host.querySelector('[data-testid=item-balance]')?.textContent).toBe('18')
    expect(text).toContain('حد الطلب')
    expect(text).toContain('محسوب من الصرف')
  })

  it('shows the current price, the GTIN and the authority code', () => {
    show()
    expect(host.querySelector('[data-testid=item-price]')?.textContent).toBe('99.99')
    expect(host.textContent).toContain('6001234567890')
    expect(host.textContent).toContain('70000409')
  })

  it('says a manual reorder point is manual, and a negative balance is a pending settlement', () => {
    show({
      item: { ...ROW.item, reorderManual: 9 },
      reorder: 9,
      balance: -2,
      pendingSettlement: true,
      status: 'تجاوز — رصيد سالب',
    })
    expect(host.textContent).toContain('يدوي')
    expect(host.textContent).toContain('تسوية معلّقة')
    expect(host.textContent).toContain('تجاوز — رصيد سالب')
  })

  it('links to the edit form', () => {
    show()
    const edit = [...host.querySelectorAll('a')].find((a) => a.textContent === 'تعديل')
    expect(edit?.getAttribute('href')).toBe('/items/SCR-01/edit')
  })
})

describe('ItemCardView: batches', () => {
  it('lists each batch with its expiry and balance', () => {
    show()
    const list = host.querySelector('[aria-label="التشغيلات"]')
    expect(list?.textContent).toContain('B1')
    expect(list?.textContent).toContain('03/2027')
    expect(list?.textContent).toContain('18')
    expect(list?.textContent).not.toContain('منتهية')
  })

  it('words an expired batch as expired', () => {
    show({}, '2027-04-01')
    expect(host.querySelector('[aria-label="التشغيلات"]')?.textContent).toContain('منتهية')
  })
})

describe('ItemCardView: movement history', () => {
  it('lists every movement, newest first, with the balance after each', () => {
    show()
    const list = rows()
    expect(list.map((r) => r.id)).toEqual(['mv-rev-b', 'mv-c', 'mv-b', 'mv-a'])
    const balances = list.map((r) => r.querySelector('[aria-label^="الرصيد بعدها"]')?.textContent)
    expect(balances).toEqual(['18', '13', '15', '20'])
  })

  it('shows the price each movement was posted at, not the item’s current price', () => {
    show()
    const prices = rows().map((r) => r.querySelector('[data-testid=history-price]')?.textContent)
    expect(prices).toEqual([
      'السعر وقتها 12.50',
      'السعر وقتها 10.00',
      'السعر وقتها 12.50',
      'السعر وقتها 10.00',
    ])
    expect(host.textContent).toContain('99.99') // the current price is a separate line
  })

  it('names the document and links to it', () => {
    show()
    const issue = rows().find((r) => r.id === 'mv-b')
    const link = issue?.querySelector('a[href="/issue/batch-14"]')
    expect(link?.textContent).toContain('دفعة 14')
    expect(link?.textContent).toContain('1001')
  })

  it('strikes the cancelled movement, labels it, and links it to its reversal', () => {
    show()
    const original = rows().find((r) => r.id === 'mv-b')
    expect(original?.getAttribute('data-struck')).toBe('true')
    expect(original?.textContent).toContain('اتلغت')
    expect(original?.querySelector('a[href="#mv-rev-b"]')).not.toBeNull()
    expect(original?.querySelector('[class*="line"]')).not.toBeNull()
  })

  it('links the reversal back to the original and shows its reason', () => {
    show()
    const reversal = rows().find((r) => r.id === 'mv-rev-b')
    expect(reversal?.getAttribute('data-struck')).toBe('false')
    expect(reversal?.textContent).toContain('عكس حركة')
    expect(reversal?.querySelector('a[href="#mv-b"]')).not.toBeNull()
    expect(reversal?.textContent).toContain('اتصرف بالغلط')
  })

  it('leaves the other movements unstruck, and shows a substitute', () => {
    show()
    expect(
      rows()
        .find((r) => r.id === 'mv-a')
        ?.getAttribute('data-struck'),
    ).toBe('false')
    expect(rows().find((r) => r.id === 'mv-c')?.textContent).toContain('بديل عن')
  })

  it('says so when an item has no movements', () => {
    render(<ItemCardView row={ROW} batches={[]} history={[]} today="2026-10-12" />)
    expect(host.textContent).toContain('مفيش حركات')
    expect(host.textContent).toContain('مفيش تشغيلات')
  })
})
