import { cairoToday } from '../../domain/dates'
import type { BackupData } from '../../excel/backup'
import type { LedgerExportPlan } from '../../excel/ledgerPlan'
import type { IssuePrintInput } from '../../excel/printIssue'
import type { ReceiptPrintInput } from '../../excel/printReceipt'
import { saveXlsx } from './saveDownload'

/**
 * Every export loads exceljs only when it runs (a dynamic import), so the library stays out of
 * the main bundle and out of the receive and issue chunks.
 */
export async function downloadReceiptPrint(input: ReceiptPrintInput): Promise<void> {
  const { receiptPrintFile } = await import('../../excel/printReceipt')
  saveXlsx(await receiptPrintFile(input))
}

export async function downloadIssuePrint(input: IssuePrintInput): Promise<void> {
  const { issuePrintFile } = await import('../../excel/printIssue')
  saveXlsx(await issuePrintFile(input))
}

export async function downloadLedgerRows(plan: LedgerExportPlan): Promise<void> {
  const { ledgerFile } = await import('../../excel/ledgerRows')
  saveXlsx(await ledgerFile(plan))
}

export async function downloadBackup(data: BackupData): Promise<void> {
  const { backupFile } = await import('../../excel/backup')
  saveXlsx(await backupFile(data, cairoToday()))
}
