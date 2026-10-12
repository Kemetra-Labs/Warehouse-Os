import type { DiffKind, ParityDiff } from '../../excel/parity'

const DATE_FORMAT = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Africa/Cairo',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
})

/** `12/10/2026`, always in Cairo time, so the text does not depend on the device zone. */
export function formatImportedAt(ms: number): string {
  return DATE_FORMAT.format(new Date(ms))
}

/** The FR-004 refusal. A pending server timestamp (0) shows no date. */
export function alreadyImportedMessage(importedAtMs: number): string {
  return importedAtMs > 0
    ? `اتستورد قبل كده بتاريخ ${formatImportedAt(importedAtMs)}`
    : 'اتستورد قبل كده'
}

const KIND_LABELS: Readonly<Record<DiffKind, string>> = {
  balance: 'الرصيد',
  status: 'الحالة',
  'missing-in-app': 'ناقص في التطبيق',
  'missing-in-workbook': 'ناقص في الإكسيل',
}

export function kindLabel(kind: DiffKind): string {
  return KIND_LABELS[kind]
}

/** Text for one side of a difference; a missing side is an em dash. */
export function valueLabel(value: ParityDiff['app']): string {
  return value === null ? '—' : String(value)
}
