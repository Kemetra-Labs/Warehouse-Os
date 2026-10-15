import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReceiptDraft } from '../../../src/domain/receipt'
import { buttonByText, click, flush, inputByLabel, submit, type } from '../../helpers/dom'
import { draftWith, goodLine, ITEM_A, ITEMS, TODAY } from '../../helpers/receiptFixtures'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const h = vi.hoisted(() => ({
  saveDraft: vi.fn<(id: string, draft: unknown) => Promise<void>>(() => Promise.resolve()),
  postReceipt: vi.fn(),
  getReceipt: vi.fn(),
  receipts: [] as unknown[],
}))
vi.mock('../../../src/data/repos/receipts', () => ({
  saveDraft: h.saveDraft,
  postReceipt: h.postReceipt,
  getReceipt: h.getReceipt,
  cancelReceiptDoc: vi.fn(),
}))
vi.mock('../../../src/app/AuthProvider', () => ({
  useAuth: () => ({ state: { status: 'signedIn', user: { uid: 'u' } } }),
}))
vi.mock('../../../src/data/DataProvider', () => ({
  useData: () => ({ items: ITEMS, receipts: h.receipts, outbox: {}, movements: [] }),
}))
vi.mock('../../../src/data/deviceId', () => ({ getDeviceId: () => 'dev' }))
vi.mock('../../../src/domain/dates', async (orig) => ({
  ...(await orig<object>()),
  cairoToday: () => TODAY,
}))

const { default: ReceiptFlow } = await import('../../../src/ui/screens/ReceiptFlow')

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  h.saveDraft.mockClear()
  h.postReceipt.mockReset()
  h.getReceipt.mockReset()
  h.receipts = []
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

function mountAt(path: string) {
  const router = createMemoryRouter(
    [
      { path: '/receive/:id?', element: <ReceiptFlow /> },
      { path: '/', element: <p>home</p> },
    ],
    { initialEntries: [path] },
  )
  act(() => root.render(<RouterProvider router={router} />))
  return router
}

const savedCalls = (): [string, ReceiptDraft][] =>
  h.saveDraft.mock.calls as unknown as [string, ReceiptDraft][]

describe('ReceiptFlow', () => {
  it('keeps a receipt posted here read-only after the browser back', async () => {
    h.getReceipt.mockResolvedValue({
      id: 'R1',
      status: 'draft',
      ...draftWith([goodLine(1, ITEM_A)]),
    })
    h.postReceipt.mockResolvedValue({ ok: true, warnings: [], committed: new Promise(() => {}) })
    const router = mountAt('/receive/R1')
    await flush()
    await flush()
    click(buttonByText(host, 'راجع واعتمد'))
    await flush()
    click(buttonByText(host, 'اعتماد'))
    await flush()
    await flush()
    expect(h.postReceipt).toHaveBeenCalledTimes(1)

    await act(async () => {
      await router.navigate(-1)
    })
    await flush()
    expect(router.state.location.search).toBe('')
    expect(buttonByText(host, 'راجع واعتمد')).toBeNull()
    expect(buttonByText(host, 'اعتماد')).toBeNull()
    expect(host.querySelector('h1')?.textContent).toBe('إذن استلام')
  })

  it('starts another new draft when coming back to /receive, never reusing the first id', async () => {
    vi.useFakeTimers()
    h.receipts = [{ id: 'B', deliveryNo: '555', status: 'posted' }]
    h.getReceipt.mockResolvedValue({
      id: 'B',
      status: 'posted',
      ...draftWith([goodLine(1, ITEM_A)], { deliveryNo: '555' }),
    })
    const router = mountAt('/receive')
    await flush()
    click(buttonByText(host, 'بيانات الإذن'))
    type(inputByLabel(host, 'الشركة'), 'شركة س')
    submit(host.querySelector('form'))
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    const firstId = savedCalls()[0]?.[0]
    expect(savedCalls()[0]?.[1].supplier).toBe('شركة س')

    // A delivery number another receipt already holds opens that receipt.
    click(buttonByText(host, 'بيانات الإذن'))
    type(inputByLabel(host, 'رقم الإذن'), '555')
    submit(host.querySelector('form'))
    await flush()
    await flush()
    expect(router.state.location.pathname).toBe('/receive/B')

    await act(async () => {
      await router.navigate(-1)
    })
    await flush()
    expect(router.state.location.pathname).toBe('/receive')
    click(buttonByText(host, 'بيانات الإذن'))
    type(inputByLabel(host, 'رقم الفاتورة'), '77')
    submit(host.querySelector('form'))
    await act(async () => {
      vi.advanceTimersByTime(1000)
    })
    const last = savedCalls().at(-1)
    expect(last?.[1].invoiceNo).toBe('77')
    expect(last?.[0]).not.toBe(firstId)
  })
})
