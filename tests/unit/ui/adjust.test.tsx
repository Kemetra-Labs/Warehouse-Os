import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ManualAttempt } from '../../../src/data/cancelPost'
import type { ItemRow } from '../../../src/data/deriveLedger'
import type { ManualInput } from '../../../src/domain/adjust'
import { batchBalances } from '../../../src/domain/ledger'
import { AdjustView } from '../../../src/ui/screens/Adjust'
import { initialForm, toManualInput } from '../../../src/ui/screens/adjustForm'
import { buttonByText, click, flush, inputByLabel, type } from '../../helpers/dom'
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

const TODAY = '2026-10-12'
const SCR = item('SCR-01', { nameAr: 'مسمار قشري', priceMinor: 1250 })

const rowOf = (balance: number): ItemRow => ({
  item: SCR,
  balance,
  issued: 0,
  reorder: 5,
  status: 'x',
  pendingSettlement: balance < 0,
  lastPostedAt: null,
  changedSinceSeen: false,
})

// Added 4 in batch N1, issued 6 in batch N2: N2 is the one below zero. Balance is -2.
const MOVES = [
  { type: 'إضافة', qty: 4, itemCode: 'SCR-01', batchNo: 'N1', expiry: '2027-01' },
  { type: 'صرف', qty: 6, itemCode: 'SCR-01', batchNo: 'N2', expiry: '2028-01' },
] as const
const batches = batchBalances(MOVES, 'SCR-01')

const ok: ManualAttempt = { ok: true, committed: Promise.resolve('acked') }

async function mount(el: ReactElement): Promise<void> {
  await act(async () => root.render(<MemoryRouter>{el}</MemoryRouter>))
  await flush()
}

const view = (balance: number, onSave: (i: ManualInput) => Promise<ManualAttempt>) => (
  <AdjustView row={rowOf(balance)} batches={batches} today={TODAY} onSave={onSave} />
)

const field = (label: string) => inputByLabel(host, label)
const select = () => host.querySelector('select') as HTMLSelectElement
const save = (text: string) => buttonByText(host, text)

describe('the adjust form state', () => {
  it('opens a pending settlement as the adjustment that clears it, on the negative batch', () => {
    const form = initialForm(-2, batches, TODAY)
    expect(form).toMatchObject({
      kind: 'adjust',
      direction: 'up',
      qtyText: '6',
      reason: 'تسوية رصيد سالب',
    })
    const result = toManualInput(form, { itemCode: 'SCR-01', priceMinor: 1250 }, batches)
    expect(result).toMatchObject({
      ok: true,
      input: { kind: 'adjust', qty: 6, batchNo: 'N2', expiry: '2028-01' },
    })
  })

  it('opens an item with stock as an empty return', () => {
    expect(initialForm(3, batches, TODAY)).toMatchObject({
      kind: 'return',
      qtyText: '',
      reason: '',
    })
  })

  it('signs a decrease, and reads a new batch with its expiry', () => {
    const form = {
      ...initialForm(3, batches, TODAY),
      kind: 'adjust' as const,
      direction: 'down' as const,
      qtyText: '2',
      batch: '__new__',
      newBatchNo: ' Z9 ',
      newExpiry: '03/2031',
    }
    expect(toManualInput(form, { itemCode: 'SCR-01', priceMinor: 1 }, batches)).toMatchObject({
      ok: true,
      input: { qty: -2, batchNo: 'Z9', expiry: '2031-03' },
    })
  })

  it('reports text that is not a quantity or an expiry', () => {
    const base = { ...initialForm(3, batches, TODAY), batch: '__new__' }
    const target = { itemCode: 'SCR-01', priceMinor: 1 }
    expect(toManualInput({ ...base, qtyText: '1.5' }, target, batches)).toMatchObject({ ok: false })
    expect(
      toManualInput({ ...base, qtyText: '1', newExpiry: '13/2031' }, target, batches),
    ).toMatchObject({
      ok: false,
    })
  })
})

describe('AdjustView', () => {
  it('has an Arabic heading and the item, balance and pending settlement', async () => {
    await mount(view(-2, () => Promise.resolve(ok)))
    expect(host.querySelector('h1')?.textContent).toBe('مرتجع وتسوية')
    expect(host.textContent).toContain('مسمار قشري')
    expect(host.textContent).toContain('تسوية معلّقة')
  })

  it('prefills the settlement, previews the balance at 0 and saves one signed adjustment', async () => {
    const onSave = vi.fn(() => Promise.resolve(ok))
    await mount(view(-2, onSave))
    expect(field('الكمية')?.value).toBe('6')
    expect(select().value).toBe('N2\u00002028-01')
    expect(host.querySelector('[data-testid="adjust-preview"]')?.textContent).toContain(
      'الرصيد بعد الحركة 4',
    )
    click(save('سجّل التسوية'))
    await flush()
    expect(onSave).toHaveBeenCalledWith({
      kind: 'adjust',
      itemCode: 'SCR-01',
      qty: 6,
      batchNo: 'N2',
      expiry: '2028-01',
      priceMinor: 1250,
      reason: 'تسوية رصيد سالب',
      businessDate: TODAY,
    })
    expect(host.querySelector('[data-testid="adjust-done"]')?.textContent).toContain('تسوية +6')
    expect(save('سجّل التسوية')).toBeNull()
  })

  it('keeps save off until there is a quantity and a reason', async () => {
    const onSave = vi.fn(() => Promise.resolve(ok))
    await mount(view(5, onSave))
    expect(save('سجّل المرتجع')?.disabled).toBe(true)
    type(field('الكمية'), '2')
    expect(save('سجّل المرتجع')?.disabled).toBe(true)
    type(field('السبب'), 'رجع من المندوب')
    expect(save('سجّل المرتجع')?.disabled).toBe(false)
    click(save('سجّل المرتجع'))
    await flush()
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ kind: 'return', qty: 2 }))
  })

  it('shows what is missing once a reason is typed', async () => {
    await mount(view(5, () => Promise.resolve(ok)))
    type(field('السبب'), 'جرد')
    expect(host.querySelector('[aria-label="لسه ناقص"]')?.textContent).toContain('كمية')
  })

  it('says so when the movement is refused or cannot be saved', async () => {
    const refused: ManualAttempt = {
      ok: false,
      problems: [{ code: 'reason', message: 'اكتب السبب.' }],
    }
    await mount(view(5, () => Promise.resolve(refused)))
    type(field('الكمية'), '1')
    type(field('السبب'), 'x')
    click(save('سجّل المرتجع'))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('اكتب السبب')
    expect(save('سجّل المرتجع')).not.toBeNull()
  })

  it('offers the quick reasons of the kind', async () => {
    await mount(view(5, () => Promise.resolve(ok)))
    click(buttonByText(host, 'رجع من المندوب'))
    expect(field('السبب')?.value).toBe('رجع من المندوب')
  })
})
