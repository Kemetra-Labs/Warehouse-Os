import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ISSUE_POST_KIND,
  buildIssueWrites,
  reconcilePendingIssuePosts,
  runIssuePost,
  type IssueCommitPlan,
  type IssuePostDeps,
  type IssuePostInput,
} from '../../../src/data/issuePost'
import { createOutbox, type Outbox } from '../../../src/data/outbox'
import { RECEIPT_POST_KIND, reconcilePendingPosts } from '../../../src/data/receiptPost'
import { toPostBatch, type IssueDraft } from '../../../src/domain/issue'
import { addRequested, addSubstitute } from '../../../src/domain/issueEdit'
import { draftOf, priced, stockOf, TODAY } from '../../helpers/issueFixtures'

const A = priced('SCR-01', 1000)
const S = priced('SCR-02', 1200)
const stock = stockOf([
  { code: 'SCR-01', qty: 4, batchNo: 'B1', expiry: '2028-01' },
  { code: 'SCR-02', qty: 5, batchNo: 'S1', expiry: '2028-03' },
])

/** 6 requested of an item with 4 in stock, 2 covered by a substitute. */
function draft(over: Partial<IssueDraft> = {}): IssueDraft {
  const d = addSubstitute(addRequested(draftOf(), A, 6, stock), 'SCR-01', 'SCR-02', 2, stock)
  return { ...d, ...over }
}

const input = (over: Partial<IssuePostInput> = {}): IssuePostInput => ({
  id: 'b1',
  draft: draft(),
  items: [A, S],
  stock,
  uid: 'owner',
  deviceId: 'dev',
  today: TODAY,
  ...over,
})

let outbox: Outbox

beforeEach(() => {
  outbox = createOutbox({ factory: new IDBFactory(), dbName: 'ip', now: () => 1 })
})

function deps(over: Partial<IssuePostDeps> = {}): IssuePostDeps {
  return {
    outbox,
    commit: () => Promise.resolve(),
    checkServer: () => Promise.resolve(false),
    ...over,
  }
}

const denied = (): Promise<void> =>
  Promise.reject(Object.assign(new Error('nope'), { code: 'permission-denied' }))

describe('buildIssueWrites', () => {
  it('orders the movements first, then the batch status', () => {
    const batch = toPostBatch(draft(), { id: 'b1', items: [A, S], uid: 'owner', deviceId: 'dev' })
    const writes = buildIssueWrites('b1', batch)
    expect(writes.map((w) => w.op)).toEqual(['movement', 'movement', 'batch'])
    expect(writes[0]).toMatchObject({ op: 'movement', id: 'b1-L1' })
    expect(writes[1]).toMatchObject({
      op: 'movement',
      id: 'b1-L2',
      data: { itemCode: 'SCR-02', substituteFor: { itemCode: 'SCR-01', qty: 2 } },
    })
    expect(writes[2]).toMatchObject({
      op: 'batch',
      id: 'b1',
      patch: { status: 'posted', requestedValueMinor: 6000, issuedValueMinor: 6400 },
    })
  })
})

describe('runIssuePost', () => {
  it('returns the problems and writes nothing when the draft is not postable', async () => {
    const commit = vi.fn(() => Promise.resolve())
    const bad = draft({ rep: '' })
    const r = await runIssuePost(input({ draft: bad }), deps({ commit }))
    expect(r.ok).toBe(false)
    expect(!r.ok && r.problems.map((p) => p.code)).toEqual(['no-rep'])
    expect(commit).not.toHaveBeenCalled()
    expect(await outbox.list()).toEqual([])
  })

  it('refuses a batch whose shortage is not covered', async () => {
    const commit = vi.fn(() => Promise.resolve())
    const short = addRequested(draftOf(), A, 6, stock)
    const r = await runIssuePost(input({ draft: short }), deps({ commit }))
    expect(!r.ok && r.problems.map((p) => p.code)).toEqual(['uncovered'])
    expect(commit).not.toHaveBeenCalled()
  })

  it('queues the payload and returns before the server answers (offline)', async () => {
    const never = new Promise<void>(() => undefined)
    const commit = vi.fn<(plan: IssueCommitPlan) => Promise<void>>(() => never)
    const r = await runIssuePost(input(), deps({ commit }))
    expect(r.ok).toBe(true)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(commit.mock.calls[0]?.[0].draftDoc.status).toBe('draft')
    const [row] = await outbox.list()
    expect(row).toMatchObject({ id: 'b1', kind: ISSUE_POST_KIND, status: 'pending' })
    expect(row?.payload).toMatchObject({ batchId: 'b1' })
  })

  it('clears the outbox entry when the server acknowledges', async () => {
    const r = await runIssuePost(input(), deps())
    expect(r.ok && (await r.committed)).toBe('acked')
    expect(await outbox.list()).toEqual([])
  })

  it('still reports acked when the local outbox cleanup fails', async () => {
    const flaky = { ...outbox, markAcked: () => Promise.reject(new Error('idb')) }
    const r = await runIssuePost(input(), deps({ outbox: flaky }))
    expect(r.ok && (await r.committed)).toBe('acked')
  })

  it('treats a rejection as success when the server already holds the posted batch', async () => {
    const checkServer = vi.fn(() => Promise.resolve(true))
    const r = await runIssuePost(input(), deps({ commit: denied, checkServer }))
    expect(r.ok && (await r.committed)).toBe('cleared')
    expect(checkServer).toHaveBeenCalledWith(
      'b1',
      expect.objectContaining({ draftDoc: expect.anything() }),
    )
    expect(await outbox.list()).toEqual([])
  })

  it('marks the entry failed and keeps the payload on a real rejection', async () => {
    const r = await runIssuePost(input(), deps({ commit: denied }))
    expect(r.ok && (await r.committed)).toBe('failed')
    const [row] = await outbox.list()
    expect(row).toMatchObject({ status: 'failed' })
    expect(row?.error).toContain('permission-denied')
    expect(row?.payload).toMatchObject({ batchId: 'b1' })
  })

  it('fails the post (nothing sent) when the outbox cannot store the entry', async () => {
    const commit = vi.fn(() => Promise.resolve())
    const broken = { ...outbox, put: () => Promise.reject(new Error('idb blocked')) }
    await expect(runIssuePost(input(), deps({ outbox: broken, commit }))).rejects.toThrow(
      'idb blocked',
    )
    expect(commit).not.toHaveBeenCalled()
  })
})

describe('reconcilePendingIssuePosts', () => {
  const put = (id: string, kind = ISSUE_POST_KIND) => outbox.put({ id, kind, payload: {} })

  it('only touches issue posts: a pending receipt post stays for its own reconcile', async () => {
    await put('i1')
    await put('r1', RECEIPT_POST_KIND)
    const check = vi.fn((id: string) => Promise.resolve(id === 'i1'))
    const results = await reconcilePendingIssuePosts(outbox, () => Promise.resolve(), check)
    expect(results).toEqual(['cleared'])
    expect(check).toHaveBeenCalledTimes(1)
    expect((await outbox.list()).map((r) => [r.id, r.status])).toEqual([['r1', 'pending']])
  })

  it('and the receipt reconcile leaves issue posts alone', async () => {
    await put('i1')
    expect(
      await reconcilePendingPosts(
        outbox,
        () => Promise.resolve(),
        () => Promise.resolve(true),
      ),
    ).toEqual([])
    expect((await outbox.list()).map((r) => r.id)).toEqual(['i1'])
  })

  it('keeps the entry pending when the server cannot be reached at restart', async () => {
    await put('i1')
    const check = () => Promise.reject(Object.assign(new Error('offline'), { code: 'unavailable' }))
    expect(await reconcilePendingIssuePosts(outbox, () => Promise.resolve(), check)).toEqual([
      'pending',
    ])
  })

  it('fails the entry when the server does not hold the batch', async () => {
    await put('i1')
    expect(
      await reconcilePendingIssuePosts(
        outbox,
        () => Promise.resolve(),
        () => Promise.resolve(false),
      ),
    ).toEqual(['failed'])
  })
})
