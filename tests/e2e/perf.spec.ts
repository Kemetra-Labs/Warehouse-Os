import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type BrowserContext, type Locator, type Page } from '@playwright/test'
import { ensureOwnerAccount, seedItems, signInAsOwner } from './emulatorApi'

/**
 * Offline cold start (T094): after the app is installed, opening it with no network must show
 * a screen the user can act on within 2 s (plan.md performance goal).
 *
 * How it is measured
 *  - It runs against the PRODUCTION build served by `vite preview` (port 4173), not the dev
 *    server: the dev server has no service worker and does not bundle. Run `npm run build`
 *    first; without `dist/index.html` the test is skipped (so `npm run test:e2e` still passes
 *    on a clean checkout). The spec starts and stops `vite preview` itself.
 *  - "Installed" means the service worker has installed, activated and taken control of the
 *    page: load once online, wait for `navigator.serviceWorker.ready`, reload until
 *    `navigator.serviceWorker.controller` is set (the worker is registered with
 *    registerType 'prompt', so the first load is not controlled).
 *  - Then the whole context goes offline and a NEW tab opens the app (no JS state, no
 *    in-memory cache; the HTTP and precache of the service worker are all it has).
 *  - The clock starts just before `page.goto` and stops when the app shell is interactive:
 *    on the sign-in screen the level-1 heading is visible and its button (if any) enabled; on the
 *    home screen the "استلام طلبية جديدة" link and the stock tally are visible. This wall time
 *    includes Playwright's own round trips, so it is an upper bound on what the user sees.
 *  - Three runs, the median is asserted. Each run is measured twice over: at full speed and
 *    with the CPU throttled 4x through the DevTools protocol, which stands in for a mid-range
 *    Android phone. The assertion is on the throttled median; both are printed.
 *  - The trace of the throttled run is saved to `test-results/perf-offline-cold-start-<variant>.zip`
 *    (open it with `npx playwright show-trace`).
 *
 * Two tests, one per way the app starts:
 *  1. Signed out: the sign-in screen. Needs no emulator, so it runs anywhere.
 *  2. Signed in (E2E_EMULATORS=1): sign in against the Auth emulator on the preview origin
 *     (the production build carries the emulator config from .env.local), let the home screen
 *     fill from Firestore so its IndexedDB cache has data, then cold start offline and time it
 *     to the home screen with its stock tally. This is the start the storekeeper really has, and
 *     the slower one: Firebase Auth and the Firestore cache both open before the tally shows.
 */
const PORT = 4173
const ORIGIN = `http://localhost:${PORT}`
const BUDGET_MS = 2_000
const CPU_SLOWDOWN = 4
const RUNS = 3
const DIST = resolve(import.meta.dirname, '..', '..', 'dist')

let server: ChildProcess | null = null

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    try {
      if ((await fetch(ORIGIN)).ok) return
    } catch {
      // Not listening yet.
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`vite preview did not start on ${ORIGIN}`)
}

async function throttleCpu(page: Page, rate: number): Promise<void> {
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Emulation.setCPUThrottlingRate', { rate })
}

/** Time from `goto` to the moment `ready(page)` is true, in ms. */
async function coldStart(
  context: BrowserContext,
  rate: number,
  ready: (page: Page) => Promise<void>,
): Promise<number> {
  const page = await context.newPage()
  await throttleCpu(page, rate)
  const start = performance.now()
  await page.goto(ORIGIN, { waitUntil: 'commit' })
  await ready(page)
  const elapsed = performance.now() - start
  // The number only means something if the page really had no network and the worker served it.
  // (navigator.onLine stays true under Playwright's offline mode, so probe the network itself.)
  const probe = await page.evaluate(() =>
    fetch(`/offline-probe-${Date.now()}`, { cache: 'no-store' }).then(
      () => 'reached the network',
      () => 'no network',
    ),
  )
  expect(probe).toBe('no network')
  expect(await page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true)
  await page.close()
  return elapsed
}

const median = (xs: readonly number[]): number =>
  [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? Number.NaN

/** Waits until the worker has installed and controls the page (it needs reloads to take over). */
async function waitForWorkerControl(page: Page): Promise<void> {
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true))
  await expect
    .poll(
      async () => {
        await page.reload()
        return page.evaluate(() => navigator.serviceWorker.controller !== null)
      },
      { timeout: 30_000, intervals: [500] },
    )
    .toBe(true)
}

/** Offline, three runs at full speed then three with the CPU 4x slower (traced and asserted). */
async function measureOffline(
  context: BrowserContext,
  label: string,
  ready: (page: Page) => Promise<void>,
): Promise<void> {
  await context.setOffline(true)
  const fast: number[] = []
  for (let i = 0; i < RUNS; i += 1) fast.push(await coldStart(context, 1, ready))

  await context.tracing.start({ screenshots: true, snapshots: true })
  const slow: number[] = []
  for (let i = 0; i < RUNS; i += 1) slow.push(await coldStart(context, CPU_SLOWDOWN, ready))
  await context.tracing.stop({ path: `test-results/perf-offline-cold-start-${label}.zip` })

  const round = (xs: readonly number[]): string => xs.map((x) => Math.round(x)).join(', ')
  console.log(
    `offline cold start, ${label} (ms): full speed [${round(fast)}] median ${Math.round(median(fast))}; ` +
      `CPU ${CPU_SLOWDOWN}x slower [${round(slow)}] median ${Math.round(median(slow))}`,
  )
  expect(median(slow)).toBeLessThan(BUDGET_MS)
}

const signInScreen = async (page: Page): Promise<void> => {
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
  const button = page.getByRole('button').first()
  if ((await button.count()) > 0) await expect(button).toBeEnabled()
}

const homeWithTally = async (page: Page): Promise<void> => {
  await expect(page.getByRole('link', { name: 'استلام طلبية جديدة' })).toBeVisible({
    timeout: 10_000,
  })
  const tally: Locator = page.getByLabel('ملخص المخزن')
  await expect(tally).toBeVisible()
}

test.describe('offline cold start, production build', () => {
  // One worker owns the one `vite preview` on 4173. In parallel, a worker whose test is skipped
  // would run afterAll and kill the server under the test that is still measuring.
  test.describe.configure({ mode: 'serial' })
  test.skip(!existsSync(resolve(DIST, 'index.html')), 'run `npm run build` first (needs dist/)')
  test.use({ baseURL: ORIGIN })

  test.beforeAll(async () => {
    server = spawn(
      process.execPath,
      [
        resolve(import.meta.dirname, '..', '..', 'node_modules', 'vite', 'bin', 'vite.js'),
        'preview',
        '--port',
        String(PORT),
        '--strictPort',
      ],
      { stdio: 'ignore' },
    )
    await waitForServer()
  })

  test.afterAll(() => {
    server?.kill()
    server = null
  })

  test('signed out: the sign-in screen is interactive in under 2 s with no network', async ({
    context,
    page,
  }) => {
    test.setTimeout(120_000)
    await page.goto(ORIGIN)
    await waitForWorkerControl(page)
    await page.close()
    await measureOffline(context, 'signed-out', signInScreen)
  })

  test('signed in: the home screen and its tally show in under 2 s with no network', async ({
    context,
    page,
    request,
  }) => {
    test.skip(
      process.env.E2E_EMULATORS !== '1',
      'needs the Firebase emulators (see receive.spec.ts)',
    )
    test.setTimeout(180_000)
    await ensureOwnerAccount(request, 'test-owner')
    await seedItems(
      request,
      Array.from({ length: 12 }, (_, i) => ({
        code: `PRF-${String(i + 1).padStart(2, '0')}`,
        page: 9_000 + i,
        nameAr: `صنف أداء ${i + 1}`,
        priceMinor: 1_000 + i,
      })),
    )
    await signInAsOwner(page, 'test-owner')
    await homeWithTally(page)
    await waitForWorkerControl(page)
    await homeWithTally(page)
    await page.close()
    await measureOffline(context, 'signed-in', homeWithTally)
  })
})
