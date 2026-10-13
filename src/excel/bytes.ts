import type ExcelJS from 'exceljs'

/** The `.xlsx` file as bytes. */
export async function workbookBytes(workbook: ExcelJS.Workbook): Promise<Uint8Array> {
  return new Uint8Array(await workbook.xlsx.writeBuffer())
}

/** Windows, Excel and browsers refuse `\ / : * ? " < > |` in a file name. */
export function safeFileName(text: string): string {
  const printable = [...text].filter((c) => c.charCodeAt(0) >= 32).join('')
  const cleaned = printable.replace(/[\\/:*?"<>|]/g, '-').trim()
  return cleaned === '' ? 'ملف' : cleaned
}

export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface XlsxFile {
  readonly fileName: string
  readonly bytes: Uint8Array
}
