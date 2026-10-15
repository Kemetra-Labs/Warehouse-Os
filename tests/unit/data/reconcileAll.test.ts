import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { startReconciling, type ReconcileRun } from '../../../src/data/reconcileAll'
import type { ReattachResult } from '../../../src/data/receiptPost'

const flush = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve()
}

function scripted(...outcomes: ReattachResult[][]): { run: ReconcileRun; calls: () => number } {
  let n = 0
  return {
    run: () => {
      const out = outcomes[Math.min(n, outcomes.length - 1)] ?? []
      n += 1
      return Promise.resolve(out)
    },
    calls: () => n,
  }
}

describe('startReconciling', () => {
  let target: EventTarget
  beforeEach(() => {
    vi.useFakeTimers()
    target = new EventTarget()
  })
  afterEach(() => vi.useRealTimers())

  it('checks once at start and reports how many could not be checked', async () => {
    const report = vi.fn()
    const a = scripted(['cleared', 'pending'])
    const b = scripted(['pending'])
    startReconciling([a.run, b.run], { target, report })
    await flush()
    expect(report).toHaveBeenLastCalledWith(2)
    expect(a.calls()).toBe(1)
  })

  it('checks again when the browser comes online, and settles', async () => {
    const report = vi.fn()
    const a = scripted(['pending'], ['cleared'])
    startReconciling([a.run], { target, report })
    await flush()
    expect(report).toHaveBeenLastCalledWith(1)
    target.dispatchEvent(new Event('online'))
    await flush()
    expect(a.calls()).toBe(2)
    expect(report).toHaveBeenLastCalledWith(0)
  })

  it('keeps asking on a timer while something is unchecked, then stops asking', async () => {
    const report = vi.fn()
    const a = scripted(['pending'], ['pending'], ['failed'])
    startReconciling([a.run], { target, report, retryMs: 1000 })
    await flush()
    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(a.calls()).toBe(3)
    expect(report).toHaveBeenLastCalledWith(0)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(a.calls()).toBe(3) // everything settled: no more asking
  })

  it('does not ask again on online when everything was already checked', async () => {
    const a = scripted(['cleared'])
    startReconciling([a.run], { target, report: vi.fn() })
    await flush()
    target.dispatchEvent(new Event('online'))
    await flush()
    expect(a.calls()).toBe(1)
  })

  it('runs a pass again when online fires during a pass', async () => {
    let release: (v: readonly ReattachResult[]) => void = () => undefined
    let n = 0
    const slow: ReconcileRun = () => {
      n += 1
      return n === 1
        ? new Promise((r) => {
            release = r
          })
        : Promise.resolve(['cleared'])
    }
    const report = vi.fn()
    startReconciling([slow], { target, report })
    await flush()
    target.dispatchEvent(new Event('online')) // the network came back mid-pass
    release(['pending'])
    await flush()
    expect(n).toBe(2)
    expect(report).toHaveBeenLastCalledWith(0)
  })

  it('treats a run that throws as nothing to check, and keeps the others going', async () => {
    const report = vi.fn()
    const a = scripted(['pending'])
    startReconciling([() => Promise.reject(new Error('indexeddb blocked')), a.run], {
      target,
      report,
    })
    await flush()
    expect(report).toHaveBeenLastCalledWith(1)
  })

  it('stops for good when asked: no timer, no online handler, no report', async () => {
    const report = vi.fn()
    const a = scripted(['pending'])
    const stop = startReconciling([a.run], { target, report, retryMs: 1000 })
    await flush()
    stop()
    report.mockClear()
    target.dispatchEvent(new Event('online'))
    await vi.advanceTimersByTimeAsync(5000)
    expect(a.calls()).toBe(1)
    expect(report).not.toHaveBeenCalled()
  })
})
