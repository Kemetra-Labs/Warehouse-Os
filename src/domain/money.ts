/** Pounds -> integer piastres, rounding half away from zero with float safety. */
export function toMinor(egp: number): number {
  // toPrecision(15) strips representation noise such as 100.49999999999999.
  const scaled = Number((Math.abs(egp) * 100).toPrecision(15))
  const rounded = Math.round(scaled)
  if (rounded === 0) return 0
  return egp < 0 ? -rounded : rounded
}

export function fromMinor(minor: number): number {
  return minor / 100
}

/** `22,545.96`: Western digits, comma thousands separators, always 2 decimals. */
export function formatMoney(minor: number): string {
  const sign = minor < 0 ? '-' : ''
  const abs = Math.abs(Math.round(minor))
  const pounds = Math.floor(abs / 100)
  const piastres = String(abs % 100).padStart(2, '0')
  const grouped = String(pounds).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${sign}${grouped}.${piastres}`
}

export function lineTotalMinor(qty: number, priceMinor: number): number {
  return qty * priceMinor
}

/** Change from `from` to `to` in percent; null when `from` is 0. */
export function percentDiff(from: number, to: number): number | null {
  if (from === 0) return null
  return ((to - from) / from) * 100
}
