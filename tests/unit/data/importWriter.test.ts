import { describe, expect, it } from 'vitest'
import { getDeviceId } from '../../../src/data/deviceId'
import {
  AlreadyImportedError,
  ImportWriteError,
  MAX_BATCH_OPS,
  planImport,
  runImport,
  type ImportMark,
  type ImportStore,
  type PlannedOp,
  type WriterContext,
} from '../../../src/data/importWriter'
import { movementSchema } from '../../../src/domain/types'
import type { ImportedItem, ImportedMovement } from '../../../src/excel/types'

const ctx: WriterContext = { uid: 'owner-uid', deviceId: 'device-1', fileName: 'book.xlsx' }

function item(n: number): ImportedItem {
  return {
    code: `TST-${String(n).padStart(3, '0')}`,
    page: 1,
    category: 'فئة',
    nameAr: `صنف ${n}`,
    nameEn: '',
    material: '',
    size: '',
    unit: 'قطعة',
    supplier: '',
    gtins: [],
    priceMinor: 100 + n,
    reorderManual: null,
    active: true,
  }
}

function movement(row: number, itemCode: string): ImportedMovement {
  return {
    id: `imp-r${row}`,
    row,
    type: 'إضافة',
    itemCode,
    qty: 3,
    businessDate: '2026-08-01',
    batchNo: null,
    expiry: null,
    docNumber: null,
    reference: null,
    note: 'رصيد افتتاحي',
    supplier: null,
  }
}

const items = (count: number) => Array.from({ length: count }, (_, i) => item(i + 1))
const moves = (count: number, itemCode = 'TST-001') =>
  Array.from({ length: count }, (_, i) => movement(i + 5, itemCode))

interface FakeOptions {
  readonly mark?: ImportMark | null
  readonly existingItems?: readonly string[]
  readonly existingMovements?: readonly string[]
  readonly failOnCommit?: number
  readonly failOnMark?: boolean
}

function fakeStore(opts: FakeOptions = {}) {
  const events: string[] = []
  const batches: PlannedOp[][] = []
  const store: ImportStore = {
    readImportMark: () => Promise.resolve(opts.mark ?? null),
    existingItemCodes: () => Promise.resolve(new Set(opts.existingItems ?? [])),
    existingMovementIds: () => Promise.resolve(new Set(opts.existingMovements ?? [])),
    commit: (ops) => {
      if (opts.failOnCommit === batches.length + 1) return Promise.reject(new Error('offline'))
      batches.push([...ops])
      events.push('commit')
      return Promise.resolve()
    },
    markImported: () => {
      if (opts.failOnMark) return Promise.reject(new Error('settings denied'))
      events.push('mark')
      return Promise.resolve()
    },
  }
  return { store, events, batches }
}

describe('planImport', () => {
  it('writes items first, then movements, never more than 450 ops per batch', () => {
    const plan = planImport({
      items: items(97),
      movements: moves(1000),
      existingItemCodes: new Set(),
      existingMovementIds: new Set(),
      ctx,
    })
    expect(plan.batches.every((b) => b.length <= MAX_BATCH_OPS && b.length > 0)).toBe(true)
    expect(plan.batches.map((b) => b.length)).toEqual([97, 450, 450, 100])
    expect(plan.batches[0]?.every((op) => op.collection === 'items')).toBe(true)
    expect(plan.batches.slice(1).every((b) => b.every((op) => op.collection === 'movements'))).toBe(
      true,
    )
  })

  it('splits a very large item list too', () => {
    const plan = planImport({
      items: items(900),
      movements: [],
      existingItemCodes: new Set(),
      existingMovementIds: new Set(),
      ctx,
    })
    expect(plan.batches.map((b) => b.length)).toEqual([450, 450])
  })

  it('skips existing items and existing imp-r ids (resume)', () => {
    const plan = planImport({
      items: items(3),
      movements: moves(4),
      existingItemCodes: new Set(['TST-001', 'TST-002']),
      existingMovementIds: new Set(['imp-r5', 'imp-r7']),
      ctx,
    })
    expect(plan).toMatchObject({
      itemsToWrite: 1,
      movementsToWrite: 2,
      itemsSkipped: 2,
      movementsSkipped: 2,
    })
    const ids = plan.batches.flat().map((op) => op.id)
    expect(ids).toEqual(['TST-003', 'imp-r6', 'imp-r8'])
  })

  it('plans nothing when everything exists', () => {
    const plan = planImport({
      items: items(2),
      movements: moves(2),
      existingItemCodes: new Set(['TST-001', 'TST-002']),
      existingMovementIds: new Set(['imp-r5', 'imp-r6']),
      ctx,
    })
    expect(plan.batches).toEqual([])
  })

  it('builds a movement the schema and the rules accept', () => {
    const plan = planImport({
      items: items(2),
      movements: [movement(5, 'TST-002')],
      existingItemCodes: new Set(),
      existingMovementIds: new Set(),
      ctx,
    })
    const op = plan.batches.flat().find((o) => o.collection === 'movements')
    expect(op?.stamp).toBe('postedAt')
    const data = op?.data ?? {}
    expect(data).toMatchObject({
      createdBy: 'owner-uid',
      deviceId: 'device-1',
      priceMinor: 102,
      source: { kind: 'import', id: null, row: 5 },
    })
    // Only the keys the Firestore rules allow: no `id` or `row` leaks into the document.
    expect(Object.keys(data)).not.toContain('id')
    expect(Object.keys(data)).not.toContain('row')
    expect(movementSchema.safeParse({ ...data, postedAt: {} }).success).toBe(true)
  })

  it('stamps items with updatedAt', () => {
    const plan = planImport({
      items: items(1),
      movements: [],
      existingItemCodes: new Set(),
      existingMovementIds: new Set(),
      ctx,
    })
    expect(plan.batches[0]?.[0]).toMatchObject({ collection: 'items', stamp: 'updatedAt' })
  })

  it('rejects a movement for an unknown item', () => {
    expect(() =>
      planImport({
        items: items(1),
        movements: [movement(5, 'NOP-001')],
        existingItemCodes: new Set(),
        existingMovementIds: new Set(),
        ctx,
      }),
    ).toThrow(/Unknown item/)
  })
})

describe('runImport', () => {
  it('writes workbookImport last, with the total movement count', async () => {
    const { store, events, batches } = fakeStore()
    const marks: unknown[] = []
    const wrapped: ImportStore = {
      ...store,
      markImported: (m) => {
        marks.push(m)
        return store.markImported(m)
      },
    }
    const summary = await runImport({
      store: wrapped,
      items: items(97),
      movements: moves(500),
      ctx,
    })
    expect(events.at(-1)).toBe('mark')
    expect(events.filter((e) => e === 'mark')).toHaveLength(1)
    expect(batches.map((b) => b.length)).toEqual([97, 450, 50])
    expect(summary).toMatchObject({ batchCount: 3, itemsToWrite: 97, movementsToWrite: 500 })
    expect(marks).toEqual([{ movementCount: 500, fileName: 'book.xlsx' }])
  })

  it('reports progress per batch', async () => {
    const { store } = fakeStore()
    const seen: number[] = []
    await runImport({
      store,
      items: items(2),
      movements: moves(3),
      ctx,
      onProgress: (p) => seen.push(p.doneOps / p.totalOps),
    })
    expect(seen).toEqual([0, 2 / 5, 1])
  })

  it('refuses when already imported and writes nothing', async () => {
    const { store, events } = fakeStore({ mark: { importedAtMs: 1_700_000_000_000 } })
    const err: unknown = await runImport({
      store,
      items: items(1),
      movements: moves(1),
      ctx,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(AlreadyImportedError)
    expect((err as AlreadyImportedError).importedAtMs).toBe(1_700_000_000_000)
    expect(events).toEqual([])
  })

  it('resumes: skips what exists and still marks the import', async () => {
    const { store, batches, events } = fakeStore({
      existingItems: ['TST-001'],
      existingMovements: ['imp-r5', 'imp-r6'],
    })
    await runImport({ store, items: items(2), movements: moves(4), ctx })
    expect(batches.flat().map((o) => o.id)).toEqual(['TST-002', 'imp-r7', 'imp-r8'])
    expect(events.at(-1)).toBe('mark')
  })

  it('marks the import even when a previous run already wrote everything', async () => {
    const { store, events } = fakeStore({
      existingItems: ['TST-001'],
      existingMovements: ['imp-r5'],
    })
    await runImport({ store, items: items(1), movements: moves(1), ctx })
    expect(events).toEqual(['mark'])
  })

  it('leaves workbookImport unset when a batch fails midway', async () => {
    const { store, events, batches } = fakeStore({ failOnCommit: 2 })
    const err: unknown = await runImport({
      store,
      items: items(97),
      movements: moves(900),
      ctx,
    }).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(ImportWriteError)
    expect((err as ImportWriteError).message).toMatch(/[؀-ۿ]/)
    expect(batches).toHaveLength(1)
    expect(events).not.toContain('mark')
  })

  it('wraps a failed mark write and a failed read', async () => {
    const markFail = fakeStore({ failOnMark: true })
    await expect(
      runImport({ store: markFail.store, items: items(1), movements: moves(1), ctx }),
    ).rejects.toBeInstanceOf(ImportWriteError)

    const { store } = fakeStore()
    const offline: ImportStore = {
      ...store,
      existingItemCodes: () => Promise.reject(new Error('unavailable')),
    }
    await expect(
      runImport({ store: offline, items: items(1), movements: moves(1), ctx }),
    ).rejects.toBeInstanceOf(ImportWriteError)
  })
})

describe('getDeviceId', () => {
  function memoryStorage(): Storage {
    const map = new Map<string, string>()
    return {
      get length() {
        return map.size
      },
      clear: () => map.clear(),
      getItem: (k) => map.get(k) ?? null,
      key: (i) => [...map.keys()][i] ?? null,
      removeItem: (k) => void map.delete(k),
      setItem: (k, v) => void map.set(k, v),
    }
  }

  it('creates an id once and reuses it', () => {
    const storage = memoryStorage()
    let n = 0
    const uuid = () => `id-${(n += 1)}`
    expect(getDeviceId(storage, uuid)).toBe('id-1')
    expect(getDeviceId(storage, uuid)).toBe('id-1')
  })

  it('still returns an id when storage throws', () => {
    const broken = {
      getItem: () => {
        throw new Error('blocked')
      },
      setItem: () => {
        throw new Error('blocked')
      },
    } as unknown as Storage
    expect(getDeviceId(broken, () => 'mem-1').length).toBeGreaterThan(0)
  })

  it('works with no storage at all', () => {
    expect(getDeviceId(null, () => 'mem-2').length).toBeGreaterThan(0)
  })
})
