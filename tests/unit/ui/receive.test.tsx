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

  it('has one primary, "راجع واعتمد · N سطور", and it needs at least one line', async () => {
    await mount(draftWith([]))
    expect(buttonByText(host, 'راجع واعتمد')?.disabled).toBe(true)
    await mount(draftWith([goodLine(1, ITEM_A)]))
    expect(buttonByText(host, 'راجع واعتمد')?.textContent).toBe('راجع واعتمد · 1 سطور')
    expect(buttonByText(host, 'راجع واعتمد')?.disabled).toBe(false)
    click(buttonByText(host, 'راجع واعتمد'))
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

  it('there is no add button: a ready line joins the receipt when the next item is scanned', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    const card = pending()!
    expect(buttonByText(card, 'إضافة للإذن')).toBeNull()
    type(field('رقم التشغيلة', card), '0230271')
    type(field('الصلاحية', card), '03/2031')
    type(field('الكمية في الفاتورة', card), '4')
    expect(pending()?.textContent).toContain('جاهز')
    expect(latest.lines).toHaveLength(0) // still open: nothing is added until something follows
    later()
    act(() => cam.emit(ean('6001234567891')))
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
    expect(pending()?.textContent).toContain('AAA-02') // the new item opened its own line
    expect(host.querySelector('[data-testid="notice"]')).toBeNull()
  })

  it('a ready line also joins when the next item is picked from the suggestions', async () => {
    await mount()
    const box = host.querySelector('[role="search"] input') as HTMLInputElement
    type(box, '4')
    click(host.querySelectorAll('[role="option"]')[0] ?? null)
    type(field('الكمية في الفاتورة', pending()!), '2')
    type(box, '1')
    click(host.querySelectorAll('[role="option"]')[0] ?? null)
    expect(latest.lines.map((l) => [l.itemCode, l.invoicedQty])).toEqual([['BBB-02', 2]])
    expect(pending()?.textContent).toContain('AAA-01')
  })

  it('"راجع واعتمد" takes the ready open line with it and goes to the review', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    type(field('الكمية في الفاتورة', pending()!), '1')
    click(buttonByText(host, 'راجع واعتمد'))
    expect(latest.lines).toHaveLength(1)
    expect(latest.lines[0]).toMatchObject({ itemCode: 'AAA-01', invoicedQty: 1, countedQty: 1 })
    expect(onReview).toHaveBeenCalledOnce()
    expect(pending()).toBeNull()
  })

  it('leaving the screen keeps a ready open line: it joins the receipt', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    type(field('الكمية في الفاتورة', pending()!), '3')
    expect(latest.lines).toHaveLength(0)
    act(() => root.render(<div />)) // e.g. a bottom-nav tab
    expect(latest.lines).toHaveLength(1)
    expect(latest.lines[0]).toMatchObject({ itemCode: 'AAA-01', invoicedQty: 3, countedQty: 1 })
  })

  it('the app going to the background joins a ready open line too', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    type(field('الكمية في الفاتورة', pending()!), '3')
    const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => void document.dispatchEvent(new Event('visibilitychange')))
    hidden.mockRestore()
    expect(latest.lines).toHaveLength(1)
    expect(pending()).toBeNull()
    expect(saved()).toHaveLength(1)
  })

  it('leaving with a line that is not ready adds nothing', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A))) // no invoiced quantity yet
    act(() => root.render(<div />))
    expect(latest.lines).toHaveLength(0)
  })

  it('going to the review and then leaving adds the line once', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    type(field('الكمية في الفاتورة', pending()!), '1')
    click(buttonByText(host, 'راجع واعتمد'))
    act(() => root.render(<div />))
    expect(latest.lines).toHaveLength(1)
  })

  it('counts with a big −/+ and typing the number still works', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    const card = pending()!
    const count = () => field('اللي اتعدّ', pending()!)?.value
    const step = (label: string) =>
      card.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
    click(step('زوّد واحد'))
    click(step('زوّد واحد'))
    expect(count()).toBe('3')
    click(step('نقّص واحد'))
    expect(count()).toBe('2')
    type(field('اللي اتعدّ', card), '7')
    expect(count()).toBe('7')
    type(field('اللي اتعدّ', card), '0')
    expect(step('نقّص واحد')?.disabled).toBe(true)
    type(field('الكمية في الفاتورة', card), '5')
    expect(card.textContent).toContain('اتعدّ من')
  })

  it('what the barcode gave shows as filled chips; tapping one opens the fields', async () => {
    const cam = await mount()
    act(() =>
      cam.emit({ rawValue: '(01)06001234567890(17)310300(10)B-100', format: 'data_matrix' }),
    )
    const card = pending()!
    expect(field('رقم التشغيلة', card)).toBeNull()
    expect(card.textContent).toContain('B-100')
    expect(card.textContent).toContain('من الباركود')
    click(buttonByText(card, 'تشغيلة'))
    expect(field('رقم التشغيلة', pending()!)?.value).toBe('B-100')
  })

  it('a scan of an item already on the receipt counts on its line', async () => {
    const cam = await mount(draftWith([goodLine(1, ITEM_A, { countedQty: 2 })]))
    act(() => cam.emit(ean(GTIN_A)))
    expect(latest.lines[0]?.countedQty).toBe(3)
    expect(pending()).toBeNull()
  })

  it('an open line that cannot join stays open with its problem shown; nothing is added', async () => {
    const cam = await mount()
    act(() => cam.emit(ean(GTIN_A)))
    expect(pending()?.textContent).toContain('اكتب الكمية في الفاتورة') // the problem, on the card
    later()
    act(() => cam.emit(ean('6001234567891')))
    const notice = host.querySelector('[data-testid="notice"]')?.textContent
    expect(notice).toContain('كمّل السطر')
    expect(notice).toContain('الكمية في الفاتورة')
    expect(pending()?.textContent).toContain('AAA-01')
    expect(latest.lines).toHaveLength(0)
    click(buttonByText(host, 'راجع واعتمد'))
    expect(onReview).not.toHaveBeenCalled()
    expect(latest.lines).toHaveLength(0)
    expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain('كمّل السطر')
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

  it('an expired batch warns and stays open until a reason is written, then it joins', async () => {
    const card = await open()
    type(field('الكمية في الفاتورة', card), '1')
    type(field('الصلاحية', card), '01/2020')
    expect(pending()!.textContent).toContain('الصلاحية منتهية')
    click(buttonByText(host, 'راجع واعتمد'))
    expect(onReview).not.toHaveBeenCalled()
    expect(latest.lines).toHaveLength(0)
    type(field('سبب الصلاحية المنتهية', pending()!), 'تعويض عن صنف ناقص')
    click(buttonByText(host, 'راجع واعتمد'))
    expect(latest.lines[0]?.expiredReason).toBe('تعويض عن صنف ناقص')
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('an expiry that cannot be read keeps the line open and says so', async () => {
    const card = await open()
    type(field('الكمية في الفاتورة', card), '1')
    type(field('الصلاحية', card), '13/2031')
    expect(pending()!.textContent).toContain('التاريخ مش مفهوم')
    click(buttonByText(host, 'راجع واعتمد'))
    expect(onReview).not.toHaveBeenCalled()
    expect(latest.lines).toHaveLength(0)
  })

  it('an unresolved GTIN stays open until its item is chosen', async () => {
    const cam = await mount()
    act(() => cam.emit(ean('6221234567893')))
    type(field('الكمية في الفاتورة', pending()!), '3')
    click(buttonByText(host, 'راجع واعتمد'))
    expect(onReview).not.toHaveBeenCalled()
    expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain('اختار الصنف')
    click(buttonByText(pending()!, 'اختار الصنف'))
    const dialog = host.querySelector('[role="dialog"]')!
    type(dialog.querySelector('input'), '4')
    click(buttonByText(dialog, 'صنف تجريبي دال'))
    click(buttonByText(host, 'راجع واعتمد'))
    expect(latest.lines[0]).toMatchObject({ itemCode: 'BBB-02', scannedGtin: '6221234567893' })
    expect(onReview).toHaveBeenCalledOnce()
  })

  it('a pending line can be discarded', async () => {
    await open()
    click(buttonByText(pending()!, 'امسح السطر'))
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

describe('Receive: text that is not a whole number', () => {
  const INVALID = 'اكتب رقم صحيح'
  const FIELDS = ['اللي اتعدّ', 'الكمية في الفاتورة'] as const

  /** An open, ready line whose `label` field then holds text that is not a whole number. */
  const openWithBadText = async (label: string, mountDraft: ReceiptDraft = newDraft(DAY)) => {
    const cam = await mount(mountDraft)
    act(() => cam.emit(ean(GTIN_A)))
    type(field('الكمية في الفاتورة', pending()!), '4')
    expect(pending()?.textContent).toContain('جاهز')
    type(field(label, pending()!), '2.5')
    return cam
  }

  describe.each(FIELDS)('in "%s"', (label) => {
    it('keeps the line open and says what is wrong instead of "جاهز"', async () => {
      await openWithBadText(label)
      expect(field(label, pending()!)?.getAttribute('aria-invalid')).toBe('true')
      expect(pending()?.textContent).toContain(INVALID)
      expect(pending()?.textContent).not.toContain('جاهز')
      expect(buttonByText(host, 'راجع واعتمد')?.textContent).toBe('راجع واعتمد · 0 سطور')
    })

    it('the next scan does not join the line, and says to finish it first', async () => {
      const cam = await openWithBadText(label)
      later()
      act(() => cam.emit(ean('6001234567891')))
      expect(latest.lines).toHaveLength(0)
      expect(pending()?.textContent).toContain('AAA-01')
      const notice = host.querySelector('[data-testid="notice"]')?.textContent
      expect(notice).toContain('كمّل السطر')
      expect(notice).toContain(INVALID)
    })

    it('picking the next item from the suggestions does not join it either', async () => {
      await openWithBadText(label)
      const box = host.querySelector('[role="search"] input') as HTMLInputElement
      type(box, '4')
      click(host.querySelectorAll('[role="option"]')[0] ?? null)
      expect(latest.lines).toHaveLength(0)
      expect(pending()?.textContent).toContain('AAA-01')
      expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain('كمّل السطر')
    })

    it('"راجع واعتمد" is refused', async () => {
      await openWithBadText(label)
      click(buttonByText(host, 'راجع واعتمد'))
      expect(onReview).not.toHaveBeenCalled()
      expect(latest.lines).toHaveLength(0)
      expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain(INVALID)
    })

    it('"تشغيلة تانية" on a saved line does not join the open line', async () => {
      await openWithBadText(label, draftWith([goodLine(1, ITEM_B)]))
      click(buttonByText(saved()[0]!, 'تشغيلة تانية'))
      expect(latest.lines).toHaveLength(1)
      expect(pending()?.textContent).toContain('AAA-01')
      expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain(INVALID)
    })

    it('leaving the screen adds nothing', async () => {
      await openWithBadText(label)
      act(() => root.render(<div />))
      expect(latest.lines).toHaveLength(0)
    })

    it('the app going to the background adds nothing and keeps the line open', async () => {
      await openWithBadText(label)
      const hidden = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
      act(() => void document.dispatchEvent(new Event('visibilitychange')))
      hidden.mockRestore()
      expect(latest.lines).toHaveLength(0)
      expect(pending()).not.toBeNull()
    })

    it('typing a whole number again makes the line ready and it joins as usual', async () => {
      await openWithBadText(label)
      type(field(label, pending()!), label === 'اللي اتعدّ' ? '5' : '6')
      expect(pending()?.textContent).toContain('جاهز')
      click(buttonByText(host, 'راجع واعتمد'))
      expect(latest.lines).toHaveLength(1)
      expect(onReview).toHaveBeenCalledOnce()
    })

    it('a new line starts valid after the old one was discarded', async () => {
      const cam = await openWithBadText(label)
      click(buttonByText(pending()!, 'امسح السطر'))
      later()
      act(() => cam.emit(ean(GTIN_A)))
      type(field('الكمية في الفاتورة', pending()!), '4')
      expect(pending()?.textContent).toContain('جاهز')
      click(buttonByText(host, 'راجع واعتمد'))
      expect(latest.lines).toHaveLength(1)
    })
  })

  it('a scan of the same item counts on the open line and replaces the bad counted text', async () => {
    const cam = await openWithBadText('اللي اتعدّ')
    later()
    act(() => cam.emit(ean(GTIN_A)))
    expect(field('اللي اتعدّ', pending()!)?.value).toBe('2')
    expect(pending()?.textContent).toContain('جاهز')
  })

  it('a bad invoiced text does not hide a bad counted text that is fixed first', async () => {
    await openWithBadText('الكمية في الفاتورة')
    type(field('اللي اتعدّ', pending()!), '2.5')
    type(field('اللي اتعدّ', pending()!), '3')
    expect(pending()?.textContent).toContain(INVALID)
    type(field('الكمية في الفاتورة', pending()!), '4')
    expect(pending()?.textContent).toContain('جاهز')
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
