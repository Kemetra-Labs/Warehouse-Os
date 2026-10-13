import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReceiptDraft } from '../../../src/domain/receipt'
import type { ScanSource } from '../../../src/scan/types'
import { Receive } from '../../../src/ui/screens/Receive'
import { buttonByText, click, flush, inputByLabel, submit, type } from '../../helpers/dom'
import { ean, fakeScanSource, qr } from '../../helpers/fakeScanSource'
import { draftWith, goodLine, ITEM_A, ITEM_B, ITEM_D, ITEMS } from '../../helpers/receiptFixtures'
import { newDraft } from '../../../src/domain/receipt'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const GTIN_A = '6001234567890'
const DAY = '2026-10-12'

let host: HTMLDivElement
let root: Root
let latest: ReceiptDraft
let mounts = 0
const onOpenExisting = vi.fn()
const onReview = vi.fn()

function Harness(props: {
  initial: ReceiptDraft
  source: ScanSource
  existing?: { id: string; deliveryNo: string; status: 'draft' | 'posted' | 'cancelled' }[]
}) {
  const [draft, setDraft] = useState(props.initial)
  return (
    <Receive
      draft={draft}
      items={ITEMS}
      existing={props.existing ?? []}
      selfId="self"
      scanSource={props.source}
      onChange={(d) => {
        latest = d
        setDraft(d)
      }}
      onOpenExisting={onOpenExisting}
      onReview={onReview}
    />
  )
}

async function mount(initial: ReceiptDraft = newDraft(DAY), extra: { camera?: boolean } = {}) {
  const fake = fakeScanSource(extra)
  latest = initial
  await act(async () => {
    root.render(<Harness key={++mounts} initial={initial} source={fake.source} />)
  })
  await flush()
  return fake
}

const pending = () => host.querySelector('[data-testid="pending-line"]')
const saved = () => [...host.querySelectorAll('[data-testid="saved-line"]')]
const field = (label: string, scope: ParentNode = host) => inputByLabel(scope, label)
const later = (ms = 2000) => act(() => void vi.advanceTimersByTime(ms))

beforeEach(() => {
  vi.useFakeTimers()
  onOpenExisting.mockClear()
  onReview.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('Receive: the screen', () => {
  it('always shows the search box, even with no camera, and hides the camera', async () => {
    await mount(newDraft(DAY), { camera: false })
    expect(host.querySelector('[role="search"] input')).not.toBeNull()
    expect(host.querySelector('video')).toBeNull()
  })

  it('shows the header chips for supplier, delivery note, invoice, supply request and order', async () => {
    await mount(
      draftWith([], {
        supplyRequestNo: 'REQ-9',
        supplyOrderNo: 'ORD-3',
        invoiceDate: '2026-10-01',
      }),
    )
    const text = host.textContent ?? ''
    for (const expected of ['المركز الدولي', '19808953', '47852', '01/10/2026', 'REQ-9', 'ORD-3']) {
      expect(text).toContain(expected)
    }
  })

  it('review needs at least one line', async () => {
    await mount(draftWith([]))
    expect(buttonByText(host, 'مراجعة')?.disabled).toBe(true)
    await mount(draftWith([goodLine(1, ITEM_A)]))
    expect(buttonByText(host, 'مراجعة')?.disabled).toBe(false)
    click(buttonByText(host, 'مراجعة'))
    expect(onReview).toHaveBeenCalledOnce()
  })
})

describe('Receive: scanning', () => {
  it('a known GTIN opens a line with the item, its page and code, and the last price', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    const card = pending()
    expect(card?.textContent).toContain('صنف تجريبي ألف')
    expect(card?.textContent).toContain('AAA-01')
    expect(field('السعر', card!)?.value).toBe('12.5')
    expect(field('اللي اتعدّ', card!)?.value).toBe('1')
  })

  it('each further scan of the same item adds one to the counted quantity', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    later()
    act(() => cam.emit(ean(GTIN_A)))
    later()
    act(() => cam.emit(ean(GTIN_A)))
    expect(field('اللي اتعدّ', pending()!)?.value).toBe('3')
  })

  it('adding the line puts it on the receipt with what was typed', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    const card = pending()!
    type(field('رقم التشغيلة', card), '0230271')
    type(field('الصلاحية', card), '03/2031')
    type(field('الكمية في الفاتورة', card), '4')
    click(buttonByText(card, 'إضافة للإذن'))
    expect(pending()).toBeNull()
    expect(latest.lines).toHaveLength(1)
    expect(latest.lines[0]).toMatchObject({
      n: 1,
      itemCode: 'AAA-01',
      batchNo: '0230271',
      expiry: '2031-03',
      invoicedQty: 4,
      countedQty: 1,
      scannedGtin: GTIN_A,
    })
    expect(saved()).toHaveLength(1)
  })

  it('a scan of an item already on the receipt counts on its line', async () => {
    const cam = await mount(draftWith([goodLine(1, ITEM_A, { countedQty: 2 })]))
    act(() => cam.emit(ean(GTIN_A)))
    expect(latest.lines[0]?.countedQty).toBe(3)
    expect(pending()).toBeNull()
  })

  it('another item scanned while a line is open does not drop the open line', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    later()
    act(() => cam.emit(ean('6001234567891')))
    expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain('كمّل السطر')
    expect(pending()?.textContent).toContain('AAA-01')
    expect(latest.lines).toHaveLength(0)
  })

  it('an unknown GTIN opens an unresolved line and asks which item it is', async () => {
    const cam = await mount()
    act(() => cam.emit(ean('6221234567893')))
    const card = pending()!
    expect(card.textContent).toContain('6221234567893')
    expect(card.textContent).toContain('مش معروف')
    click(buttonByText(card, 'اختار الصنف'))
    const dialog = host.querySelector('[role="dialog"]')!
    type(dialog.querySelector('input'), '4')
    click(buttonByText(dialog, 'صنف تجريبي دال'))
    expect(pending()?.textContent).toContain('BBB-02')
    expect(field('السعر', pending()!)?.value).toBe('5')
  })

  it('the delivery-note QR fills the delivery number', async () => {
    const cam = await mount(draftWith([], { deliveryNo: '' }))
    act(() => cam.emit(qr('70000409')))
    expect(latest.deliveryNo).toBe('70000409')
    expect(onOpenExisting).not.toHaveBeenCalled()
  })

  it('a QR for a delivery note that already has a receipt opens that receipt (FR-030b)', async () => {
    const fake = fakeScanSource()
    await act(async () => {
      root.render(
        <Harness
          key={++mounts}
          initial={draftWith([], { deliveryNo: '' })}
          source={fake.source}
          existing={[{ id: 'ex1', deliveryNo: '70000409', status: 'draft' }]}
        />,
      )
    })
    await flush()
    act(() => fake.emit(qr('70000409')))
    expect(onOpenExisting).toHaveBeenCalledWith('ex1')
  })
})

describe('Receive: typed search', () => {
  const search = (text: string) => {
    type(host.querySelector('[role="search"] input'), text)
    submit(host.querySelector('[role="search"]'))
  }

  it('a page number opens the item, and the search box clears for the next one', async () => {
    await mount()
    search('4')
    expect(pending()?.textContent).toContain('BBB-02')
    expect((host.querySelector('[role="search"] input') as HTMLInputElement).value).toBe('')
  })

  it('a page with several items asks the user to choose and never picks for them', async () => {
    await mount()
    search('2')
    expect(pending()).toBeNull()
    const dialog = host.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('صنف تجريبي باء')
    expect(dialog.textContent).toContain('صنف تجريبي جيم')
    click(buttonByText(dialog, 'صنف تجريبي جيم'))
    expect(pending()?.textContent).toContain('BBB-01')
  })

  it('says so when nothing matches', async () => {
    await mount()
    search('كرسي')
    expect(pending()).toBeNull()
    expect(host.textContent).toContain('مفيش صنف')
  })
})

describe('Receive: suggestions while typing', () => {
  const box = () => host.querySelector('[role="search"] input') as HTMLInputElement
  const options = () => [...host.querySelectorAll('[role="option"]')]

  it('typing a page shows its items without pressing Enter', async () => {
    await mount()
    type(box(), '4')
    expect(options().map((o) => o.textContent)).toEqual(['صنف تجريبي دالص 4 · BBB-02'])
    expect(pending()).toBeNull()
  })

  it('tapping a suggestion starts the line, like Enter and choosing the item', async () => {
    await mount()
    type(box(), '2')
    expect(options()).toHaveLength(2)
    click(options()[1] ?? null)
    expect(pending()?.textContent).toContain('BBB-01')
    expect(box().value).toBe('')
    expect(options()).toHaveLength(0)
    expect(host.querySelector('[role="dialog"]')).toBeNull()
  })

  it('tapping the item of the open line counts one more, as a repeated scan does', async () => {
    await mount()
    type(box(), '4')
    click(options()[0] ?? null)
    expect(field('اللي اتعدّ', pending()!)?.value).toBe('1')
    type(box(), '4')
    click(options()[0] ?? null)
    expect(field('اللي اتعدّ', pending()!)?.value).toBe('2')
  })

  it('tapping another item while a line is open asks to finish it first', async () => {
    await mount()
    type(box(), '4')
    click(options()[0] ?? null)
    type(box(), '1')
    click(options()[0] ?? null)
    expect(pending()?.textContent).toContain('BBB-02')
    expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain('كمّل السطر')
  })

  it('a typed GTIN plus Enter still works: it suggests the item and Enter starts the line', async () => {
    await mount()
    type(box(), GTIN_A)
    expect(options()).toHaveLength(1)
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
    act(() => void box().dispatchEvent(enter))
    expect(enter.defaultPrevented).toBe(false)
    submit(host.querySelector('[role="search"]'))
    expect(pending()?.textContent).toContain('AAA-01')
  })
})

describe('Receive: line rules', () => {
  const open = async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    return pending()!
  }

  it('flags a changed price and shows the previous one', async () => {
    const card = await open()
    expect(card.querySelector('[data-changed="true"]')).toBeNull()
    type(field('السعر', card), '13.1')
    const flagged = pending()!.querySelector('[data-changed="true"]')
    expect(flagged).not.toBeNull()
    expect(pending()!.textContent).toContain('12.50')
  })

  it('an expired batch warns, and the line cannot be added until a reason is written', async () => {
    const card = await open()
    type(field('الصلاحية', card), '01/2020')
    expect(pending()!.textContent).toContain('الصلاحية منتهية')
    expect(buttonByText(pending()!, 'إضافة للإذن')?.disabled).toBe(true)
    type(field('سبب الصلاحية المنتهية', pending()!), 'تعويض عن صنف ناقص')
    expect(buttonByText(pending()!, 'إضافة للإذن')?.disabled).toBe(false)
    click(buttonByText(pending()!, 'إضافة للإذن'))
    expect(latest.lines[0]?.expiredReason).toBe('تعويض عن صنف ناقص')
  })

  it('an expiry that cannot be read blocks adding the line', async () => {
    const card = await open()
    type(field('الصلاحية', card), '13/2031')
    expect(buttonByText(pending()!, 'إضافة للإذن')?.disabled).toBe(true)
    expect(pending()!.textContent).toContain('التاريخ مش مفهوم')
  })

  it('a pending line can be discarded', async () => {
    await open()
    click(buttonByText(pending()!, 'مسح'))
    expect(pending()).toBeNull()
    expect(latest.lines).toHaveLength(0)
  })

  it('a saved line can be edited and removed', async () => {
    await mount(draftWith([goodLine(1, ITEM_A), goodLine(2, ITEM_D)]))
    const first = saved()[0]!
    click(buttonByText(first, 'تعديل'))
    type(field('اللي اتعدّ', first), '7')
    expect(latest.lines[0]?.countedQty).toBe(7)
    click(buttonByText(first, 'حذف'))
    expect(latest.lines.map((l) => l.itemCode)).toEqual(['BBB-02'])
    expect(latest.lines[0]?.n).toBe(1)
  })

  it('"تشغيلة تانية" starts a new line for the same item', async () => {
    await mount(draftWith([goodLine(1, ITEM_B)]))
    click(buttonByText(saved()[0]!, 'تشغيلة تانية'))
    expect(pending()?.textContent).toContain('AAA-02')
    expect(field('رقم التشغيلة', pending()!)?.value).toBe('')
  })
})

describe('Receive: header sheet', () => {
  it('edits the header and refuses to duplicate a delivery note', async () => {
    const fake = fakeScanSource()
    await act(async () => {
      root.render(
        <Harness
          key={++mounts}
          initial={draftWith([], { deliveryNo: '' })}
          source={fake.source}
          existing={[{ id: 'ex2', deliveryNo: '555', status: 'posted' }]}
        />,
      )
    })
    await flush()
    click(buttonByText(host, 'بيانات الإذن'))
    const dialog = host.querySelector('[role="dialog"]')!
    type(inputByLabel(dialog, 'رقم الإذن'), '555')
    click(buttonByText(dialog, 'حفظ'))
    expect(onOpenExisting).toHaveBeenCalledWith('ex2')

    later()
    click(buttonByText(host, 'بيانات الإذن'))
    const again = host.querySelector('[role="dialog"]')!
    type(inputByLabel(again, 'رقم الإذن'), '556')
    type(inputByLabel(again, 'رقم الفاتورة'), 'INV-1')
    click(buttonByText(again, 'حفظ'))
    expect(latest.deliveryNo).toBe('556')
    expect(latest.invoiceNo).toBe('INV-1')
  })
})
