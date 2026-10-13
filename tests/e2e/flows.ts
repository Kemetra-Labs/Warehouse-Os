import { expect, type Locator, type Page } from '@playwright/test'

/**
 * Screen-level steps shared by the emulator-gated E2E specs (receive, issue, offline sync).
 * They only click and type; they never touch Firestore.
 */

type ScanWindow = Window & { __scanQueue: { rawValue: string; format: string }[] }

/** Replaces `BarcodeDetector` with one that reads from `window.__scanQueue` (see receive.spec). */
export async function installFakeDetector(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const w = window as unknown as ScanWindow
    w.__scanQueue = []
    class FakeBarcodeDetector {
      static getSupportedFormats(): Promise<string[]> {
        return Promise.resolve(['ean_13', 'ean_8', 'upc_a', 'code_128', 'data_matrix', 'qr_code'])
      }
      detect(): Promise<{ rawValue: string; format: string }[]> {
        const next = w.__scanQueue.shift()
        return Promise.resolve(next ? [next] : [])
      }
    }
    Object.defineProperty(window, 'BarcodeDetector', { value: FakeBarcodeDetector })
  })
}

/** A labelled input inside a line card. */
export const field = (card: Locator, label: string): Locator =>
  card.locator('label', { hasText: label }).locator('input').first()

export async function fillReceiptHeader(page: Page, deliveryNo: string): Promise<void> {
  await page.getByRole('button', { name: 'بيانات الإذن' }).click()
  const sheet = page.getByRole('dialog')
  await sheet.getByLabel('الشركة').fill('شركة اختبار')
  await sheet.getByLabel('رقم الإذن').fill(deliveryNo)
  await sheet.getByLabel('رقم الفاتورة').fill('INV-7')
  await sheet.getByRole('button', { name: 'حفظ', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

export interface ReceiptStep {
  readonly deliveryNo: string
  /** The item's page number: typing it finds the item without a camera. */
  readonly pageNo: number
  readonly itemName: string
  readonly qty: number
}

/** Opens a new receipt from home, receives one line (counted = invoiced) and posts it. */
export async function receiveOneLine(page: Page, step: ReceiptStep): Promise<void> {
  await page.getByRole('link', { name: 'استلام طلبية جديدة' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('استلام')
  await fillReceiptHeader(page, step.deliveryNo)
  const box = page.getByRole('search').getByRole('combobox')
  await box.fill(String(step.pageNo))
  await box.press('Enter')
  const card = page.getByTestId('pending-line')
  await expect(card).toContainText(step.itemName)
  await field(card, 'رقم التشغيلة').fill('SYNC-1')
  await field(card, 'الصلاحية').fill('03/2031')
  await field(card, 'الكمية في الفاتورة').fill(String(step.qty))
  await field(card, 'اللي اتعدّ').fill(String(step.qty))
  // No add step: the ready line joins the receipt when review opens.
  await page.getByRole('button', { name: /راجع واعتمد/ }).click()
  await page.getByRole('button', { name: 'اعتماد', exact: true }).click()
  await expect(page.locator('svg[aria-label*="معتمد"]')).toBeVisible()
}

export async function fillBatchHeader(page: Page, rep: string): Promise<void> {
  await page.getByRole('button', { name: 'بيانات الدفعة' }).click()
  const sheet = page.getByRole('dialog', { name: 'بيانات الدفعة' })
  await sheet.getByLabel('اسم المندوب').fill(rep)
  const permit = sheet.getByLabel(/رقم إذن المريض/)
  await permit.fill('10x1')
  await expect(sheet.getByRole('alert')).toContainText('أرقام بس')
  await expect(sheet.getByRole('button', { name: 'إضافة إذن' })).toBeDisabled()
  for (const number of ['1001', '1002']) {
    await permit.fill(number)
    await sheet.getByRole('button', { name: 'إضافة إذن' }).click()
  }
  await expect(sheet.getByRole('list', { name: 'أرقام الأذون' }).getByRole('listitem')).toHaveCount(
    2,
  )
  await sheet.getByRole('button', { name: 'تم', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

/** Searches by item code, says how many the permit asks for, and adds it to the batch. */
export async function addRequest(page: Page, itemCode: string, qty: number): Promise<void> {
  const box = page.getByRole('search').getByRole('combobox')
  await box.fill(itemCode)
  await box.press('Enter')
  const card = page.getByTestId('pending-request')
  await card.getByLabel('الكمية المطلوبة').fill(String(qty))
  await card.getByRole('button', { name: 'إضافة للدفعة' }).click()
  await expect(card).toHaveCount(0)
}

/** Opens a new issue batch from home, fills it for `rep`, and adds one requested item. */
export async function startIssue(
  page: Page,
  rep: string,
  itemCode: string,
  qty: number,
): Promise<void> {
  await page.getByRole('link', { name: 'صرف لمندوب' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('صرف')
  await fillBatchHeader(page, rep)
  await addRequest(page, itemCode, qty)
}

/** Posts the open batch: the seal appears at once, even offline. */
export async function approveIssue(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'اعتماد', exact: true }).click()
  await expect(page.locator('svg[aria-label*="معتمد"]')).toBeVisible()
}

/** The "back to home" button of a posted document's done notice. */
export async function backHome(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'رجوع للرئيسية' }).click()
  await expect(page.getByRole('link', { name: 'استلام طلبية جديدة' })).toBeVisible()
}

/** The sync pill's label text, e.g. "3 مستنية النت", "متزامن" or "فشل الإرسال". */
export const pill = (page: Page, label: RegExp | string): Locator =>
  page.getByRole('banner').getByText(label, { exact: typeof label === 'string' })

/** Visits each lazy screen once while online, so its chunk is cached before going offline. */
export async function warmLazyScreens(page: Page): Promise<void> {
  for (const link of ['استلام طلبية جديدة', 'صرف لمندوب']) {
    await page.getByRole('link', { name: link }).click()
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.getByRole('link', { name: 'الرئيسية', exact: true }).click()
    await expect(page.getByRole('link', { name: 'استلام طلبية جديدة' })).toBeVisible()
  }
}
