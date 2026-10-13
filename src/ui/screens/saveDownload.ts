import { XLSX_TYPE, type XlsxFile } from '../../excel/bytes'

/** Hands an `.xlsx` to the browser as a download (no network, works offline). */
export function saveXlsx(file: XlsxFile): void {
  const url = URL.createObjectURL(new Blob([file.bytes.slice()], { type: XLSX_TYPE }))
  const link = document.createElement('a')
  link.href = url
  link.download = file.fileName
  document.body.append(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
