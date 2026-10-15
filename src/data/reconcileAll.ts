import type { ReattachResult } from './receiptPost'

/** One kind of waiting document (receipt posts, issue cancels, ...) re-checked against the server. */
export type ReconcileRun = () => Promise<readonly ReattachResult[]>

export interface ReconcileOptions {
  /** Where `online` events come from (the window). */
  readonly target: Pick<EventTarget, 'addEventListener' | 'removeEventListener'>
  /** Told after every pass how many entries could still not be checked (0: all settled). */
  readonly report: (unverified: number) => void
  /** How long to wait before asking again while something is unchecked. */
  readonly retryMs?: number
}

const DEFAULT_RETRY_MS = 30_000

/**
 * Re-checks the documents that were waiting when the app started. One pass at once; while any
 * could not be checked (the server was unreachable, so the ack may or may not have landed), it
 * passes again when the browser says it is online and every `retryMs` anyway, because `online`
 * does not fire when the device thinks it has a network that does not reach the server.
 * Returns a function that stops it.
 */
export function startReconciling(
  runs: readonly ReconcileRun[],
  { target, report, retryMs = DEFAULT_RETRY_MS }: ReconcileOptions,
): () => void {
  let stopped = false
  let running = false
  let again = false
  let unverified = 0
  let timer: ReturnType<typeof setTimeout> | null = null

  const clearTimer = (): void => {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  const pass = async (): Promise<void> => {
    if (running) {
      again = true
      return
    }
    running = true
    clearTimer()
    try {
      do {
        again = false
        const results = await Promise.all(
          runs.map((run) => run().catch((): readonly ReattachResult[] => [])),
        )
        unverified = results.flat().filter((r) => r === 'pending').length
        if (!stopped) report(unverified)
      } while (again && !stopped)
    } finally {
      running = false
    }
    if (!stopped && unverified > 0) timer = setTimeout(() => void pass(), retryMs)
  }

  const onOnline = (): void => {
    if (running) again = true
    else if (unverified > 0) void pass()
  }

  target.addEventListener('online', onOnline)
  void pass()

  return () => {
    stopped = true
    clearTimer()
    target.removeEventListener('online', onOnline)
  }
}
