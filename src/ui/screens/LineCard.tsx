import { useState } from 'react'
import {
  formatExpiry,
  formatPriceInput,
  parseExpiryInput,
  parsePriceInput,
  parseQtyInput,
} from '../../domain/fieldInput'
import { formatMoney } from '../../domain/money'
import { priceChanged } from '../../domain/receipt'
import { canAddLine, hasBadExpiry, isExpired } from '../../domain/receiptEdit'
import type { Item, ReceiptLine } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { ParsedField, type Parsed } from '../components/ParsedField'
import styles from './LineCard.module.css'

export interface LineCardProps {
  readonly line: ReceiptLine
  /** The item the line points at; null while the GTIN is unresolved. */
  readonly item: Item | null
  readonly businessDate: string
  /** `pending` is being filled in and not on the receipt yet; `saved` is on it. */
  readonly mode: 'pending' | 'saved'
  readonly onChange: (patch: Partial<ReceiptLine>) => void
  readonly onPickItem: () => void
  readonly onAdd?: () => void
  readonly onDiscard?: () => void
  readonly onRemove?: () => void
  readonly onAddBatch?: () => void
}

const asText = (value: string | null): string => value ?? ''

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

function Heading({ line, item, onPickItem }: Pick<LineCardProps, 'line' | 'item' | 'onPickItem'>) {
  if (item) {
    return (
      <div>
        <div className={styles.name}>{item.nameAr}</div>
        <div className={styles.code}>
          ص {item.page} · <Bdi>{item.code}</Bdi>
          {line.scannedGtin ? (
            <>
              {' '}
              · GTIN <Bdi>{line.scannedGtin}</Bdi>
            </>
          ) : null}
        </div>
      </div>
    )
  }
  return (
    <div>
      <div className={styles.name}>
        باركود <Bdi>{line.scannedGtin ?? '؟'}</Bdi> مش معروف
      </div>
      <Button variant="primary" onClick={onPickItem}>
        اختار الصنف
      </Button>
    </div>
  )
}

function Fields({
  line,
  businessDate,
  onChange,
}: Pick<LineCardProps, 'line' | 'businessDate' | 'onChange'>) {
  const changed = priceChanged(line)
  const expired = isExpired(line, businessDate)
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
      {expired ? (
        <div className={styles.expired} role="alert">
          <p>الصلاحية منتهية. اكتب السبب قبل ما تضيف السطر.</p>
          <ParsedField
            label="سبب الصلاحية المنتهية"
            value={line.expiredReason}
            format={asText}
            parse={parseText}
            onCommit={(expiredReason) => onChange({ expiredReason })}
          />
        </div>
      ) : null}
    </>
  )
}

function SavedSummary({ line, item }: Pick<LineCardProps, 'line' | 'item'>) {
  return (
    <p className={styles.summary}>
      {item ? item.nameAr : 'صنف مش معروف'} · اتعدّ {line.countedQty} من {line.invoicedQty}
      {line.batchNo ? (
        <>
          {' '}
          · <Bdi>{line.batchNo}</Bdi>
        </>
      ) : null}
    </p>
  )
}

/** One receipt line: the item, and the fields the storekeeper types (batch, expiry, counts, price). */
export function LineCard(props: LineCardProps) {
  const { line, item, businessDate, mode, onChange, onPickItem } = props
  const [open, setOpen] = useState(false)
  const editing = mode === 'pending' || open

  return (
    <section className={styles.card} data-testid={`${mode}-line`}>
      <Heading line={line} item={item} onPickItem={onPickItem} />
      {mode === 'saved' ? <SavedSummary line={line} item={item} /> : null}
      {editing ? <Fields line={line} businessDate={businessDate} onChange={onChange} /> : null}
      <div className={styles.actions}>
        {mode === 'pending' ? (
          <>
            <Button
              variant="primary"
              disabled={!canAddLine(line, businessDate)}
              onClick={props.onAdd}
            >
              إضافة للإذن
            </Button>
            <Button onClick={props.onDiscard}>مسح</Button>
          </>
        ) : (
          <>
            <Button onClick={() => setOpen((v) => !v)}>{open ? 'إغلاق' : 'تعديل'}</Button>
            {item ? <Button onClick={props.onAddBatch}>تشغيلة تانية</Button> : null}
            <Button variant="danger" onClick={props.onRemove}>
              حذف
            </Button>
          </>
        )}
      </div>
    </section>
  )
}
