import { describe, expect, it, vi } from 'vitest'
import { MAX_BATCH_OPS, type PlannedOp } from '../../../src/data/importWriter'
import {
  planRestore,
  previewRestore,
  RestoreWriteError,
  runRestore,
  type RestoreStore,
} from '../../../src/data/restoreWriter'
import type { BackupMovement } from '../../../src/excel/readBackup'
import type { ImportedItem } from '../../../src/excel/types'

const ctx = { uid: 'owner-uid' }

const item = (code: string): ImportedItem => ({
  code,
  page: 1,
  category: 'مسامير',
  nameAr: `صنف ${code}`,
  nameEn: '',
  material: '',
  size: '',
  unit: 'قطعة',
  supplier: '',
  gtins: [],
  authorityCode: null,
  priceMinor: 1000,
  reorderManual: null,
  active: true,
})

const move = (id: string, over: Partial<BackupMovement> = {}): BackupMovement => ({
  id,
  type: 'إضافة',
  itemCode: 'SCR-01',
  qty: 5,
  businessDate: '2026-10-12',
  priceMinor: 1000,
  batchNo: null,
  expiry: null,
  docNumber: null,
  reference: null,
  note: null,
  supplier: null,
  source: { kind: 'receipt', id: 'r1' },
  substituteFor: null,
  reverses: null,
  reason: null,
  deviceId: 'old-device',
  createdBy: 'old-uid',
  ...over,
})

const none = new Set<string>()

describe('planRestore', () => {
  it('writes items before movements, every one, stamped by the server', () => {
    const plan = planRestore({
      items: [item('SCR-01'), item('SCR-02')],
      movements: [move('a'), move('b')],
      existingItemCodes: none,
      existingMovementIds: none,
      ctx,
    })
    expect(plan.itemsToWrite).toBe(2)
    expect(plan.movementsToWrite).toBe(2)
    const ops = plan.batches.flat()
    expect(ops.map((o) => `${o.collection}:${o.id}:${o.stamp}`)).toEqual([
      'items:SCR-01:updatedAt',
      'items:SCR-02:updatedAt',
      'movements:a:postedAt',
      'movements:b:postedAt',
    ])
  })

  it('stores a movement as the rules allow: no id key, authored by the restorer', () => {
    const plan = planRestore({
      items: [item('SCR-01')],
      movements: [move('a', { reason: null, batchNo: 'LOT7' })],
      existingItemCodes: none,
      existingMovementIds: none,
      ctx,
    })
    const data = plan.batches.flat().find((o) => o.id === 'a')!.data
    expect(data).not.toHaveProperty('id')
    expect(data).not.toHaveProperty('postedAt')
    expect(data).toMatchObject({
      createdBy: 'owner-uid',
      deviceId: 'old-device',
      businessDate: '2026-10-12',
      batchNo: 'LOT7',
      priceMinor: 1000,
    })
  })

  it('skips an item or movement the database already holds, and says how many', () => {
    const plan = planRestore({
      items: [item('SCR-01'), item('SCR-02')],
      movements: [move('a'), move('b'), move('c')],
      existingItemCodes: new Set(['SCR-01']),
      existingMovementIds: new Set(['a', 'c']),
      ctx,
    })
    expect(plan).toMatchObject({
      itemsToWrite: 1,
      itemsSkipped: 1,
      movementsToWrite: 1,
      movementsSkipped: 2,
    })
    expect(plan.batches.flat().map((o) => o.id)).toEqual(['SCR-02', 'b'])
  })

  it('keeps every batch within the limit', () => {
    const movements = Array.from({ length: MAX_BATCH_OPS * 2 + 7 }, (_, i) => move(`m${i}`))
    const plan = planRestore({
      items: [item('SCR-01')],
      movements,
      existingItemCodes: none,
      existingMovementIds: none,
      ctx,
    })
    expect(plan.batches.every((b) => b.length <= MAX_BATCH_OPS)).toBe(true)
    expect(plan.batches.flat()).toHaveLength(movements.length + 1)
  })
})

function fakeStore(over: Partial<RestoreStore> = {}) {
  const committed: (readonly PlannedOp[])[] = []
  const store: RestoreStore = {
    existingItemCodes: () => Promise.resolve(none),
    existingMovementIds: () => Promise.resolve(none),
    commit: (ops) => {
      committed.push(ops)
      return Promise.resolve()
    },
    ...over,
  }
  return { store, committed }
}

describe('runRestore', () => {
  it('commits batch by batch and reports progress', async () => {
    const { store, committed } = fakeStore()
    const onProgress = vi.fn()
    const summary = await runRestore({
      store,
      items: [item('SCR-01')],
      movements: [move('a'), move('b')],
      ctx,
      onProgress,
    })
    expect(committed.flat()).toHaveLength(3)
    expect(summary).toMatchObject({ itemsToWrite: 1, movementsToWrite: 2, batchCount: 2 })
    expect(onProgress.mock.calls.at(-1)?.[0]).toEqual({ doneOps: 3, totalOps: 3 })
  })

  it('stops with a message that says it can be run again, and a second run skips what landed', async () => {
    let calls = 0
    const landed = new Set<string>()
    const { store } = fakeStore({
      existingMovementIds: () => Promise.resolve(landed),
      commit: (ops) => {
        calls += 1
        if (calls === 3) return Promise.reject(new Error('offline'))
        for (const o of ops) if (o.collection === 'movements') landed.add(o.id)
        return Promise.resolve()
      },
    })
    const movements = Array.from({ length: MAX_BATCH_OPS + 3 }, (_, i) => move(`m${i}`))
    const args = { store, items: [item('SCR-01')], movements, ctx }
    await expect(runRestore(args)).rejects.toBeInstanceOf(RestoreWriteError)
    expect(landed.size).toBe(MAX_BATCH_OPS) // the first movement batch is in, the second is not
    const second = await runRestore(args)
    expect(second.movementsToWrite).toBe(3)
    expect(second.movementsSkipped).toBe(MAX_BATCH_OPS)
  })
})

describe('previewRestore', () => {
  it('counts what a restore would write without writing anything', async () => {
    const { store, committed } = fakeStore({
      existingMovementIds: () => Promise.resolve(new Set(['a'])),
    })
    const summary = await previewRestore({
      store,
      items: [item('SCR-01')],
      movements: [move('a'), move('b')],
      ctx,
    })
    expect(summary).toMatchObject({ itemsToWrite: 1, movementsToWrite: 1, movementsSkipped: 1 })
    expect(committed).toEqual([])
  })

  it('wraps a failed read in the restore error', async () => {
    const { store } = fakeStore({ existingItemCodes: () => Promise.reject(new Error('x')) })
    await expect(previewRestore({ store, items: [], movements: [], ctx })).rejects.toBeInstanceOf(
      RestoreWriteError,
    )
  })
})
