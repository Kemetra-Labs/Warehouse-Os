import { act, useState } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { IssuePostResult } from '../../../src/data/issuePost'
import { toDraftDoc, type IssueDraft } from '../../../src/domain/issue'
import { addRequested, addSubstitute } from '../../../src/domain/issueEdit'
import { Issue } from '../../../src/ui/screens/Issue'
import type { SealedBatch } from '../../../src/ui/screens/useIssueLoad'
import { buttonByText, click, flush, inputByLabel, submit, type } from '../../helpers/dom'
import { draftOf, priced, stockOf, TODAY } from '../../helpers/issueFixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const NAL_01 = priced('NAL-01', 289_570, { page: 8, nameAr: 'نخاعي للفخذ', category: 'نخاعي' })
const NAL_07 = priced('NAL-07', 289_570, { page: 7, nameAr: 'نخاعي للساق', category: 'نخاعي' })
const NAL_11 = priced('NAL-11', 506_413, { page: 6, nameAr: 'نخاعي متعدد', category: 'نخاعي' })
const SCR_01 = priced('SCR-01', 120_000, { page: 10, nameAr: 'مسمار قشري', category: 'مسامير' })
const DHS_01 = priced('DHS-01', 289_000, { page: 12, nameAr: 'طقم DHS', category: 'DHS' })
const TWO_01 = priced('TWO-01', 1_000, { page: 20, nameAr: 'صنف بتشغيلتين', category: 'تانية' })
const ITEMS = [NAL_01, NAL_07, NAL_11, SCR_01, DHS_01, TWO_01]

const stock = stockOf([
  { code: 'NAL-01', qty: 4, batchNo: 'N1', expiry: '2028-01' },
  { code: 'NAL-07', qty: 3, batchNo: 'N7', expiry: '2028-02' },
  { code: 'NAL-11', qty: 9, batchNo: 'N11', expiry: '2028-03' },
  { code: 'SCR-01', qty: 30, batchNo: 'S1', expiry: '2029-01' },
  { code: 'DHS-01', qty: 2, batchNo: 'D1', expiry: '2029-02' },
  { code: 'TWO-01', qty: 5, batchNo: 'T1', expiry: '2027-01' },
  { code: 'TWO-01', qty: 5, batchNo: 'T2', expiry: '2029-01' },
])

let host: HTMLDivElement
let root: Root
let latest: IssueDraft
let mounts = 0
const onPost = vi.fn<() => Promise<IssuePostResult>>()
const onFinish = vi.fn()

function Harness(props: {
  initial: IssueDraft
  sealed?: SealedBatch | null
  duplicateNumber?: boolean
}) {
  const [draft, setDraft] = useState(props.initial)
  return (
    <Issue
      draft={draft}
      items={ITEMS}
      stock={stock}
      today={TODAY}
      sealed={props.sealed ?? null}
      duplicateNumber={props.duplicateNumber}
      onChange={(d) => {
        latest = d
        setDraft(d)
      }}
      onPost={onPost}
      onFinish={onFinish}
    />
  )
}

async function mount(
  initial: IssueDraft = draftOf({ rep: '', permits: [] }),
  sealed?: SealedBatch,
  duplicateNumber = false,
) {
  latest = initial
  await act(async () => {
    root.render(
      <Harness
        key={++mounts}
        initial={initial}
        sealed={sealed}
        duplicateNumber={duplicateNumber}
      />,
    )
  })
  await flush()
}

const rows = () => [...host.querySelectorAll('tbody tr')]
const rowText = (i: number) => rows()[i]?.textContent ?? ''
/** The newest sheet: a sheet that was just closed stays in the DOM until its exit animation ends. */
const dialog = () => [...document.querySelectorAll('[role="dialog"]')].at(-1) ?? null
const sheetButton = (text: string) => buttonByText(dialog() ?? document.body, text)
const post = () => buttonByText(host, 'اعتماد')

/** 6 of NAL-01 against 4 in stock, a rep and a permit: ready but for the missing 2. */
const shortDraft = () =>
  addRequested(draftOf({ rep: 'إيجي فيكس', permits: ['1001'] }), NAL_01, 6, stock)

beforeEach(() => {
  vi.useFakeTimers()
  onPost.mockReset()
  onFinish.mockClear()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

describe('Issue: an empty batch', () => {
  it('has an Arabic heading, the search box, and a disabled approve button', async () => {
    await mount()
    expect(host.querySelector('h1')?.textContent).toContain('صرف')
    expect(host.querySelector('[role="search"] input')).not.toBeNull()
    expect(rows()).toHaveLength(0)
    expect(post()?.disabled).toBe(true)
    expect(host.textContent).toContain('ضيف صنف واحد على الأقل')
  })
})

describe('Issue: requested lines', () => {
  async function addByPage(page: string, qty: string) {
    type(host.querySelector('[role="search"] input'), page)
    submit(host.querySelector('[role="search"]'))
    const card = host.querySelector('[data-testid="pending-request"]')
    expect(card).not.toBeNull()
    type(inputByLabel(card!, 'الكمية المطلوبة'), qty)
    click(buttonByText(card!, 'إضافة للدفعة'))
  }

  it('a typed page number finds the item, and the quantity makes a line', async () => {
    await mount()
    await addByPage('10', '3')
    expect(rows()).toHaveLength(1)
    expect(rowText(0)).toContain('مسمار قشري')
    expect(latest.requested).toEqual([{ itemCode: 'SCR-01', qty: 3, priceMinor: 120_000 }])
    expect(host.querySelector('[data-testid="pending-request"]')).toBeNull()
  })

  it('the same item from a second permit adds to the one line (FR-041)', async () => {
    await mount()
    await addByPage('10', '3')
    await addByPage('10', '2')
    expect(rows()).toHaveLength(1)
    expect(latest.requested[0]?.qty).toBe(5)
  })

  it('shows requested and delivered side by side, with a tick when they match', async () => {
    await mount()
    await addByPage('10', '3')
    const cells = [...(rows()[0]?.querySelectorAll('td') ?? [])].map((c) => c.textContent)
    expect(cells[1]).toBe('3')
    expect(cells[2]).toBe('3')
    expect(rows()[0]?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe('مطابق')
  })

  it('says so when nothing matches', async () => {
    await mount()
    type(host.querySelector('[role="search"] input'), '999')
    submit(host.querySelector('[role="search"]'))
    expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain('مفيش صنف')
  })

  it('lists what still blocks approving: the representative first', async () => {
    await mount()
    await addByPage('10', '3')
    expect(post()?.disabled).toBe(true)
    expect(host.textContent).toContain('اكتب اسم المندوب')
  })

  it('removing a line empties the table', async () => {
    await mount()
    await addByPage('10', '3')
    click(buttonByText(host, 'مسح'))
    expect(rows()).toHaveLength(0)
    expect(latest.issued).toEqual([])
  })
})

describe('Issue: suggestions while typing', () => {
  const box = () => host.querySelector('[role="search"] input') as HTMLInputElement
  const options = () => [...host.querySelectorAll('[role="option"]')]

  it('typing a page shows its items without pressing Enter', async () => {
    await mount()
    type(box(), '10')
    expect(options().map((o) => o.textContent)).toEqual(['مسمار قشريص 10 · SCR-01'])
    expect(host.querySelector('[data-testid="pending-request"]')).toBeNull()
  })

  it('tapping a suggestion opens the request card, and the quantity makes a line', async () => {
    await mount()
    type(box(), 'نخاعي')
    expect(options()).toHaveLength(3)
    click(options()[1] ?? null)
    const card = host.querySelector('[data-testid="pending-request"]')
    expect(card?.textContent).toContain('نخاعي للساق')
    expect(box().value).toBe('')
    expect(options()).toHaveLength(0)
    type(inputByLabel(card!, 'الكمية المطلوبة'), '2')
    click(buttonByText(card!, 'إضافة للدفعة'))
    expect(latest.requested).toEqual([{ itemCode: 'NAL-07', qty: 2, priceMinor: 289_570 }])
  })

  it('says so under the box when nothing matches, and Enter still reports it', async () => {
    await mount()
    type(box(), '999')
    expect(options()).toHaveLength(0)
    expect(host.textContent).toContain('مفيش صنف بالرقم أو الاسم ده')
    submit(host.querySelector('[role="search"]'))
    expect(host.querySelector('[data-testid="notice"]')?.textContent).toContain('مفيش صنف')
  })
})

describe('Issue: the batch of a line (FR-046)', () => {
  const twoBatches = () => addRequested(draftOf({ rep: 'م', permits: [] }), TWO_01, 2, stock)
  const select = () => host.querySelector('select')
  const choose = (picker: HTMLSelectElement | null, value: string) =>
    act(() => {
      if (!picker) throw new Error('no batch picker')
      picker.value = value
      picker.dispatchEvent(new Event('change', { bubbles: true }))
    })

  it('defaults to the earliest-expiring batch and lets the user change it', async () => {
    await mount(twoBatches())
    const picker = select()
    expect(picker).not.toBeNull()
    expect(picker?.selectedOptions[0]?.textContent).toContain('T1')
    expect(latest.issued[0]).toMatchObject({ batchNo: 'T1', expiry: '2027-01', qty: 2 })

    choose(picker, '1')
    expect(latest.issued[0]).toMatchObject({ batchNo: 'T2', expiry: '2029-01', qty: 2 })
    expect(select()?.selectedOptions[0]?.textContent).toContain('T2')
  })

  it('an item with one batch shows it as text, with nothing to choose', async () => {
    await mount(shortDraft())
    expect(select()).toBeNull()
    expect(rowText(0)).toContain('N1')
  })

  it('moving more than a batch holds asks for a reason', async () => {
    // 7 asked: 5 from T1 and 2 from T2. Moving the 5 into T2 puts 7 in a batch that holds 5.
    await mount(addRequested(draftOf({ rep: 'م', permits: [] }), TWO_01, 7, stock))
    choose(host.querySelector('select'), '1')
    expect(host.textContent).toContain('الصرف أكتر من الرصيد')
    expect(post()?.disabled).toBe(true)
  })
})

describe('Issue: a short item and its substitute', () => {
  it('shows the shortage in red and offers a substitute', async () => {
    await mount(shortDraft())
    expect(rowText(0)).toContain('ناقص 2')
    expect(rows()[0]?.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'ناقص أو زائد',
    )
    expect(post()?.disabled).toBe(true)
    expect(host.textContent).toContain('ناقص 2. اختار بديل')
  })

  it('lists same-category substitutes by price, nearest pre-selected, with the difference', async () => {
    await mount(shortDraft())
    click(buttonByText(host, 'بديل'))
    const options = [...(dialog()?.querySelectorAll('li') ?? [])]
    expect(options.map((o) => o.textContent)).toEqual([
      expect.stringContaining('نخاعي للساق'),
      expect.stringContaining('نخاعي متعدد'),
    ])
    expect(options[0]?.textContent).toContain('±0')
    expect(options[1]?.textContent).toContain('+75%')
    expect(options[1]?.textContent).toContain('+2,168.43')
    const radios = [...(dialog()?.querySelectorAll<HTMLInputElement>('input[type="radio"]') ?? [])]
    expect(radios.map((r) => r.checked)).toEqual([true, false])
    expect(dialog()?.textContent).toContain('بديل لـ 2')
  })

  it('the all-categories toggle also lists other categories', async () => {
    await mount(shortDraft())
    click(buttonByText(host, 'بديل'))
    expect(dialog()?.textContent).not.toContain('طقم DHS')
    click(inputByLabel(dialog()!, 'كل الفئات'))
    expect(dialog()?.textContent).toContain('طقم DHS')
  })

  it('issuing the pre-selected substitute covers the shortage and unblocks approving', async () => {
    await mount(shortDraft())
    click(buttonByText(host, 'بديل'))
    click(sheetButton('صرف 2 بديل'))
    expect(latest.issued.map((l) => [l.itemCode, l.qty, l.forItemCode])).toEqual([
      ['NAL-01', 4, null],
      ['NAL-07', 2, 'NAL-01'],
    ])
    expect(rows()).toHaveLength(2)
    expect(rowText(1)).toContain('بديل عن 2 نخاعي للفخذ')
    expect(rows()[1]?.querySelectorAll('td')[1]?.textContent).toBe('—')
    expect(post()?.disabled).toBe(false)
  })

  it('picking another option issues that one', async () => {
    await mount(shortDraft())
    click(buttonByText(host, 'بديل'))
    click(dialog()!.querySelectorAll<HTMLInputElement>('input[type="radio"]')[1] ?? null)
    click(sheetButton('صرف 2 بديل'))
    expect(latest.issued.at(-1)).toMatchObject({
      itemCode: 'NAL-11',
      forItemCode: 'NAL-01',
      qty: 2,
    })
  })

  it('taking the substitute back makes the item short again', async () => {
    await mount(addSubstitute(shortDraft(), 'NAL-01', 'NAL-07', 2, stock))
    click(buttonByText(host, 'إلغاء البديل'))
    expect(rowText(0)).toContain('ناقص 2')
    expect(rows()).toHaveLength(1)
  })
})

describe('Issue: issuing beyond the balance', () => {
  async function chooseNegative() {
    await mount(shortDraft())
    click(buttonByText(host, 'بديل'))
    click(sheetButton('صرف بالسالب + سبب'))
  }

  it('asks for a reason, and the batch stays blocked without one', async () => {
    await chooseNegative()
    expect(dialog()?.textContent).toContain('سبب الصرف بالسالب')
    expect(latest.issued.every((l) => l.negativeReason === null)).toBe(true)
    expect(buttonByText(dialog()!, 'حفظ السبب')?.disabled).toBe(true)
  })

  it('records the reason, covers the shortage and shows the amber note', async () => {
    await chooseNegative()
    click(sheetButton('حالة مستعجلة'))
    click(sheetButton('حفظ السبب'))
    expect(latest.issued.reduce((s, l) => s + l.qty, 0)).toBe(6)
    expect(latest.issued.every((l) => l.negativeReason === 'حالة مستعجلة')).toBe(true)
    expect(rowText(0)).toContain('الصرف أكتر من الرصيد · السبب: حالة مستعجلة')
    expect(post()?.disabled).toBe(false)
  })
})

describe('Issue: the totals and the seal', () => {
  const okResult = (): IssuePostResult => ({ ok: true, committed: Promise.resolve('acked') })

  it('shows requested value, issued value and the difference (FR-045)', async () => {
    await mount(addSubstitute(shortDraft(), 'NAL-01', 'NAL-07', 2, stock))
    const text = host.querySelector('[data-testid="totals"]')?.textContent ?? ''
    // 6 x 2,895.70 = 17,374.20 on both sides: the substitute costs the same.
    expect(text).toContain('17,374.20')
    expect(text).toContain('0.00')
  })

  it('posting seals the batch and makes it read-only', async () => {
    onPost.mockResolvedValue(okResult())
    await mount(addSubstitute(shortDraft(), 'NAL-01', 'NAL-07', 2, stock))
    click(post())
    await flush()
    expect(onPost).toHaveBeenCalledOnce()
    expect(host.querySelector('svg[aria-label*="معتمد"]')).not.toBeNull()
    expect(post()).toBeNull()
    expect(buttonByText(host, 'بديل')).toBeNull()
    expect(host.textContent).toContain('الدفعة اتعتمدت')
    click(buttonByText(host, 'رجوع للرئيسية'))
    expect(onFinish).toHaveBeenCalledOnce()
  })

  it('shows the problems when the post is refused, and stays editable', async () => {
    onPost.mockResolvedValue({
      ok: false,
      problems: [{ code: 'no-rep', message: 'اكتب اسم المندوب' }],
    })
    await mount(addSubstitute(shortDraft(), 'NAL-01', 'NAL-07', 2, stock))
    click(post())
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('اكتب اسم المندوب')
    expect(post()?.disabled).toBe(false)
  })

  it('a failure shows a message and keeps the batch editable', async () => {
    onPost.mockRejectedValue(new Error('idb'))
    await mount(addSubstitute(shortDraft(), 'NAL-01', 'NAL-07', 2, stock))
    click(post())
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ما قدرناش نعتمد')
  })
})

describe('Issue: a posted batch', () => {
  const posted = (): SealedBatch => ({
    seal: { variant: 'posted', day: '2026-10-12' },
    totals: { requestedMinor: 1_000, issuedMinor: 900, differenceMinor: -100 },
  })

  it('shows the seal and the stored totals, and offers no way to edit', async () => {
    await mount(addSubstitute(shortDraft(), 'NAL-01', 'NAL-07', 2, stock), posted())
    expect(host.querySelector('svg[aria-label*="معتمد"]')?.getAttribute('aria-label')).toContain(
      'دفعة 14',
    )
    const totals = host.querySelector('[data-testid="totals"]')?.textContent ?? ''
    expect(totals).toContain('10.00')
    expect(totals).toContain('9.00')
    expect(totals).toContain('-1.00')
    expect(host.querySelector('[role="search"]')).toBeNull()
    expect(post()).toBeNull()
    expect(host.querySelectorAll('button')).toHaveLength(0)
    expect(host.textContent).not.toContain('لسه ناقص')
  })

  it('shows the permit numbers of the batch (FR-040)', async () => {
    const withPermits = { ...shortDraft(), permits: ['1001', '1002'] }
    await mount(addSubstitute(withPermits, 'NAL-01', 'NAL-07', 2, stock), posted())
    const permits = host.querySelector('[data-testid="permits"]')?.textContent ?? ''
    expect(permits).toContain('1001')
    expect(permits).toContain('1002')
  })

  it('still shows the substitute under the item it replaced', async () => {
    await mount(addSubstitute(shortDraft(), 'NAL-01', 'NAL-07', 2, stock), posted())
    expect(rowText(1)).toContain('بديل عن 2 نخاعي للفخذ')
  })

  it('writes a draft document that matches what the rules accept', () => {
    expect(toDraftDoc(shortDraft()).status).toBe('draft')
  })
})

describe('Issue: a duplicate batch number (R10)', () => {
  it('warns, without renumbering', async () => {
    await mount(shortDraft(), undefined, true)
    expect(host.querySelector('[data-testid="duplicate-number"]')?.textContent).toContain('14')
    expect(latest.number).toBe(14)
  })

  it('stays quiet when the number is its own', async () => {
    await mount(shortDraft())
    expect(host.querySelector('[data-testid="duplicate-number"]')).toBeNull()
  })
})
