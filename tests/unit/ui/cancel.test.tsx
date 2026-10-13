import { act, type ReactElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CancelAttempt } from '../../../src/data/cancelPost'
import { addRequested } from '../../../src/domain/issueEdit'
import { Issue } from '../../../src/ui/screens/Issue'
import { ReceiptReview } from '../../../src/ui/screens/ReceiptReview'
import type { SealedBatch } from '../../../src/ui/screens/useIssueLoad'
import { buttonByText, click, flush, type } from '../../helpers/dom'
import { draftOf, priced, stockOf, TODAY as ISSUE_TODAY } from '../../helpers/issueFixtures'
import { draftWith, goodLine, ITEM_A, ITEMS, TODAY } from '../../helpers/receiptFixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

const queued: CancelAttempt = { ok: true, committed: Promise.resolve('acked') }
const refused = (message: string): CancelAttempt => ({
  ok: false,
  problem: { code: 'not-posted', message },
})

async function mount(el: ReactElement): Promise<void> {
  await act(async () => root.render(el))
  await flush()
}

/** The newest sheet: a sheet that was just closed stays in the DOM until its exit animation ends. */
const dialog = (): Element => [...document.querySelectorAll('[role="dialog"]')].at(-1) as Element

const noop = (): void => undefined

describe('cancelling a posted receipt', () => {
  const review = (over: {
    sealed?: 'posted' | 'cancelled'
    onCancel?: (reason: string) => Promise<CancelAttempt>
  }) => (
    <ReceiptReview
      draft={draftWith([goodLine(1, ITEM_A)])}
      items={ITEMS}
      existing={[]}
      selfId="r1"
      today={TODAY}
      sealed={{ variant: over.sealed ?? 'posted', day: '2026-10-11', reason: 'غلط' }}
      onChange={noop}
      onBack={noop}
      onPost={() => Promise.reject(new Error('never'))}
      onCancel={over.onCancel}
    />
  )

  it('asks for a reason, passes it on, and then shows the red seal and no cancel button', async () => {
    const onCancel = vi.fn(() => Promise.resolve(queued))
    await mount(review({ onCancel }))
    expect(host.querySelector('svg[aria-label*="معتمد"]')).not.toBeNull()
    click(buttonByText(host, 'إلغاء الإذن'))

    // The confirm button stays off until a reason is typed.
    expect(buttonByText(dialog(), 'تأكيد إلغاء الإذن')?.disabled).toBe(true)
    type(dialog().querySelector('input'), '  استلام بالغلط  ')
    click(buttonByText(dialog(), 'تأكيد إلغاء الإذن'))
    await flush()

    // The reason reaches the cancel already trimmed.
    expect(onCancel).toHaveBeenCalledWith('استلام بالغلط')
    expect(host.querySelector('svg[aria-label*="ملغي"]')).not.toBeNull()
    expect(host.querySelector('svg[aria-label*="معتمد"]')).toBeNull()
    expect(host.querySelector('[data-testid="cancelled-note"]')?.textContent).toContain(
      'الإذن اتلغى',
    )
    expect(host.querySelector('[data-testid="cancelled-note"]')?.textContent).toContain(
      'السبب: استلام بالغلط',
    )
    expect(buttonByText(host, 'إلغاء الإذن')).toBeNull()
  })

  it('offers a quick reason', async () => {
    const onCancel = vi.fn(() => Promise.resolve(queued))
    await mount(review({ onCancel }))
    click(buttonByText(host, 'إلغاء الإذن'))
    click(buttonByText(dialog(), 'استلام بالغلط'))
    click(buttonByText(dialog(), 'تأكيد إلغاء الإذن'))
    await flush()
    expect(onCancel).toHaveBeenCalledWith('استلام بالغلط')
  })

  it('keeps the seal and says why when the cancel is refused', async () => {
    const onCancel = vi.fn(() => Promise.resolve(refused('المستند ده اتلغى قبل كده.')))
    await mount(review({ onCancel }))
    click(buttonByText(host, 'إلغاء الإذن'))
    type(dialog().querySelector('input'), 'خطأ')
    click(buttonByText(dialog(), 'تأكيد إلغاء الإذن'))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('اتلغى قبل كده')
    expect(host.querySelector('svg[aria-label*="معتمد"]')).not.toBeNull()
    expect(buttonByText(host, 'إلغاء الإذن')).not.toBeNull()
  })

  it('reports a thrown error instead of going silent', async () => {
    const onCancel = vi.fn(() => Promise.reject(new Error('not signed in')))
    await mount(review({ onCancel }))
    click(buttonByText(host, 'إلغاء الإذن'))
    type(dialog().querySelector('input'), 'خطأ')
    click(buttonByText(dialog(), 'تأكيد إلغاء الإذن'))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('ما قدرناش نلغي')
  })

  it('has no cancel button on a receipt that is already cancelled', async () => {
    await mount(review({ sealed: 'cancelled', onCancel: () => Promise.resolve(queued) }))
    expect(host.querySelector('svg[aria-label*="ملغي"]')).not.toBeNull()
    expect(buttonByText(host, 'إلغاء الإذن')).toBeNull()
    expect(host.querySelector('[data-testid="cancelled-note"]')?.textContent).toContain('غلط')
  })

  it('has no cancel button without a handler (a draft being reviewed)', async () => {
    await mount(review({}))
    expect(buttonByText(host, 'إلغاء الإذن')).toBeNull()
  })
})

describe('cancelling a posted issue batch', () => {
  const A = priced('SCR-01', 1000, { page: 3, nameAr: 'مسمار' })
  const stock = stockOf([{ code: 'SCR-01', qty: 9, batchNo: 'B1', expiry: '2028-01' }])
  const posted = (variant: 'posted' | 'cancelled'): SealedBatch => ({
    seal: { variant, day: '2026-10-12', reason: 'غلط' },
    totals: { requestedMinor: 3000, issuedMinor: 3000, differenceMinor: 0 },
  })
  const issue = (variant: 'posted' | 'cancelled', onCancel?: () => Promise<CancelAttempt>) => (
    <Issue
      draft={addRequested(draftOf({ number: 14 }), A, 3, stock)}
      items={[A]}
      stock={stock}
      today={ISSUE_TODAY}
      sealed={posted(variant)}
      onChange={noop}
      onPost={() => Promise.reject(new Error('never'))}
      onCancel={onCancel}
    />
  )

  it('cancels with a reason and swaps the seal for the red one', async () => {
    const onCancel = vi.fn(() => Promise.resolve(queued))
    await mount(issue('posted', onCancel))
    click(buttonByText(host, 'إلغاء الدفعة'))
    type(dialog().querySelector('input'), 'اتصرفت للمندوب الغلط')
    click(buttonByText(dialog(), 'تأكيد إلغاء الدفعة'))
    await flush()
    expect(onCancel).toHaveBeenCalledWith('اتصرفت للمندوب الغلط')
    expect(host.querySelector('svg[aria-label*="ملغي"]')?.getAttribute('aria-label')).toContain(
      'دفعة 14',
    )
    expect(buttonByText(host, 'إلغاء الدفعة')).toBeNull()
    // The verb agrees with the noun: a batch "اتلغت", a receipt "اتلغى".
    expect(host.querySelector('[data-testid="cancelled-note"]')?.textContent).toContain(
      'الدفعة اتلغت',
    )
  })

  it('shows a refusal and keeps the posted seal', async () => {
    await mount(issue('posted', () => Promise.resolve(refused('المستند ده اتلغى قبل كده.'))))
    click(buttonByText(host, 'إلغاء الدفعة'))
    type(dialog().querySelector('input'), 'خطأ')
    click(buttonByText(dialog(), 'تأكيد إلغاء الدفعة'))
    await flush()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('اتلغى قبل كده')
    expect(host.querySelector('svg[aria-label*="معتمد"]')).not.toBeNull()
  })

  it('has no cancel button once cancelled', async () => {
    await mount(issue('cancelled', () => Promise.resolve(queued)))
    expect(host.querySelector('svg[aria-label*="ملغي"]')).not.toBeNull()
    expect(buttonByText(host, 'إلغاء الدفعة')).toBeNull()
  })
})
