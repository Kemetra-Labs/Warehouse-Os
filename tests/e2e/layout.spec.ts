import { expect, test, type Page } from '@playwright/test'
import {
  ensureOwnerAccount,
  seedItems,
  seedStock,
  signInAsOwner,
  type SeedItem,
  type SeedStock,
} from './emulatorApi'
import { addRequest, field, fillBatchHeader, joinOpenLine, receiveOneLine } from './flows'

/**
 * No horizontal overflow at phone width (T093), end to end. Every main route, and the screens
 * that only exist mid-flow (a receipt being counted, a sealed receipt, an issue batch with a
 * short item, the substitute sheet), is opened at the Pixel 7 size (412 px) with items whose
 * names are long and contain unbreakable tokens (sizes like `2.5x30x120`, long codes).
 *
 * Each screen must pass two checks:
 *   1. `document.documentElement.scrollWidth <= clientWidth` (the page does not scroll sideways);
 *   2. no element's box reaches past either edge of the viewport. In RTL the overflow runs off
 *      the left edge, so this check also names the element that caused it.
 * A last test clicks the bottom navigation on the sealed receipt page: a click that lands on
 * something else would mean content is stacked over the bar.
 *
 * Needs the Firebase emulators (see the comment at the top of receive.spec.ts):
 *   E2E_EMULATORS=1 npx playwright test tests/e2e/layout.spec.ts
 */
const OWNER_UID = 'test-owner'
const PHONE_WIDTH = 412

const PREFIX = Array.from({ length: 3 }, (_, i) =>
  String.fromCharCode(65 + (Math.floor(Date.now() / 26 ** i) % 26)),
).join('')
const RUN = String(Date.now())
const code = (n: number): string => `${PREFIX}-7${n}`
/** Typed page numbers are at most four digits and must be unique to the run. */
const PAGE_BASE = 1_000 + (Math.floor(Date.now() / 1000) % 8_000)

const LONG_TOKEN = 'DHS/DCS-LCP-4.5-VA-2.5x30x120-TITANIUM-LOCKING'
/** No hyphen, slash or space: the browser has no place to break it. */
const UNBREAKABLE = 'DHS_DCS_LCP_4.5_VA_2.5x30x120_TITANIUM_LOCKING_PLATE'
const NAME_RECEIVE = `شريحة تثبيت عظم الفخذ الأمامية الجانبية للكبار ${UNBREAKABLE} ${RUN}`
const NAME_SHORT = `مسمار نخاعي ديناميكي طويل للغاية مع براغي التثبيت ${LONG_TOKEN}-S ${RUN}`
const NAME_SUBSTITUTE = `مسمار نخاعي ديناميكي بديل طويل للغاية ${LONG_TOKEN}-B ${RUN}`
const CATEGORY = `فئة بتسمية طويلة جدا للاختبار الأخير ${RUN}`
const LONG_BATCH = `LOT-${RUN}-AAAAAAAAAAAAAAAAAAAA`

const ITEMS: readonly SeedItem[] = [
  { code: code(1), page: PAGE_BASE + 1, nameAr: NAME_RECEIVE, priceMinor: 289_570 },
  {
    code: code(2),
    page: PAGE_BASE + 2,
    nameAr: NAME_SHORT,
    priceMinor: 289_570,
    category: CATEGORY,
  },
  {
    code: code(3),
    page: PAGE_BASE + 3,
    nameAr: NAME_SUBSTITUTE,
    priceMinor: 289_570,
    category: CATEGORY,
  },
]
const STOCK: readonly SeedStock[] = [
  {
    id: `e2e-${RUN}-1`,
    itemCode: code(2),
    qty: 4,
    batchNo: LONG_BATCH,
    expiry: '2029-01',
    priceMinor: 289_570,
  },
  {
    id: `e2e-${RUN}-2`,
    itemCode: code(3),
    qty: 9,
    batchNo: LONG_BATCH,
    expiry: '2029-01',
    priceMinor: 289_570,
  },
]

interface Offender {
  readonly tag: string
  readonly cls: string
  readonly text: string
  readonly left: number
  readonly right: number
}

interface Measure {
  readonly scrollWidth: number
  readonly clientWidth: number
  readonly offenders: readonly Offender[]
}

/** The page width, and every visible element whose box leaves the viewport sideways. */
async function measure(page: Page): Promise<Measure> {
  return page.evaluate(() => {
    const doc = document.documentElement
    // Back to the start edge (the right one in RTL), so the boxes below are not shifted by a scroll.
    window.scrollTo(0, window.scrollY)
    const width = doc.clientWidth
    const out = new Set<Element>()
    for (const el of document.body.querySelectorAll('*')) {
      const box = el.getBoundingClientRect()
      if (box.width === 0 || box.height === 0) continue
      // The screen-reader-only captions are clipped to 1 px on purpose.
      if (getComputedStyle(el).clipPath !== 'none') continue
      if (box.left < -1 || box.right > width + 1) out.add(el)
    }
    // Report the innermost elements only: every ancestor of a culprit overflows with it.
    const offenders: Offender[] = [...out]
      .filter((el) => ![...el.children].some((child) => out.has(child)))
      .map((el) => {
        const box = el.getBoundingClientRect()
        return {
          tag: el.tagName.toLowerCase(),
          cls: String(el.getAttribute('class') ?? '').slice(0, 60),
          text: (el.textContent ?? '').trim().slice(0, 40),
          left: Math.round(box.left),
          right: Math.round(box.right),
        }
      })
    return {
      scrollWidth: doc.scrollWidth,
      clientWidth: width,
      offenders: offenders.sort((a, b) => b.right - b.left - (a.right - a.left)).slice(0, 10),
    }
  })
}

async function expectNoOverflow(page: Page, screen: string): Promise<void> {
  // Let the open screen settle: the stamp, the sheets and the lazy chunks finish within this.
  await page.waitForTimeout(600)
  // LAYOUT_SHOTS=<dir> also saves a picture of each screen, for a look by eye.
  const shots = process.env.LAYOUT_SHOTS
  if (shots) await page.screenshot({ path: `${shots}/${screen.replace(/\W+/g, '-')}.png` })
  const m = await measure(page)
  expect(page.viewportSize()?.width, 'the Pixel 7 project is 412 px wide').toBe(PHONE_WIDTH)
  // Soft: one run lists every screen that overflows, not only the first.
  expect
    .soft(
      m.offenders,
      `${screen}: elements outside the viewport (scrollWidth ${m.scrollWidth}, clientWidth ${m.clientWidth})`,
    )
    .toEqual([])
  expect
    .soft(m.scrollWidth, `${screen}: the page scrolls sideways`)
    .toBeLessThanOrEqual(m.clientWidth)
}

async function visit(page: Page, path: string, screen: string): Promise<void> {
  await page.goto(path)
  await expect(page.getByRole('heading').first()).toBeVisible({ timeout: 20_000 })
  await expectNoOverflow(page, screen)
}

test.describe('no horizontal overflow at 412 px', () => {
  test.describe.configure({ mode: 'serial' })
  test.skip(
    process.env.E2E_EMULATORS !== '1',
    'needs the Firebase emulators (see the comment at the top of this file)',
  )

  test.beforeAll(async ({ request }) => {
    await ensureOwnerAccount(request, OWNER_UID)
    await seedItems(request, ITEMS)
    await seedStock(request, STOCK)
  })

  test('the main routes', async ({ page }) => {
    test.setTimeout(180_000)
    await signInAsOwner(page, OWNER_UID)
    await expectNoOverflow(page, 'home')

    await visit(page, '/items', 'items')
    await visit(page, `/items/${code(2)}`, 'item card')
    await visit(page, `/items/${code(2)}/edit`, 'item edit')
    await visit(page, `/items/${code(2)}/adjust`, 'adjust')
    await visit(page, '/items/new', 'new item')
    await visit(page, '/movements', 'movements')
    await visit(page, '/exports', 'exports')
    await visit(page, '/import', 'import')
    await visit(page, '/settings', 'settings')
    await visit(page, '/unsent', 'unsent')
    await visit(page, '/receive', 'new receipt')
    await visit(page, '/issue', 'new issue')
  })

  test('items with long names in the list', async ({ page }) => {
    await signInAsOwner(page, OWNER_UID)
    await page.getByRole('link', { name: 'الأصناف', exact: true }).click()
    const box = page.getByRole('search').getByRole('searchbox')
    await box.fill(LONG_TOKEN)
    await expect(page.getByRole('button', { name: new RegExp(code(2)) })).toBeVisible()
    await expectNoOverflow(page, 'items, searching a long name')
  })

  test('an issue batch with a short item and the substitute sheet', async ({ page }) => {
    test.setTimeout(120_000)
    await signInAsOwner(page, OWNER_UID)
    await page.getByRole('link', { name: 'صرف لمندوب' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('صرف')
    await fillBatchHeader(page, `مندوب بإسم طويل جدا للاختبار ${RUN}`)
    await expectNoOverflow(page, 'issue, header filled')
    await addRequest(page, code(2), 6)
    await expectNoOverflow(page, 'issue, an open line')
    await joinOpenLine(page)
    const short = page.getByRole('row', { name: new RegExp(NAME_SHORT.slice(0, 20)) })
    await expect(short).toContainText('ناقص 2')
    await expectNoOverflow(page, 'issue, a short item')
    await short.getByRole('button', { name: 'بديل', exact: true }).click()
    await expect(page.getByRole('dialog', { name: /بديل لـ 2/ })).toBeVisible()
    await expectNoOverflow(page, 'substitute sheet')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('a receipt being counted, then reviewed', async ({ page }) => {
    test.setTimeout(120_000)
    await signInAsOwner(page, OWNER_UID)
    await page.getByRole('link', { name: 'استلام طلبية جديدة' }).click()
    await expect(page.getByRole('heading', { level: 1 })).toContainText('استلام')
    await expectNoOverflow(page, 'receive, empty')

    await page.getByRole('button', { name: 'بيانات الإذن' }).click()
    const sheet = page.getByRole('dialog')
    await sheet.getByLabel('الشركة').fill(`شركة بإسم طويل جدا للاختبار ${LONG_TOKEN}`)
    await sheet.getByLabel('رقم الإذن').fill(`DN-${RUN}-AAAAAAAAAAAAAAAA`)
    await expectNoOverflow(page, 'receive, header sheet')
    await sheet.getByRole('button', { name: 'حفظ', exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)

    const search = page.getByRole('search').getByRole('combobox')
    await search.fill(String(PAGE_BASE + 1))
    await search.press('Enter')
    await expect(page.getByTestId('pending-line')).toContainText(NAME_RECEIVE)
    await expectNoOverflow(page, 'receive, a pending line')
    const card = page.getByTestId('pending-line')
    await field(card, 'رقم التشغيلة').fill(LONG_BATCH)
    await field(card, 'الصلاحية').fill('03/2031')
    await field(card, 'الكمية في الفاتورة').fill('3')
    await field(card, 'اللي اتعدّ').fill('2')
    // The ready line joins the receipt on review; going back shows it as a saved line.
    await page.getByRole('button', { name: /راجع واعتمد/ }).click()
    await page.getByRole('button', { name: 'ارجع للعدّ' }).click()
    await expect(page.getByTestId('saved-line')).toHaveCount(1)
    await expectNoOverflow(page, 'receive, a saved line')
    await page.getByRole('button', { name: /راجع واعتمد/ }).click()
    await expect(page.getByRole('table')).toBeVisible()
    await expectNoOverflow(page, 'receipt review, a count difference')
  })

  test('the sealed receipt page with long item names; the bottom bar still takes clicks', async ({
    page,
  }) => {
    test.setTimeout(120_000)
    await signInAsOwner(page, OWNER_UID)
    await receiveOneLine(page, {
      deliveryNo: `DN-${RUN}`,
      pageNo: PAGE_BASE + 1,
      itemName: NAME_RECEIVE,
      qty: 3,
    })
    await expectNoOverflow(page, 'sealed receipt')

    const nav = page.getByRole('navigation', { name: 'التنقل الرئيسي' })
    await nav.getByRole('link', { name: 'الأصناف', exact: true }).click()
    await expect(page).toHaveURL(/\/items$/)
  })
})
