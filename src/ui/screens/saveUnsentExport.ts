import type { UnsentView } from '../../data/unsent'

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

/** Builds the workbook (exceljs loads only now) and hands it to the browser as a download. */
export async function saveUnsentExport(views: readonly UnsentView[], day: string): Promise<void> {
  const { unsentWorkbookBytes } = await import('../../excel/exportUnsent')
  const bytes = await unsentWorkbookBytes(views)
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: XLSX_TYPE }))
  const link = document.createElement('a')
  link.href = url
  link.download = `unsent-${day}.xlsx`
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
