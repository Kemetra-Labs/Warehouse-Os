import {
  formatExpiry,
  formatPriceInput,
  parseExpiryInput,
  parsePriceInput,
  parseQtyInput,
} from '../../domain/fieldInput'
import { formatMoney } from '../../domain/money'
import { priceChanged } from '../../domain/receipt'
import { hasBadExpiry, isExpired } from '../../domain/receiptEdit'
import type { ReceiptLine } from '../../domain/types'
import { ParsedField, type Parsed } from '../components/ParsedField'
import styles from './LineCard.module.css'

export const asText = (value: string | null): string => value ?? ''

const parseText = (text: string): Parsed<string | null> => ({
  ok: true,
  value: text.trim() === '' ? null : text.trim(),
})
const parseQty = (text: string): Parsed<number> => {
  const n = parseQtyInput(text)
  return n === null ? { ok: false } : { ok: true, value: n }
}
const parsePrice = (text: string): Parsed<number> => {
  const n = parsePriceInput(text)
  return n === null ? { ok: false } : { ok: true, value: n }
}
/** An expiry that does not read is kept as typed, so the card and the review can flag it. */
const parseExpiry = (text: string): Parsed<string | null> => {
  const r = parseExpiryInput(text)
  if (r.kind === 'ok') return { ok: true, value: r.value }
  return { ok: true, value: r.kind === 'empty' ? null : text.trim() }
}

export interface LineFieldsProps {
  readonly line: ReceiptLine
  readonly businessDate: string
  readonly onChange: (patch: Partial<ReceiptLine>) => void
  /**
   * `detail`: batch, expiry, price and manufacture date (the open line; its counts are the
   * stepper, and its expired-batch reason is shown by the card). `all`: also both quantities and
   * the reason box (editing a line that is already on the receipt).
   */
  readonly scope: 'detail' | 'all'
}

export interface ExpiredReasonProps {
  readonly line: ReceiptLine
  readonly businessDate: string
  readonly onChange: (patch: Partial<ReceiptLine>) => void
}

/** The reason box an expired batch asks for; nothing while the batch is in date. */
export function ExpiredReason({ line, businessDate, onChange }: ExpiredReasonProps) {
  if (!isExpired(line, businessDate)) return null
  return (
    <div className={styles.expired} role="alert">
      <p>الصلاحية منتهية. اكتب السبب قبل ما السطر يتضاف.</p>
      <ParsedField
        label="سبب الصلاحية المنتهية"
        value={line.expiredReason}
        format={asText}
        parse={parseText}
        onCommit={(expiredReason) => onChange({ expiredReason })}
      />
    </div>
  )
}

/** The typed fields of a receipt line, and the reason box when this card does not show it elsewhere. */
export function LineFields({ line, businessDate, onChange, scope }: LineFieldsProps) {
  const changed = priceChanged(line)
  return (
    <>
      <div className={styles.fields}>
        <ParsedField
          label="رقم التشغيلة"
          dir="ltr"
          value={line.batchNo}
          format={asText}
          parse={parseText}
          onCommit={(batchNo) => onChange({ batchNo })}
        />
        <ParsedField
          label="الصلاحية"
          dir="ltr"
          inputMode="numeric"
          placeholder="MM/YYYY"
          value={line.expiry}
          format={(v) => formatExpiry(v)}
          parse={parseExpiry}
          onCommit={(expiry) => onChange({ expiry })}
          hint={hasBadExpiry(line) ? 'التاريخ مش مفهوم' : undefined}
        />
        {scope === 'all' ? (
          <>
            <ParsedField
              label="الكمية في الفاتورة"
              dir="ltr"
              inputMode="numeric"
              value={line.invoicedQty}
              format={String}
              parse={parseQty}
              onCommit={(invoicedQty) => onChange({ invoicedQty })}
            />
            <ParsedField
              label="اللي اتعدّ"
              dir="ltr"
              inputMode="numeric"
              value={line.countedQty}
              format={String}
              parse={parseQty}
              onCommit={(countedQty) => onChange({ countedQty })}
            />
          </>
        ) : null}
        <ParsedField
          label="السعر"
          dir="ltr"
          inputMode="decimal"
          value={line.priceMinor}
          format={formatPriceInput}
          parse={parsePrice}
          onCommit={(priceMinor) => onChange({ priceMinor })}
          changed={changed}
          hint={changed ? `كان ${formatMoney(line.prevPriceMinor)}` : undefined}
        />
        <ParsedField
          label="تاريخ التصنيع (اختياري)"
          dir="ltr"
          inputMode="numeric"
          placeholder="MM/YYYY"
          value={line.mfgDate}
          format={(v) => formatExpiry(v)}
          parse={parseExpiry}
          onCommit={(mfgDate) => onChange({ mfgDate })}
        />
      </div>
      {scope === 'all' ? (
        <ExpiredReason line={line} businessDate={businessDate} onChange={onChange} />
      ) : null}
    </>
  )
}
