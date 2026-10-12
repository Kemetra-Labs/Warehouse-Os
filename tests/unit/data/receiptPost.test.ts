import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createOutbox, type Outbox } from '../../../src/data/outbox'
import {
  RECEIPT_POST_KIND,
  buildWrites,
  reconcilePendingPosts,
  runPost,
  type CommitPlan,
  type PostDeps,
  type PostInput,
} from '../../../src/data/receiptPost'
import { newDraft, newLine, toPostBatch, type ReceiptDraft } from '../../../src/domain/receipt'

const TODAY = '2026-10-12'

function draft(over: Partial<ReceiptDraft> = {}): ReceiptDraft {
  return {
    ...newDraft(TODAY),
    supplier: 'الهيئة',
    deliveryNo: 'D-1',
    invoiceNo: 'INV-1',
    lines: [
      {
        ...newLine(1),
        itemCode: 'SCR-01',
        scannedGtin: '6221234567890',
        invoicedQty: 5,
        countedQty: 5,
        priceMinor: 1100,
        prevPriceMinor: 1000,
      },
      { ...newLine(2), itemCode: 'SCR-02', invoicedQty: 2, countedQty: 0, diffReason: 'لم يصل' },
    ],
    ...over,
  }
}

const input = (over: Partial<PostInput> = {}): PostInput => ({
  id: 'r1',
  draft: draft(),
  items: [
    { code: 'SCR-01', priceMinor: 1000, gtins: [] },
    { code: 'SCR-02', priceMinor: 500, gtins: [] },
  ],
  existing: [],
  uid: 'owner',
  deviceId: 'dev',
  today: TODAY,
  ...over,
})

let outbox: Outbox

beforeEach(() => {
  outbox = createOutbox({ factory: new IDBFactory(), dbName: 'rp', now: () => 1 })
})

function deps(over: Partial<PostDeps> = {}): PostDeps {
  return {
    outbox,
    commit: () => Promise.resolve(),
    checkServer: () => Promise.resolve(false),
    ...over,
  }
}

const denied = (): Promise<void> =>
  Promise.reject(Object.assign(new Error('nope'), { code: 'permission-denied' }))

describe('buildWrites', () => {
  it('orders movements, item updates, then the receipt status', () => {
    const batch = toPostBatch(input().draft, {
      id: 'r1',
      items: input().items,
      uid: 'owner',
      deviceId: 'dev',
    })
    const writes = buildWrites('r1', batch)
    expect(writes.map((w) => w.op)).toEqual(['movement', 'item', 'receipt'])
    expect(writes[0]).toMatchObject({ op: 'movement', id: 'r1-L1' })
    expect(writes[1]).toMatchObject({ op: 'item', code: 'SCR-01', priceMinor: 1100 })
    expect(writes[2]).toMatchObject({
      op: 'receipt',
      id: 'r1',
      patch: {
        status: 'posted',
        priceUpdates: [{ itemCode: 'SCR-01', fromMinor: 1000, toMinor: 1100 }],
      },
    })
  })
})

describe('runPost', () => {
  it('returns the issues and writes nothing when the draft is not postable', async () => {
    const commit = vi.fn(() => Promise.resolve())
    const bad = draft({ lines: [{ ...newLine(1), invoicedQty: 1, countedQty: 1 }] })
    const r = await runPost(input({ draft: bad }), deps({ commit }))
    expect(r.ok).toBe(false)
    expect(commit).not.toHaveBeenCalled()
    expect(await outbox.list()).toEqual([])
  })

  it('queues the payload and returns before the server answers (offline)', async () => {
    const never = new Promise<void>(() => undefined)
    const commit = vi.fn<(plan: CommitPlan) => Promise<void>>(() => never)
    const r = await runPost(input(), deps({ commit }))
    expect(r.ok).toBe(true)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]?.[0].draftDoc.status).toBe('draft')
    const [row] = await outbox.list()
    expect(row).toMatchObject({ id: 'r1', kind: RECEIPT_POST_KIND, status: 'pending' })
    expect(row?.payload).toMatchObject({ receiptId: 'r1' })
  })

  it('passes the gtin warnings through', async () => {
    const items = [
      { code: 'SCR-01', priceMinor: 1000, gtins: [] },
      { code: 'SCR-02', priceMinor: 500, gtins: ['6221234567890'] },
    ]
    const r = await runPost(input({ items }), deps())
    expect(r.ok && r.warnings[0]?.kind).toBe('gtin-held')
  })

  it('clears the outbox entry when the server acknowledges', async () => {
    const r = await runPost(input(), deps())
    expect(r.ok && (await r.committed)).toBe('acked')
    expect(await outbox.list()).toEqual([])
  })

  it('still reports acked when the local outbox cleanup fails', async () => {
    const flaky = { ...outbox, markAcked: () => Promise.reject(new Error('idb')) }
    const r = await runPost(input(), deps({ outbox: flaky }))
    expect(r.ok && (await r.committed)).toBe('acked')
  })

  it('treats a rejection as success when the server already holds the posted receipt', async () => {
    const checkServer = vi.fn(() => Promise.resolve(true))
    const r = await runPost(input(), deps({ commit: denied, checkServer }))
    expect(r.ok && (await r.committed)).toBe('cleared')
    expect(checkServer).toHaveBeenCalledWith('r1')
    expect(await outbox.list()).toEqual([])
  })

  it('marks the entry failed and keeps the payload on a real rejection', async () => {
    const r = await runPost(input(), deps({ commit: denied }))
    expect(r.ok && (await r.committed)).toBe('failed')
    const [row] = await outbox.list()
    expect(row).toMatchObject({ status: 'failed' })
    expect(row?.error).toContain('permission-denied')
    expect(row?.payload).toMatchObject({ receiptId: 'r1' })
  })

  it('treats a synchronous commit error like a rejection', async () => {
    const commit = (): Promise<void> => {
      throw new Error('boom')
    }
    const r = await runPost(input(), deps({ commit }))
    expect(r.ok && (await r.committed)).toBe('failed')
  })

  it('fails the post (nothing sent) when the outbox cannot store the entry', async () => {
    const commit = vi.fn(() => Promise.resolve())
    const broken = { ...outbox, put: () => Promise.reject(new Error('idb blocked')) }
    await expect(runPost(input(), deps({ outbox: broken, commit }))).rejects.toThrow('idb blocked')
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('reconcilePendingPosts', () => {
  const put = (id: string, kind = RECEIPT_POST_KIND) => outbox.put({ id, kind, payload: {} })

  it('does nothing, and does not wait, when no receipt post is pending', async () => {
    const wait = vi.fn(() => Promise.resolve())
    await put('other', 'issue.post')
    expect(await reconcilePendingPosts(outbox, wait, () => Promise.resolve(true))).toEqual([])
    expect(wait).not.toHaveBeenCalled()
  })

  it('waits for pending writes, then clears posted ones and fails the rest', async () => {
    await put('a')
    await put('b')
    await put('c', 'issue.post')
    const order: string[] = []
    const wait = () => {
      order.push('wait')
      return Promise.resolve()
    }
    const check = (id: string) => {
      order.push(`check-${id}`)
      return Promise.resolve(id === 'a')
    }
    const results = await reconcilePendingPosts(outbox, wait, check)
    expect(results).toEqual(['cleared', 'failed'])
    expect(order).toEqual(['wait', 'check-a', 'check-b'])
    const rows = await outbox.list()
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['b', 'failed'],
      ['c', 'pending'],
    ])
  })

  it('keeps the entry pending when the server cannot be reached at restart', async () => {
    await put('a')
    const check = () => Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }))
    expect(await reconcilePendingPosts(outbox, () => Promise.resolve(), check)).toEqual(['pending'])
    const [row] = await outbox.list()
    expect(row).toMatchObject({ id: 'a', status: 'pending' })
  })

  it('fails the entry on a non-network error from the server check', async () => {
    await put('a')
    const check = () => Promise.reject(Object.assign(new Error('x'), { code: 'permission-denied' }))
    expect(await reconcilePendingPosts(outbox, () => Promise.resolve(), check)).toEqual(['failed'])
    const [row] = await outbox.list()
    expect(row?.error).toContain('permission-denied')
  })

  it('leaves failed entries alone', async () => {
    await put('a')
    await outbox.markFailed('a', 'x')
    const check = vi.fn(() => Promise.resolve(true))
    expect(await reconcilePendingPosts(outbox, () => Promise.resolve(), check)).toEqual([])
    expect(check).not.toHaveBeenCalled()
  })
})
