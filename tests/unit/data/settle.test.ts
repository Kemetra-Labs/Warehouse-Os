import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { settleQuickly } from '../../../src/data/settle'

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

describe('settleQuickly', () => {
  it('says saved when the write is acknowledged within the wait', async () => {
    const outcome = settleQuickly(Promise.resolve())
    await vi.advanceTimersByTimeAsync(0)
    await expect(outcome).resolves.toBe('saved')
  })

  it('says failed when the write is rejected within the wait', async () => {
    const outcome = settleQuickly(Promise.reject(new Error('permission-denied')))
    await vi.advanceTimersByTimeAsync(0)
    await expect(outcome).resolves.toBe('failed')
  })

  it('says pending when the write is still queued after the wait (offline)', async () => {
    const outcome = settleQuickly(new Promise(() => undefined), 500)
    await vi.advanceTimersByTimeAsync(500)
    await expect(outcome).resolves.toBe('pending')
  })

  it('keeps the first outcome when the write settles after the wait', async () => {
    let finish: () => void = () => undefined
    const outcome = settleQuickly(new Promise<void>((r) => (finish = r)), 100)
    await vi.advanceTimersByTimeAsync(100)
    finish()
    await expect(outcome).resolves.toBe('pending')
  })
})
