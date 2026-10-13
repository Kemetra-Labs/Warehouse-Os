import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ISSUE_POST_KIND, buildIssueWrites } from '../../../src/data/issuePost'
import { createOutbox, type Outbox, type OutboxEntry } from '../../../src/data/outbox'
import { RECEIPT_POST_KIND } from '../../../src/data/receiptPost'
import {
  describeUnsent,
  rebuildPost,
  retryUnsent,
  sortUnsent,
  type RetryDeps,
} from '../../../src/data/unsent'
import { toPostBatch as toIssueBatch } from '../../../src/domain/issue'
import { addRequested } from '../../../src/domain/issueEdit'
import { newDraft, newLine, toPostBatch as toReceiptBatch } from '../../../src/domain/receipt'
import { draftOf, priced, stockOf } from '../../helpers/issueFixtures'

const A = priced('SCR-01', 1000)
const stock = stockOf([{ code: 'SCR-01', qty: 9, batchNo: 'B1', expiry: '2028-01' }])

function issuePayload() {
  const draft = addRequested(draftOf({ number: 14 }), A, 3, stock)
  const batch = toIssueBatch(draft, { id: 'b1', items: [A], uid: 'owner', deviceId: 'dev' })
  return { batchId: 'b1', draft, batch }
}

function receiptPayload() {
  const draft = {
    ...newDraft('2026-10-12'),
    supplier: 'الهيئة',
    deliveryNo: 'D-7',
    lines: [{ ...newLine(1), itemCode: 'SCR-01', invoicedQty: 5, countedQty: 5, priceMinor: 1000 }],
  }
  const batch = toReceiptBatch(draft, {
    id: 'r1',
    items: [{ code: 'SCR-01', priceMinor: 1000, gtins: [] }],
    uid: 'owner',
    deviceId: 'dev',
  })
  return { receiptId: 'r1', draft, batch }
}

const entry = (over: Partial<OutboxEntry>): OutboxEntry => ({
  id: 'x',
  kind: ISSUE_POST_KIND,
  payload: {},
  status: 'failed',
  error: 'permission-denied: no',
  createdAt: 5,
  ...over,
})

describe('describeUnsent', () => {
  it('summarises an issue batch with its lines and resolves item names', () => {
    const v = describeUnsent(entry({ id: 'b1', payload: issuePayload() }), (c) =>
      c === 'SCR-01' ? 'مسمار' : c,
    )
    expect(v).toMatchObject({
      kind: 'issue',
      title: 'دفعة صرف 14',
      subtitle: 'إيجي فيكس',
      status: 'failed',
      error: 'permission-denied: no',
    })
    expect(v.lines).toEqual([
      expect.objectContaining({ itemCode: 'SCR-01', name: 'مسمار', type: 'صرف', qty: 3 }),
    ])
  })

  it('summarises a receipt', () => {
    const v = describeUnsent(
      entry({ id: 'r1', kind: RECEIPT_POST_KIND, payload: receiptPayload() }),
    )
    expect(v).toMatchObject({ kind: 'receipt', title: 'استلام الهيئة', subtitle: 'إذن D-7' })
    expect(v.lines).toHaveLength(1)
    expect(v.lines[0]).toMatchObject({ itemCode: 'SCR-01', qty: 5, name: 'SCR-01' })
  })

  it('still shows an unknown kind or a broken payload', () => {
    expect(describeUnsent(entry({ kind: 'mystery', payload: null }))).toMatchObject({
      kind: 'unknown',
      subtitle: 'mystery',
      lines: [],
    })
    const broken = { draft: 7, batch: { movements: [1, { data: 2 }] } }
    expect(describeUnsent(entry({ payload: broken }))).toMatchObject({
      kind: 'issue',
      subtitle: 'من غير مندوب',
      lines: [],
    })
  })
})

describe('sortUnsent', () => {
  it('puts failed first, then oldest first', () => {
    const views = [
      describeUnsent(entry({ id: 'p1', status: 'pending', createdAt: 1 })),
      describeUnsent(entry({ id: 'f2', createdAt: 9 })),
      describeUnsent(entry({ id: 'f1', createdAt: 3 })),
    ]
    expect(sortUnsent(views).map((v) => v.id)).toEqual(['f1', 'f2', 'p1'])
  })
})

describe('rebuildPost', () => {
  it('rebuilds the same writes the post queued', () => {
    const p = issuePayload()
    const rebuilt = rebuildPost(entry({ id: 'b1', payload: p }))
    expect(rebuilt?.kind).toBe('issue')
    expect(rebuilt?.plan).toMatchObject({
      batchId: 'b1',
      draftDoc: { status: 'draft', number: 14 },
      writes: buildIssueWrites('b1', p.batch),
    })
    const receipt = rebuildPost(
      entry({ id: 'r1', kind: RECEIPT_POST_KIND, payload: receiptPayload() }),
    )
    expect(receipt?.kind).toBe('receipt')
  })

  it('returns null for payloads it cannot read', () => {
    expect(rebuildPost(entry({ payload: null }))).toBeNull()
    expect(rebuildPost(entry({ payload: { draft: {}, batch: {} } }))).toBeNull()
    expect(rebuildPost(entry({ kind: 'mystery', payload: issuePayload() }))).toBeNull()
  })
})

describe('retryUnsent', () => {
  let outbox: Outbox
  beforeEach(() => {
    outbox = createOutbox({ factory: new IDBFactory(), dbName: 'unsent', now: () => 1 })
  })

  const deps = (over: Partial<RetryDeps> = {}): RetryDeps => ({
    outbox,
    commitReceipt: () => Promise.resolve(),
    commitIssue: () => Promise.resolve(),
    checkReceipt: () => Promise.resolve(false),
    checkIssue: () => Promise.resolve(false),
    ...over,
  })

  async function firstRow(): Promise<OutboxEntry> {
    const [row] = await outbox.list()
    if (!row) throw new Error('no row')
    return row
  }

  async function failedEntry(): Promise<OutboxEntry> {
    await outbox.put({ id: 'b1', kind: ISSUE_POST_KIND, payload: issuePayload() })
    await outbox.markFailed('b1', 'permission-denied: no')
    return firstRow()
  }

  it('goes back to pending, sends the plan again and clears the entry on ack', async () => {
    const row = await failedEntry()
    const commitIssue = vi.fn(() => Promise.resolve())
    const result = await retryUnsent(row, deps({ commitIssue }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.outcome).toBe('acked')
    expect(commitIssue).toHaveBeenCalledTimes(1)
    expect(await outbox.list()).toEqual([])
  })

  it('is pending while the server has not answered (offline)', async () => {
    const row = await failedEntry()
    const never = new Promise<void>(() => undefined)
    await retryUnsent(row, deps({ commitIssue: () => never }))
    expect(await firstRow()).toMatchObject({ status: 'pending', error: null })
  })

  it('fails again and keeps the payload when the server rejects it again', async () => {
    const row = await failedEntry()
    const denied = Object.assign(new Error('nope'), { code: 'permission-denied' })
    const result = await retryUnsent(row, deps({ commitIssue: () => Promise.reject(denied) }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.outcome).toBe('failed')
    const after = await firstRow()
    expect(after).toMatchObject({ status: 'failed', payload: row.payload })
    expect(after.error).toContain('permission-denied')
  })

  it('clears the entry when the server turns out to have it already', async () => {
    const row = await failedEntry()
    const result = await retryUnsent(
      row,
      deps({
        commitIssue: () => Promise.reject(new Error('already')),
        checkIssue: () => Promise.resolve(true),
      }),
    )
    if (!result.ok) throw new Error('expected ok')
    expect(await result.outcome).toBe('cleared')
    expect(await outbox.list()).toEqual([])
  })

  it('refuses an unreadable payload without touching the outbox', async () => {
    await outbox.put({ id: 'bad', kind: ISSUE_POST_KIND, payload: { nope: true } })
    const row = await firstRow()
    expect(await retryUnsent(row, deps())).toEqual({ ok: false })
    expect((await firstRow()).status).toBe('pending')
  })

  it('retries a receipt through the receipt commit', async () => {
    await outbox.put({ id: 'r1', kind: RECEIPT_POST_KIND, payload: receiptPayload() })
    const commitReceipt = vi.fn(() => Promise.resolve())
    const result = await retryUnsent(await firstRow(), deps({ commitReceipt }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.outcome).toBe('acked')
    expect(commitReceipt).toHaveBeenCalledTimes(1)
  })
})
