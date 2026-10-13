import type ExcelJS from 'exceljs'

/** Arial everywhere (contracts/excel-exports.md). */
export const FONT = 'Arial'
const A4 = 9

/** A4 portrait, fit to one page wide, gridlines off when printed. Every output sheet gets it. */
export const PAGE_SETUP: Partial<ExcelJS.PageSetup> = {
  paperSize: A4,
  orientation: 'portrait',
  fitToPage: true,
  fitToWidth: 1,
  fitToHeight: 0,
  horizontalCentered: true,
  showGridLines: false,
  margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.6, header: 0.3, footer: 0.3 },
}

/** Sets `name` as the font of a cell, keeping the rest of its font (bold, size, colour). */
export function withArial(cell: ExcelJS.Cell): void {
  cell.font = { ...cell.font, name: FONT }
}
