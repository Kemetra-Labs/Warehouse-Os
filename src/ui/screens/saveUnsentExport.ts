import type { UnsentView } from '../../data/unsent'
import { saveXlsx } from './saveDownload'

/** Builds the workbook (exceljs loads only now) and hands it to the browser as a download. */
export async function saveUnsentExport(views: readonly UnsentView[], day: string): Promise<void> {
  const { unsentWorkbookBytes } = await import('../../excel/exportUnsent')
  saveXlsx({ fileName: `unsent-${day}.xlsx`, bytes: await unsentWorkbookBytes(views) })
}
