import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PostResult } from '../../../src/data/receiptPost'
import type { ReceiptDraft } from '../../../src/domain/receipt'
import { ReceiptReview, type SealInfo } from '../../../src/ui/screens/ReceiptReview'
import { buttonByText, click, flush, type } from '../../helpers/dom'
import {
  draftWith,
  goodLine,
  item,
  ITEM_A,
  ITEM_B,
  ITEMS,
  TODAY,
} from '../../helpers/receiptFixtures'
import { unresolvedLine } from '../../../src/domain/receiptEdit'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root
let latest: ReceiptDraft
let mounts = 0
const onBack = vi.fn()

interface Opts {
  readonly existing?: { id: string; deliveryNo: string; status: 'draft' | 'posted' | 'cancelled' }[]
  readonly sealed?: SealInfo | null
  readonly onPost?: () => Promise<PostResult>
  readonly items?: typeof ITEMS
}

const okResult = (): PostResult => ({ ok: true, warnings: [], committed: Promise.resolve('acked') })

function Harness({ initial, opts }: { initial: ReceiptDraft; opts: Opts }) {
  const [draft, setDraft] = useState(initial)
  return (
    <ReceiptReview
      draft={draft}
      items={opts.items ?? ITEMS}
      existing={opts.existing ?? []}
      selfId="self"
      today={TODAY}
      sealed={opts.sealed ?? null}
      onChange={(d) => {
        latest = d
        setDraft(d)
      }}
      onBack={onBack}
      onPost={opts.onPost ?? (() => Promise.resolve(okResult()))}
    />
  )
}

async function mount(initial: ReceiptDraft, opts: Opts = {}) {
  latest = initial
  await act(async () => {
    root.render(<Harness key={++mounts} initial={initial} opts={opts} />)
  })
  await flush()
}

const post = () => buttonByText(host, 'اعتماد')

beforeEach(() => {
  vi.useFakeTimers()
  onBack.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('ReceiptReview: the double-count table', () => {
  it('shows invoiced against counted, and marks a difference', async () => {
    await mount(
      draftWith([goodLine(1, ITEM_A), goodLine(2, ITEM_B, { invoicedQty: 50, countedQty: 48 })]),
    )
    const heads = [...host.querySelectorAll('th')].map((h) => h.textContent)
    expect(heads.slice(0, 3)).toEqual(['صنف', 'الفاتورة', 'اتعدّ'])
    const dots = [...host.querySelectorAll('tbody [role="img"]')].map((d) =>
      d.getAttribute('aria-label'),
    )
    expect(dots).toEqual(['مطابق', 'ناقص أو زائد'])
    const rows = host.querySelectorAll('tbody tr')
    expect(rows[1]?.textContent).toContain('50')
    expect(rows[1]?.textContent).toContain('48')
  })

  it('shows a price change next to its line', async () => {
    await mount(draftWith([goodLine(1, ITEM_A, { priceMinor: 1400, prevPriceMinor: 1250 })]))
    expect(host.textContent).toContain('14.00')
    expect(host.textContent).toContain('12.50')
  })

  it('summarises pieces, lines and price updates', async () => {
    await mount(
      draftWith([
        goodLine(1, ITEM_A, { priceMinor: 1400, prevPriceMinor: 1250 }),
        goodLine(2, ITEM_B),
      ]),
    )
    const summary = host.querySelector('[data-testid="summary"]')?.textContent ?? ''
    expect(summary).toContain('8')
    expect(summary).toContain('2')
    expect(summary).toContain('1')
  })
})

describe('ReceiptReview: اعتماد is disabled until the review is valid', () => {
  it('a difference needs a reason; saving the reason enables it', async () => {
    await mount(draftWith([goodLine(1, ITEM_B, { invoicedQty: 50, countedQty: 48 })]))
    expect(post()?.disabled).toBe(true)
    expect(host.textContent).toContain('اكتب سبب الفرق')
    click(buttonByText(host, 'اكتب سبب الفرق'))
    const dialog = host.querySelector('[role="dialog"]')!
    expect(dialog.textContent).toContain('2')
    type(dialog.querySelector('input'), 'ناقص من المورد')
    click(buttonByText(dialog, 'حفظ السبب'))
    expect(latest.lines[0]?.diffReason).toBe('ناقص من المورد')
    expect(post()?.disabled).toBe(false)
  })

  it('quick reasons fill the field', async () => {
    await mount(draftWith([goodLine(1, ITEM_B, { invoicedQty: 50, countedQty: 48 })]))
    click(buttonByText(host, 'اكتب سبب الفرق'))
    const dialog = host.querySelector('[role="dialog"]')!
    click(buttonByText(dialog, 'ناقص من المورد'))
    click(buttonByText(dialog, 'حفظ السبب'))
    expect(latest.lines[0]?.diffReason).toBe('ناقص من المورد')
  })

  it('an unknown GTIN blocks, and the resolver links it to the chosen item', async () => {
    const line = { ...unresolvedLine(1, '6221234567893', {}), invoicedQty: 1, countedQty: 1 }
    await mount(draftWith([line]))
    expect(host.textContent).toContain('6221234567893')
    expect(post()?.disabled).toBe(true)
    click(buttonByText(host, 'اختار الصنف'))
    const dialog = host.querySelector('[role="dialog"]')!
    type(dialog.querySelector('input'), 'باء')
    click(buttonByText(dialog, 'صنف تجريبي باء'))
    expect(latest.lines[0]).toMatchObject({ itemCode: 'AAA-02', scannedGtin: '6221234567893' })
    expect(post()?.disabled).toBe(false)
  })

  it('an expired batch needs its reason too', async () => {
    await mount(draftWith([goodLine(1, ITEM_A, { expiry: '2026-01' })]))
    expect(post()?.disabled).toBe(true)
    click(buttonByText(host, 'اكتب سبب الصلاحية'))
    const dialog = host.querySelector('[role="dialog"]')!
    type(dialog.querySelector('input'), 'تعويض')
    click(buttonByText(dialog, 'حفظ السبب'))
    expect(latest.lines[0]?.expiredReason).toBe('تعويض')
    expect(post()?.disabled).toBe(false)
  })

  it('a delivery note that already has a receipt blocks, and says so', async () => {
    await mount(draftWith([goodLine(1, ITEM_A)]), {
      existing: [{ id: 'old', deliveryNo: '19808953', status: 'posted' }],
    })
    expect(post()?.disabled).toBe(true)
    expect(host.textContent).toContain('متسجّل قبل كده')
  })

  it('a clean receipt can be posted', async () => {
    await mount(draftWith([goodLine(1, ITEM_A), goodLine(2, ITEM_B)]))
    expect(post()?.disabled).toBe(false)
  })

  it('back goes to the counting screen', async () => {
    await mount(draftWith([goodLine(1, ITEM_A)]))
    click(buttonByText(host, 'ارجع للعدّ'))
    expect(onBack).toHaveBeenCalledOnce()
  })
})

describe('ReceiptReview: GTIN warnings come before posting (FR-033)', () => {
  const held = item('ZZZ-01', { gtins: ['6001234567899'] })
  const line = () => ({
    ...goodLine(1, ITEM_B),
    scannedGtin: '6001234567899',
  })

  it('a GTIN held by another item is warned about and must be acknowledged', async () => {
    await mount(draftWith([line()]), { items: [...ITEMS, held] })
    expect(host.textContent).toContain('مربوط بصنف تاني')
    expect(post()?.disabled).toBe(true)
    click(host.querySelector('input[type="checkbox"]'))
    expect(post()?.disabled).toBe(false)
  })
})

describe('ReceiptReview: posting', () => {
  it('posts, then shows the seal with the date and the delivery number', async () => {
    const onPost = vi.fn(() => Promise.resolve(okResult()))
    await mount(draftWith([goodLine(1, ITEM_A)]), { onPost })
    expect(host.querySelector('svg[aria-label*="معتمد"]')).toBeNull()
    click(post())
    await flush()
    expect(onPost).toHaveBeenCalledOnce()
    const seal = host.querySelector('svg[aria-label*="معتمد"]')
    expect(seal?.getAttribute('aria-label')).toContain('12/10/2026')
    expect(seal?.getAttribute('aria-label')).toContain('19808953')
    expect(post()).toBeNull()
  })

  it('does not post twice on a double tap', async () => {
    let finish: (r: PostResult) => void = () => undefined
    const onPost = vi.fn(() => new Promise<PostResult>((res) => (finish = res)))
    await mount(draftWith([goodLine(1, ITEM_A)]), { onPost })
    click(post())
    expect(post()?.disabled).toBe(true)
    click(post())
    expect(onPost).toHaveBeenCalledOnce()
    finish(okResult())
    await flush()
  })

  it('shows what is wrong when the post is refused, and stays editable', async () => {
    const onPost = vi.fn(() =>
      Promise.resolve({
        ok: false,
        issues: [{ code: 'duplicate-delivery', message: 'رقم الإذن 1 متسجّل قبل كده' }],
      } as PostResult),
    )
    await mount(draftWith([goodLine(1, ITEM_A)]), { onPost })
    click(post())
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('متسجّل قبل كده')
    expect(host.querySelector('svg[aria-label*="معتمد"]')).toBeNull()
  })

  it('shows an error when posting throws', async () => {
    const onPost = vi.fn(() => Promise.reject(new Error('offline storage blocked')))
    await mount(draftWith([goodLine(1, ITEM_A)]), { onPost })
    click(post())
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ما قدرناش')
  })
})

describe('ReceiptReview: a receipt that is already posted', () => {
  it('is read-only with the seal and no way to post or edit', async () => {
    await mount(draftWith([goodLine(1, ITEM_A, { diffReason: null })]), {
      sealed: { variant: 'posted', day: '2026-10-11' },
    })
    expect(host.querySelector('svg[aria-label*="معتمد 11/10/2026"]')).not.toBeNull()
    expect(post()).toBeNull()
    expect(buttonByText(host, 'ارجع للعدّ')).toBeNull()
    expect(host.querySelectorAll('input')).toHaveLength(0)
  })

  it('shows the cancelled seal for a cancelled receipt', async () => {
    await mount(draftWith([goodLine(1, ITEM_A)]), {
      sealed: { variant: 'cancelled', day: '2026-10-11' },
    })
    expect(host.querySelector('svg[aria-label*="ملغي"]')).not.toBeNull()
  })
})
