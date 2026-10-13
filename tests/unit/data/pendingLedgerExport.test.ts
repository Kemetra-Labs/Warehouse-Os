import { describe, expect, it } from 'vitest'
import {
  clearPendingLedger,
  loadPendingLedger,
  savePendingLedger,
} from '../../../src/data/pendingLedgerExport'

function memoryStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

const blocked: Storage = {
  length: 0,
  clear: () => undefined,
  key: () => null,
  getItem: () => {
    throw new Error('blocked')
  },
  setItem: () => {
    throw new Error('blocked')
  },
  removeItem: () => {
    throw new Error('blocked')
  },
}

describe('the downloaded ledger file survives a reload until "تم اللصق"', () => {
  it('keeps the ids of the downloaded file', () => {
    const storage = memoryStorage()
    savePendingLedger(['m1', 'm2'], storage)
    expect(loadPendingLedger([], storage)).toEqual(['m1', 'm2'])
  })

  it('is empty after the paste is confirmed', () => {
    const storage = memoryStorage()
    savePendingLedger(['m1'], storage)
    clearPendingLedger(storage)
    expect(loadPendingLedger([], storage)).toBeNull()
  })

  it('drops a file whose rows were all confirmed already (on another device)', () => {
    const storage = memoryStorage()
    savePendingLedger(['m1', 'm2'], storage)
    expect(loadPendingLedger(['m1', 'm2', 'm3'], storage)).toBeNull()
  })

  it('keeps a file that still has rows nobody confirmed', () => {
    const storage = memoryStorage()
    savePendingLedger(['m1', 'm2'], storage)
    expect(loadPendingLedger(['m1'], storage)).toEqual(['m1', 'm2'])
  })

  it('ignores corrupt data and blocked storage', () => {
    const storage = memoryStorage()
    storage.setItem('warehouse.ledgerDownload.v1', '{not json')
    expect(loadPendingLedger([], storage)).toBeNull()
    expect(() => savePendingLedger(['m1'], blocked)).not.toThrow()
    expect(loadPendingLedger([], blocked)).toBeNull()
    expect(() => clearPendingLedger(blocked)).not.toThrow()
  })

  it('does not keep an empty file', () => {
    const storage = memoryStorage()
    savePendingLedger([], storage)
    expect(loadPendingLedger([], storage)).toBeNull()
  })
})
