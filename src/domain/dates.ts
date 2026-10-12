const CAIRO_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** The calendar day in Cairo as `YYYY-MM-DD`, whatever the device time zone is. */
export function cairoToday(now: Date = new Date()): string {
  return CAIRO_DAY.format(now)
}

/**
 * The last day an expiry covers: `YYYY-MM-DD` as is, `YYYY-MM` -> the last day of that month.
 * Null for a value that is not a date.
 */
export function expiryEndDay(expiry: string): string | null {
  const full = /^(\d{4})-(\d{2})-(\d{2})$/.exec(expiry)
  if (full) return expiry
  const month = /^(\d{4})-(\d{2})$/.exec(expiry)
  if (!month) return null
  const year = Number(month[1])
  const m = Number(month[2])
  if (m < 1 || m > 12) return null
  const last = new Date(Date.UTC(year, m, 0)).getUTCDate()
  return `${expiry}-${String(last).padStart(2, '0')}`
}
