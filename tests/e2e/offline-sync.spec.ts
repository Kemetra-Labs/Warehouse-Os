import {
  devices,
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Locator,
  type Page,
} from '@playwright/test'
import {
  ensureOwnerAccount,
  findDoc,
  seedItems,
  seedStock,
  signInAsOwner,
  stringOf,
  type SeedItem,
  type SeedStock,
} from './emulatorApi'
import {
  approveIssue,
  backHome,
  installFakeDetector,
  pill,
  receiveOneLine,
  startIssue,
  warmLazyScreens,
} from './flows'

/**
 * Working offline and syncing (US7), end to end, with two browser contexts that stand for the
 * phone (A) and the laptop (B). Both sign in as the same owner against the Firebase emulators
 * (see the comment at the top of receive.spec.ts for the setup):
 *   `E2E_EMULATORS=1 npx playwright test tests/e2e/offline-sync.spec.ts`
 *
 * "Offline" is `context.setOffline(true)`. It blocks every request of the context, the dev server
 * included, so each context first walks through the lazy screens while online (their code is then
 * cached) and, while offline, only moves with in-app links: no `goto`, no reload.
 *
 * 1. A receives and issues while offline, the pill counts what waits, reconnecting empties it,
 *    and B shows the same balances (each item that A changed is listed on B's home, highlighted,
 *    until B opens it).
 * 2. A and B both issue the same item offline, each within the balance it knew. Together they
 *    take it below zero, so after both reconnect the item is flagged on both devices (FR-072),
 *    and the two batches that both took the same local number are called out (R10 / T067).
 *
 * Item codes, names and categories are unique to the run, so earlier runs against the same
 * emulator never change a balance this test reads.
 */
const OWNER_UID = 'test-owner'
const BASE_URL = 'http://localhost:5173'
const SYNC_TIMEOUT = 60_000

const PREFIX = Array.from({ length: 3 }, (_, i) =>
  String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26)),
).join('')
const RUN = String(Date.now())
const code = (n: number): string => `${PREFIX}-5${n}`
/** Typed page numbers are at most four digits and must be unique to the run too. */
const NAME_RECEIVED = `صنف مزامنة استلام ${RUN}`
const NAME_ISSUED = `صنف مزامنة صرف ${RUN}`
const NAME_NEGATIVE = `صنف مزامنة سالب ${RUN}`
const PAGE_BASE = 1_000 + (Math.floor(Date.now() / 1000) % 8_000)

const ITEMS: readonly SeedItem[] = [
  {
    code: code(1),
    page: PAGE_BASE + 1,
    nameAr: NAME_RECEIVED,
    priceMinor: 1_000,
    category: `م1 ${RUN}`,
  },
  {
    code: code(2),
    page: PAGE_BASE + 2,
    nameAr: NAME_ISSUED,
    priceMinor: 2_000,
    category: `م2 ${RUN}`,
  },
  {
    code: code(3),
    page: PAGE_BASE + 3,
    nameAr: NAME_NEGATIVE,
    priceMinor: 3_000,
    category: `م3 ${RUN}`,
  },
]
const stock = (n: number, qty: number): SeedStock => ({
  id: `sync-${RUN}-${n}`,
  itemCode: code(n),
  qty,
  batchNo: `S${n}`,
  expiry: '2029-01',
  priceMinor: ITEMS[n - 1]?.priceMinor ?? 0,
})

interface Device {
  readonly context: BrowserContext
  readonly page: Page
}

/** A phone-sized browser context signed in as the owner, with its lazy screens cached. */
async function openDevice(browser: Browser): Promise<Device> {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    baseURL: BASE_URL,
    permissions: ['camera'],
  })
  const page = await context.newPage()
  await installFakeDetector(page)
  await signInAsOwner(page, OWNER_UID)
  await warmLazyScreens(page)
  return { context, page }
}

const balanceOf = (page: Page, itemName: string): Locator =>
  page.getByRole('button', { name: new RegExp(itemName) })

async function headingNumber(page: Page): Promise<number> {
  const text = (await page.getByRole('heading', { level: 1 }).textContent()) ?? ''
  return Number(/\d+/.exec(text)?.[0])
}

test.describe('offline and sync across two devices', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  test.beforeAll(async ({ request }) => {
    await ensureOwnerAccount(request, OWNER_UID)
    await seedItems(request, ITEMS)
    await seedStock(request, [stock(2, 20), stock(3, 5)])
  })

  test('offline receive and issue wait, then sync, and the other device agrees', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000)
    const phone = await openDevice(browser)
    const laptop = await openDevice(browser)
    try {
      const rep = `مندوب مزامنة ${RUN}`
      const deliveryNo = `SYNC-${RUN}`

      // Offline on the phone: receive 6 of item 1, issue 4 of item 2 (20 in stock).
      await phone.context.setOffline(true)
      await receiveOneLine(phone.page, {
        deliveryNo,
        pageNo: PAGE_BASE + 1,
        itemName: NAME_RECEIVED,
        qty: 6,
      })
      await backHome(phone.page)
      await startIssue(phone.page, rep, code(2), 4)
      await approveIssue(phone.page)
      await expect(pill(phone.page, /^\d+ مستنية النت$/)).toBeVisible()

      // Nothing reached the server while offline.
      expect(await findDoc(request, 'receipts', 'deliveryNo', deliveryNo)).toBeNull()
      expect(await findDoc(request, 'issueBatches', 'rep', rep)).toBeNull()

      // Back online: it goes by itself, and the pill ends at "متزامن".
      await phone.context.setOffline(false)
      await expect(pill(phone.page, 'متزامن')).toBeVisible({ timeout: SYNC_TIMEOUT })
      await expect
        .poll(
          async () =>
            stringOf((await findDoc(request, 'receipts', 'deliveryNo', deliveryNo))?.fields.status),
          { timeout: SYNC_TIMEOUT },
        )
        .toBe('posted')
      await expect
        .poll(
          async () => stringOf((await findDoc(request, 'issueBatches', 'rep', rep))?.fields.status),
          { timeout: SYNC_TIMEOUT },
        )
        .toBe('posted')

      // The laptop, which never went offline, lists both items with the same balances.
      const received = balanceOf(laptop.page, NAME_RECEIVED)
      const issued = balanceOf(laptop.page, NAME_ISSUED)
      await expect(received.getByLabel('الرصيد 6')).toBeVisible({ timeout: SYNC_TIMEOUT })
      await expect(received).toHaveAttribute('data-changed', 'true')
      await expect(issued.getByLabel('الرصيد 16')).toBeVisible()
      await expect(pill(laptop.page, 'متزامن')).toBeVisible()

      // Opening an item clears its highlight, so it leaves the list; the other one stays lit.
      await received.click()
      await expect(received).toHaveCount(0)
      await expect(issued).toHaveAttribute('data-changed', 'true')

      // The phone's own work never lights up on the phone.
      await backHome(phone.page)
      await expect(phone.page.locator('[data-changed="true"]')).toHaveCount(0)
    } finally {
      await phone.context.close()
      await laptop.context.close()
    }
  })

  test('two devices issue the same item offline: it goes negative and is flagged', async ({
    browser,
    request,
  }) => {
    test.setTimeout(240_000)
    const a = await openDevice(browser)
    const b = await openDevice(browser)
    try {
      const repA = `مندوب ألف ${RUN}`
      const repB = `مندوب باء ${RUN}`
      await a.context.setOffline(true)
      await b.context.setOffline(true)

      // 5 in stock; each device issues 4 within what it knows, so neither needs a reason.
      await startIssue(a.page, repA, code(3), 4)
      await approveIssue(a.page)
      const numberA = await headingNumber(a.page)
      await startIssue(b.page, repB, code(3), 4)
      await approveIssue(b.page)
      const numberB = await headingNumber(b.page)
      expect(numberA).toBe(numberB) // both took the next local number (R10)

      await a.context.setOffline(false)
      await expect(pill(a.page, 'متزامن')).toBeVisible({ timeout: SYNC_TIMEOUT })
      await b.context.setOffline(false)
      await expect(pill(b.page, 'متزامن')).toBeVisible({ timeout: SYNC_TIMEOUT })
      for (const rep of [repA, repB]) {
        await expect
          .poll(
            async () =>
              stringOf((await findDoc(request, 'issueBatches', 'rep', rep))?.fields.status),
            { timeout: SYNC_TIMEOUT },
          )
          .toBe('posted')
      }

      // 5 - 4 - 4 = -3 on both devices: flagged as a pending settlement and highlighted.
      for (const device of [a, b]) {
        await backHome(device.page)
        const row = balanceOf(device.page, NAME_NEGATIVE)
        await expect(row).toHaveAttribute('data-negative', 'true', { timeout: SYNC_TIMEOUT })
        await expect(row.getByLabel('الرصيد -3')).toBeVisible()
        await expect(row).toContainText('تسوية معلّقة')
        await expect(row).toHaveAttribute('data-changed', 'true')
        // T067: the two batches with the same number are called out, never renumbered.
        const warning = device.page.getByTestId('duplicate-numbers')
        await expect(warning).toContainText(`رقم ${numberA}:`, { timeout: SYNC_TIMEOUT })
      }

      // Opening it on A clears A's highlight only; the flag stays while the balance is negative.
      const onA = balanceOf(a.page, NAME_NEGATIVE)
      await onA.click()
      await expect(onA).toHaveAttribute('data-changed', 'false')
      await expect(onA).toHaveAttribute('data-negative', 'true')
      await expect(balanceOf(b.page, NAME_NEGATIVE)).toHaveAttribute('data-changed', 'true')
    } finally {
      await a.context.close()
      await b.context.close()
    }
  })
})
