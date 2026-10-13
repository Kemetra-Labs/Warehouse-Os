import { IDBFactory } from 'fake-indexeddb'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ISSUE_CANCEL_KIND,
  MANUAL_MOVEMENT_KIND,
  RECEIPT_CANCEL_KIND,
  buildCancelWrites,
  cancelEntryId,
  docIdOfCancelEntry,
  runIssueCancel,
  runManualMovement,
  runReceiptCancel,
  type CancelCommitPlan,
  type CancelDeps,
  type ManualDeps,
} from '../../../src/data/cancelPost'
import { createOutbox, type Outbox } from '../../../src/data/outbox'
import { RECEIPT_POST_KIND, reconcilePendingPosts } from '../../../src/data/receiptPost'
import { describeUnsent, rebuildPost, retryUnsent, type RetryDeps } from '../../../src/data/unsent'
import type { StoredMovement } from '../../../src/domain/cancel'
import type { ManualInput } from '../../../src/domain/adjust'
import { toPostBatch as toIssueBatch } from '../../../src/domain/issue'
import { addRequested } from '../../../src/domain/issueEdit'
import { toPostBatch as toReceiptBatch, type PlannedMovement } from '../../../src/domain/receipt'
import { draftOf, priced, stockOf } from '../../helpers/issueFixtures'
import { ITEM_A, TODAY, draftWith, goodLine } from '../../helpers/receiptFixtures'

const WHO = { uid: 'owner', deviceId: 'dev' }
const stored = (m: PlannedMovement): StoredMovement => ({ ...m.data, id: m.id })

// A receipt that changed ITEM_A's price, and an issue batch of 3 pieces.
const receipt = toReceiptBatch(
  draftWith([
    goodLine(1, ITEM_A, { countedQty: 5, invoicedQty: 5, priceMinor: 1500, prevPriceMinor: 1250 }),
  ]),
  { id: 'r1', items: [{ code: ITEM_A.code, priceMinor: 1250, gtins: [] }], ...WHO },
)
const A = priced('SCR-01', 1000)
const issue = toIssueBatch(
  addRequested(
    draftOf({ number: 14 }),
    A,
    3,
    stockOf([{ code: 'SCR-01', qty: 9, batchNo: 'B1', expiry: '2028-01' }]),
  ),
  { id: 'b1', items: [A], ...WHO },
)

const receiptRequest = (over: Record<string, unknown> = {}) => ({
  receipt: { id: 'r1', status: 'posted' as const },
  label: 'إذن 19808953',
  reason: 'استلام بالغلط',
  today: TODAY,
  ...WHO,
  movements: receipt.movements.map(stored),
  expectedMovements: 1,
  priceUpdates: receipt.priceUpdates,
  items: [{ code: ITEM_A.code, priceMinor: 1500 }],
  ...over,
})

const issueRequest = (over: Record<string, unknown> = {}) => ({
  docId: 'b1',
  status: 'posted' as const,
  label: 'دفعة 14',
  reason: 'اتصرفت للمندوب الغلط',
  today: TODAY,
  ...WHO,
  movements: issue.movements.map(stored),
  expectedMovements: 1,
  ...over,
})

let outbox: Outbox
beforeEach(() => {
  outbox = createOutbox({ factory: new IDBFactory(), dbName: 'cancel', now: () => 1 })
})

const deps = (over: Partial<CancelDeps> = {}): CancelDeps => ({
  outbox,
  commit: () => Promise.resolve(),
  checkServer: () => Promise.resolve(false),
  ...over,
})

const denied = (): Promise<void> =>
  Promise.reject(Object.assign(new Error('nope'), { code: 'permission-denied' }))

describe('cancel entry ids', () => {
  it('never use the document id, which a pending post may still hold', () => {
    expect(cancelEntryId('r1')).toBe('cancel-r1')
    expect(cancelEntryId('r1')).not.toBe('r1')
    expect(docIdOfCancelEntry('cancel-r1')).toBe('r1')
    expect(docIdOfCancelEntry('r1')).toBe('r1')
  })
})

describe('runReceiptCancel', () => {
  it('queues the writes under its own id and sends one plan: reversals, price, then the document', async () => {
    const commit = vi.fn((plan: CancelCommitPlan) => {
      void plan
      return Promise.resolve()
    })
    const result = await runReceiptCancel(receiptRequest(), deps({ commit }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.committed).toBe('acked')
    const plan = commit.mock.calls[0]?.[0]
    expect(plan).toMatchObject({ collection: 'receipts', docId: 'r1' })
    expect(plan?.writes.map((w) => w.op)).toEqual(['movement', 'item-price', 'doc'])
    expect(plan?.writes[0]).toMatchObject({ id: 'rev-r1-L1', data: { reverses: 'r1-L1' } })
    expect(plan?.writes[1]).toEqual({ op: 'item-price', code: ITEM_A.code, priceMinor: 1250 })
    expect(plan?.writes[2]).toEqual({ op: 'doc', reason: 'استلام بالغلط' })
    expect(await outbox.list()).toEqual([])
  })

  it('does not overwrite a post that is still pending for the same document', async () => {
    await outbox.put({ id: 'r1', kind: RECEIPT_POST_KIND, payload: { receiptId: 'r1' } })
    const never = new Promise<void>(() => undefined)
    await runReceiptCancel(receiptRequest(), deps({ commit: () => never }))
    const rows = await outbox.list()
    expect(rows.map((r) => [r.id, r.kind]).sort()).toEqual([
      ['cancel-r1', RECEIPT_CANCEL_KIND],
      ['r1', RECEIPT_POST_KIND],
    ])
  })

  it('refuses without a reason, a second time, or a draft, and queues nothing', async () => {
    const commit = vi.fn(() => Promise.resolve())
    for (const [over, code] of [
      [{ reason: ' ' }, 'no-reason'],
      [{ receipt: { id: 'r1', status: 'cancelled' } }, 'not-posted'],
      [{ receipt: { id: 'r1', status: 'draft' } }, 'not-posted'],
    ] as const) {
      const result = await runReceiptCancel(receiptRequest(over), deps({ commit }))
      expect(result).toMatchObject({ ok: false, problem: { code } })
    }
    expect(commit).not.toHaveBeenCalled()
    expect(await outbox.list()).toEqual([])
  })

  it('fails the entry when the rules refuse, and keeps the writes', async () => {
    const result = await runReceiptCancel(receiptRequest(), deps({ commit: denied }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.committed).toBe('failed')
    const [row] = await outbox.list()
    expect(row).toMatchObject({ id: 'cancel-r1', kind: RECEIPT_CANCEL_KIND, status: 'failed' })
    expect(row?.error).toContain('permission-denied')
  })

  it('counts a rejected cancel as applied when the server already holds it cancelled (R12)', async () => {
    const checkServer = vi.fn(() => Promise.resolve(true))
    const result = await runReceiptCancel(receiptRequest(), deps({ commit: denied, checkServer }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.committed).toBe('cleared')
    expect(checkServer).toHaveBeenCalledWith('cancel-r1')
    expect(await outbox.list()).toEqual([])
  })

  it('stays failed when the server still has the document posted', async () => {
    const result = await runReceiptCancel(receiptRequest(), deps({ commit: denied }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.committed).toBe('failed')
  })
})

describe('runIssueCancel', () => {
  it('writes the reversal and the document, with no price restore', async () => {
    const commit = vi.fn((plan: CancelCommitPlan) => {
      void plan
      return Promise.resolve()
    })
    const result = await runIssueCancel(issueRequest(), deps({ commit }))
    if (!result.ok) throw new Error('expected ok')
    await result.committed
    const plan = commit.mock.calls[0]?.[0]
    expect(plan).toMatchObject({ collection: 'issueBatches', docId: 'b1' })
    expect(plan?.writes.map((w) => w.op)).toEqual(['movement', 'doc'])
    expect(plan?.writes[0]).toMatchObject({
      id: 'rev-b1-L1',
      data: { type: 'تسوية', qty: 3, source: { kind: 'issue', id: 'b1' } },
    })
  })

  it('refuses a second cancel', async () => {
    const result = await runIssueCancel(issueRequest({ status: 'cancelled' }), deps())
    expect(result).toMatchObject({ ok: false, problem: { code: 'not-posted' } })
  })
})

describe('reconcile at app start', () => {
  const reconcile = (cancelled: boolean) =>
    reconcilePendingPosts(
      outbox,
      () => Promise.resolve(),
      () => Promise.resolve(cancelled),
      ISSUE_CANCEL_KIND,
    )

  it('clears a pending cancel the server applied, and fails one it did not', async () => {
    const never = new Promise<void>(() => undefined)
    await runIssueCancel(issueRequest(), deps({ commit: () => never }))
    expect(await reconcile(false)).toEqual(['failed'])
    expect((await outbox.list())[0]?.status).toBe('failed')

    await outbox.put({ id: 'cancel-b1', kind: ISSUE_CANCEL_KIND, payload: {} })
    expect(await reconcile(true)).toEqual(['cleared'])
    expect(await outbox.list()).toEqual([])
  })

  it('leaves the entries of other kinds alone', async () => {
    await outbox.put({ id: 'r1', kind: RECEIPT_POST_KIND, payload: {} })
    expect(await reconcile(true)).toEqual([])
    expect(await outbox.list()).toHaveLength(1)
  })
})

describe('buildCancelWrites', () => {
  it('puts the document last, so the status never moves before the reversals', () => {
    const outcomeWrites = buildCancelWrites({
      reversals: [],
      priceRestores: [{ itemCode: 'A', priceMinor: 5 }],
      patch: { status: 'cancelled', cancelReason: 'x' },
    })
    expect(outcomeWrites.map((w) => w.op)).toEqual(['item-price', 'doc'])
  })
})

describe('runManualMovement', () => {
  const form: ManualInput = {
    kind: 'adjust',
    itemCode: 'SCR-01',
    qty: 4,
    batchNo: 'B1',
    expiry: '2028-01',
    priceMinor: 1000,
    reason: 'تسوية رصيد سالب',
    businessDate: TODAY,
  }
  const manualDeps = (over: Partial<ManualDeps> = {}): ManualDeps => ({
    outbox,
    commit: () => Promise.resolve(),
    checkServer: () => Promise.resolve(false),
    ...over,
  })
  const input = (over: Partial<ManualInput> = {}) => ({
    id: 'u1',
    form: { ...form, ...over },
    today: TODAY,
    ...WHO,
  })

  it('queues a new movement under its own id and clears it on ack', async () => {
    const commit = vi.fn(() => Promise.resolve())
    const result = await runManualMovement(input(), manualDeps({ commit }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.committed).toBe('acked')
    expect(commit).toHaveBeenCalledWith({
      id: 'u1',
      movement: expect.objectContaining({ type: 'تسوية', qty: 4, reverses: null }),
    })
    expect(await outbox.list()).toEqual([])
  })

  it('refuses a missing reason or a zero quantity and queues nothing', async () => {
    const noReason = await runManualMovement(input({ reason: '' }), manualDeps())
    expect(noReason).toMatchObject({ ok: false, problems: [{ code: 'reason' }] })
    const zero = await runManualMovement(input({ qty: 0 }), manualDeps())
    expect(zero).toMatchObject({ ok: false, problems: [{ code: 'qty' }] })
    expect(await outbox.list()).toEqual([])
  })

  it('counts a rejected write as applied when the server already has the movement', async () => {
    const result = await runManualMovement(
      input(),
      manualDeps({ commit: denied, checkServer: () => Promise.resolve(true) }),
    )
    if (!result.ok) throw new Error('expected ok')
    expect(await result.committed).toBe('cleared')
  })
})

describe('unsent: describe, rebuild and retry a cancel or an adjustment', () => {
  const retryDeps = (over: Partial<RetryDeps> = {}): RetryDeps => ({
    outbox,
    commitReceipt: () => Promise.resolve(),
    commitIssue: () => Promise.resolve(),
    checkReceipt: () => Promise.resolve(true),
    checkIssue: () => Promise.resolve(true),
    commitCancel: () => Promise.resolve(),
    checkReceiptCancel: () => Promise.resolve(false),
    checkIssueCancel: () => Promise.resolve(false),
    commitManual: () => Promise.resolve(),
    checkManual: () => Promise.resolve(false),
    ...over,
  })

  async function failedCancel() {
    const result = await runReceiptCancel(receiptRequest(), deps({ commit: denied }))
    if (result.ok) await result.committed
    const [row] = await outbox.list()
    if (!row) throw new Error('no row')
    return row
  }

  it('describes a cancel with its reason and the reversals it would write', async () => {
    const view = describeUnsent(await failedCancel(), (c) => (c === ITEM_A.code ? 'صنف ألف' : c))
    expect(view).toMatchObject({
      kind: 'cancel',
      title: 'إلغاء إذن 19808953',
      subtitle: 'السبب: استلام بالغلط',
      status: 'failed',
      businessDate: TODAY,
    })
    expect(view.lines).toEqual([
      expect.objectContaining({ name: 'صنف ألف', type: 'تسوية', qty: -5, priceMinor: 1500 }),
    ])
  })

  it('describes an adjustment and rebuilds it', async () => {
    const posted = await runManualMovement(
      {
        id: 'u1',
        form: {
          kind: 'return',
          itemCode: 'SCR-01',
          qty: 2,
          batchNo: null,
          expiry: null,
          priceMinor: 1000,
          reason: 'رجع من المندوب',
          businessDate: TODAY,
        },
        today: TODAY,
        ...WHO,
      },
      { outbox, commit: denied, checkServer: () => Promise.resolve(false) },
    )
    if (posted.ok) await posted.committed
    const [row] = await outbox.list()
    if (!row) throw new Error('no row')
    expect(row.kind).toBe(MANUAL_MOVEMENT_KIND)
    expect(describeUnsent(row)).toMatchObject({
      kind: 'adjust',
      title: 'مرتجع SCR-01',
      subtitle: 'السبب: رجع من المندوب',
    })
    expect(rebuildPost(row)).toMatchObject({ kind: 'manual', plan: { id: 'u1' } })
  })

  it('rebuilds the cancel from the stored writes, on the document id and not the entry id', async () => {
    const rebuilt = rebuildPost(await failedCancel())
    expect(rebuilt).toMatchObject({
      kind: 'receipt-cancel',
      plan: { collection: 'receipts', docId: 'r1' },
    })
  })

  it('refuses an unreadable cancel payload', () => {
    const bad = { id: 'cancel-x', kind: ISSUE_CANCEL_KIND, payload: { writes: 1 } }
    expect(rebuildPost({ ...bad, status: 'failed', error: null, createdAt: 1 })).toBeNull()
  })

  it('retries a failed cancel, and its server check must say "cancelled" to clear it', async () => {
    const row = await failedCancel()
    const commitCancel = vi.fn(() => Promise.reject(new Error('still no')))
    const stays = await retryUnsent(row, retryDeps({ commitCancel }))
    if (!stays.ok) throw new Error('expected ok')
    // A posted-or-cancelled check would wrongly clear this: the cancel check is its own.
    expect(await stays.outcome).toBe('failed')

    const clears = await retryUnsent(
      row,
      retryDeps({ commitCancel, checkReceiptCancel: () => Promise.resolve(true) }),
    )
    if (!clears.ok) throw new Error('expected ok')
    expect(await clears.outcome).toBe('cleared')
  })

  it('sends a cancel again through the cancel commit and clears it on ack', async () => {
    const row = await failedCancel()
    const commitCancel = vi.fn((plan: CancelCommitPlan) => {
      void plan
      return Promise.resolve()
    })
    const result = await retryUnsent(row, retryDeps({ commitCancel }))
    if (!result.ok) throw new Error('expected ok')
    expect(await result.outcome).toBe('acked')
    expect(commitCancel.mock.calls[0]?.[0]).toMatchObject({ docId: 'r1' })
    expect(await outbox.list()).toEqual([])
  })
})
