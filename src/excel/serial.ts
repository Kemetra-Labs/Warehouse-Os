/** The workbook's typo date and its confirmed correction (FR-005). */
export const TYPO_DATE = '2026-01-08'
export const CORRECTED_DATE = '2026-08-01'

const EXCEL_1900_TO_UNIX_DAYS = 25569 // serial of 1970-01-01 in the 1900 date system
const DATE1904_OFFSET_DAYS = 1462
const MAX_SERIAL = 2_958_465 // 9999-12-31

const pad = (n: number, width: number): string => String(n).padStart(width, '0')

/** Integer civil-from-days (Howard Hinnant). No Date object, so no time zone is involved. */
function civilFromDays(unixDays: number): { y: number; m: number; d: number } {
  const z = unixDays + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  )
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d }
}

/** Excel serial -> `YYYY-MM-DD`, or null when it is not a plausible date serial. */
export function serialToIso(serial: number, date1904 = false): string | null {
  if (!Number.isFinite(serial) || serial < 61 || serial > MAX_SERIAL) return null
  const days = Math.floor(serial) - EXCEL_1900_TO_UNIX_DAYS + (date1904 ? DATE1904_OFFSET_DAYS : 0)
  const { y, m, d } = civilFromDays(days)
  return `${pad(y, 4)}-${pad(m, 2)}-${pad(d, 2)}`
}

/** FR-005: the workbook's 2026-01-08 entries are a day/month typo for 2026-08-01. */
export function remapBusinessDate(iso: string): { date: string; remapped: boolean } {
  return iso === TYPO_DATE
    ? { date: CORRECTED_DATE, remapped: true }
    : { date: iso, remapped: false }
}
