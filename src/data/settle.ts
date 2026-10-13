export type Settled = 'saved' | 'failed' | 'pending'

const DEFAULT_WAIT_MS = 800

/**
 * Waits a moment for a Firestore write the screen does not await (offline-first). Online the
 * server answers within the wait, so a rejection (the rules said no) can still be shown. Offline
 * the write stays queued on the device: `pending` means "saved here, waiting for the network".
 */
export function settleQuickly(
  write: Promise<unknown>,
  waitMs: number = DEFAULT_WAIT_MS,
): Promise<Settled> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('pending'), waitMs)
    const done = (outcome: Settled) => (): void => {
      clearTimeout(timer)
      resolve(outcome)
    }
    write.then(done('saved'), done('failed'))
  })
}
