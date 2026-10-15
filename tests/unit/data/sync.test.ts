import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createSyncStore, deriveSyncState, syncLabel, watchWrite } from '../../../src/data/sync'

describe('deriveSyncState', () => {
  it('is synced with nothing pending or failed', () => {
    expect(deriveSyncState(0, 0)).toEqual({ kind: 'synced', count: 0 })
  })
  it('is pending with N when writes wait', () => {
    expect(deriveSyncState(3, 0)).toEqual({ kind: 'pending', count: 3 })
  })
  it('failed wins over pending', () => {
    expect(deriveSyncState(3, 2)).toEqual({ kind: 'failed', count: 2 })
  })
})

describe('syncLabel', () => {
  it('uses the Arabic labels', () => {
    expect(syncLabel({ kind: 'synced', count: 0 })).toBe('متزامن')
    expect(syncLabel({ kind: 'pending', count: 3 })).toBe('3 مستنية النت')
    expect(syncLabel({ kind: 'failed', count: 1 })).toBe('فشل الإرسال')
  })
})

describe('createSyncStore', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sums pending counts across sources immediately', () => {
    const s = createSyncStore({ debounceMs: 400 })
    s.reportPending('items', 1)
    s.reportPending('movements', 2)
    expect(s.getState()).toEqual({ kind: 'pending', count: 3 })
  })

  it('debounces the flip back to synced', () => {
    const s = createSyncStore({ debounceMs: 400 })
    s.reportPending('movements', 2)
    s.reportPending('movements', 0)
    expect(s.getState().kind).toBe('pending')
    vi.advanceTimersByTime(399)
    expect(s.getState().kind).toBe('pending')
    vi.advanceTimersByTime(2)
    expect(s.getState().kind).toBe('synced')
  })

  it('cancels the synced flip when a write arrives meanwhile', () => {
    const s = createSyncStore({ debounceMs: 400 })
    s.reportPending('movements', 1)
    s.reportPending('movements', 0)
    vi.advanceTimersByTime(200)
    s.reportPending('movements', 1)
    vi.advanceTimersByTime(1000)
    expect(s.getState()).toEqual({ kind: 'pending', count: 1 })
  })

  it('shows failed immediately and keeps a stable snapshot when nothing changed', () => {
    const s = createSyncStore({ debounceMs: 400 })
    s.reportFailed(1)
    const a = s.getState()
    expect(a).toEqual({ kind: 'failed', count: 1 })
    s.reportFailed(1)
    expect(s.getState()).toBe(a)
  })

  it('notifies subscribers on change only and supports unsubscribe', () => {
    const s = createSyncStore({ debounceMs: 0 })
    const fn = vi.fn()
    const off = s.subscribe(fn)
    s.reportPending('a', 1)
    s.reportPending('a', 1)
    expect(fn).toHaveBeenCalledTimes(1)
    off()
    s.reportPending('a', 2)
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe('refused writes outside the outbox', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('turn the pill to failed until dismissed, whatever else is synced', () => {
    const s = createSyncStore({ debounceMs: 0 })
    expect(deriveSyncState(0, 0, 2)).toEqual({ kind: 'failed', count: 2 })
    s.reportRejected()
    expect(s.getState()).toEqual({ kind: 'failed', count: 1 })
    s.reportPending('items', 0)
    expect(s.getState().kind).toBe('failed')
    expect(s.rejectedCount()).toBe(1)
    s.clearRejected()
    vi.runAllTimers()
    expect(s.rejectedCount()).toBe(0)
    expect(s.getState().kind).toBe('synced')
  })

  it('watchWrite reports a rejected write, passes a good one through, and keeps the rejection', async () => {
    const s = createSyncStore({ debounceMs: 0 })
    await expect(watchWrite(Promise.resolve(7), s)).resolves.toBe(7)
    expect(s.rejectedCount()).toBe(0)
    await expect(watchWrite(Promise.reject(new Error('denied')), s)).rejects.toThrow('denied')
    expect(s.rejectedCount()).toBe(1)
  })
})
