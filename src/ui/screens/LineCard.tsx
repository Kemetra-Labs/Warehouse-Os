import { useState } from 'react'
import { formatExpiry } from '../../domain/fieldInput'
import { formatMoney } from '../../domain/money'
import { priceChanged } from '../../domain/receipt'
import type { Item, ReceiptLine } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { InlineQty, QtyStepper } from '../components/QtyStepper'
import { ExpiredReason, LineFields } from './LineFields'
import styles from './LineCard.module.css'

export interface LineCardProps {
  readonly line: ReceiptLine
  /** The item the line points at; null while the GTIN is unresolved. */
  readonly item: Item | null
  readonly businessDate: string
  /** `pending` is being filled in and joins the receipt by itself; `saved` is on it. */
  readonly mode: 'pending' | 'saved'
  /** Pending only: what the line still needs before it can join; null when it is ready. */
  readonly problem?: string | null
  readonly onChange: (patch: Partial<ReceiptLine>) => void
  readonly onPickItem: () => void
  readonly onDiscard?: () => void
  readonly onRemove?: () => void
  readonly onAddBatch?: () => void
}

function Heading({ line, item, onPickItem }: Pick<LineCardProps, 'line' | 'item' | 'onPickItem'>) {
  if (item) {
    return (
      <div className={styles.head}>
        <strong className={styles.name}>{item.nameAr}</strong>
        <em className={styles.code}>
          ص {item.page} · <Bdi>{item.code}</Bdi>
          {line.scannedGtin ? (
            <>
              {' '}
              · GTIN <Bdi>{line.scannedGtin}</Bdi>
            </>
          ) : null}
        </em>
      </div>
    )
  }
  return (
    <div className={styles.unknown}>
      <strong className={styles.name}>
        باركود <Bdi>{line.scannedGtin ?? '؟'}</Bdi> مش معروف
      </strong>
      <Button variant="primary" onClick={onPickItem}>
        اختار الصنف
      </Button>
    </div>
  )
}

interface ChipProps {
  readonly label: string
  readonly value: string | null
  /** The value was read from the barcode: shown as a filled chip with its source. */
  readonly fromScan: boolean
  readonly onTap: () => void
}

/** A value the line already has, or a dashed prompt for one it lacks. Tapping edits it. */
function Chip({ label, value, fromScan, onTap }: ChipProps) {
  const filled = value !== null && value !== ''
  const cls = `${styles.chip} ${filled ? '' : styles.empty} ${filled && fromScan ? styles.auto : ''}`
  return (
    <button type="button" className={cls} onClick={onTap}>
      {filled ? (
        <>
          {label} <Bdi>{value}</Bdi>
          {fromScan ? ' · من الباركود' : ''}
        </>
      ) : (
        `+ ${label}`
      )}
    </button>
  )
}

/** The open line: chips for what the barcode gave, the stepper for the count, and what it still needs. */
function PendingBody(props: LineCardProps) {
  const { line, businessDate, onChange } = props
  // What the barcode filled in when the line opened; the card is keyed per line, so this is fixed.
  const [scanned] = useState({ batch: line.batchNo !== null, expiry: line.expiry !== null })
  // The fields open at once when there is nothing from the barcode to confirm, so typing starts.
  const [editing, setEditing] = useState(line.batchNo === null || line.expiry === null)
  const ready = props.problem === null || props.problem === undefined
  const changed = priceChanged(line)
  const open = (): void => setEditing(true)

  return (
    <>
      {editing ? (
        <>
          <LineFields line={line} businessDate={businessDate} onChange={onChange} scope="detail" />
          <Button onClick={() => setEditing(false)}>تم</Button>
        </>
      ) : (
        <div className={styles.chips}>
          <Chip label="تشغيلة" value={line.batchNo} fromScan={scanned.batch} onTap={open} />
          <Chip
            label="صلاحية"
            value={line.expiry === null ? null : formatExpiry(line.expiry)}
            fromScan={scanned.expiry}
            onTap={open}
          />
          <button
            type="button"
            className={`${styles.chip} ${changed ? styles.warn : ''}`}
            onClick={open}
          >
            السعر <Bdi>{formatMoney(line.priceMinor)}</Bdi>
            {changed ? (
              <>
                {' '}
                (كان <Bdi>{formatMoney(line.prevPriceMinor)}</Bdi>)
              </>
            ) : null}
          </button>
        </div>
      )}
      <ExpiredReason line={line} businessDate={businessDate} onChange={onChange} />
      <QtyStepper
        value={line.countedQty}
        label="اللي اتعدّ"
        onCommit={(countedQty) => onChange({ countedQty })}
        caption={
          <>
            <span aria-hidden="true">اتعدّ من </span>
            <InlineQty
              value={line.invoicedQty}
              label="الكمية في الفاتورة"
              onCommit={(invoicedQty) => onChange({ invoicedQty })}
            />
            <span aria-hidden="true"> في الفاتورة</span>
          </>
        }
      />
      <p className={ready ? styles.ready : styles.problem} role="status">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d={ready ? 'M3.5 8.5l3 3 6-7' : 'M8 3v6M8 12.5v.5'} />
        </svg>
        {ready ? 'جاهز: بيتضاف مع الصنف اللي بعده أو مع المراجعة' : props.problem}
      </p>
    </>
  )
}

function SavedBody(props: LineCardProps) {
  const { line, item, businessDate, onChange } = props
  const [open, setOpen] = useState(false)
  const complete = line.invoicedQty > 0 && line.countedQty === line.invoicedQty
  return (
    <>
      {item ? (
        <div className={styles.row}>
          <i
            className={`${styles.mark} ${complete ? styles.markOk : styles.markAttn}`}
            aria-hidden="true"
          />
          <div>
            <strong className={styles.name}>{item.nameAr}</strong>
            <em className={styles.code}>
              <Bdi>{item.code}</Bdi>
              {line.batchNo ? (
                <>
                  {' · '}
                  <Bdi>{line.batchNo}</Bdi>
                </>
              ) : null}
              {' · '}اتعدّ {line.countedQty} من {line.invoicedQty}
            </em>
          </div>
          <b className={styles.count}>{line.countedQty}</b>
        </div>
      ) : (
        <>
          <Heading line={line} item={item} onPickItem={props.onPickItem} />
          <p className={styles.summary}>
            صنف مش معروف · اتعدّ {line.countedQty} من {line.invoicedQty}
          </p>
        </>
      )}
      {open ? (
        <LineFields line={line} businessDate={businessDate} onChange={onChange} scope="all" />
      ) : null}
      <div className={styles.actions}>
        <Button onClick={() => setOpen((v) => !v)}>{open ? 'إغلاق' : 'تعديل'}</Button>
        {item ? <Button onClick={props.onAddBatch}>تشغيلة تانية</Button> : null}
        <Button variant="danger" onClick={props.onRemove}>
          حذف
        </Button>
      </div>
    </>
  )
}

/**
 * One receipt line. The open one is the big card (item, chips, −/+ count); a saved one is a
 * compact row that expands to edit.
 */
export function LineCard(props: LineCardProps) {
  const { line, item, mode } = props
  return (
    <section
      className={`${styles.card} ${mode === 'pending' ? styles.pending : styles.saved}`}
      data-testid={`${mode}-line`}
    >
      {mode === 'pending' ? (
        <>
          <Heading line={line} item={item} onPickItem={props.onPickItem} />
          <PendingBody {...props} />
          <div className={styles.actions}>
            <Button onClick={props.onDiscard}>امسح السطر</Button>
          </div>
        </>
      ) : (
        <SavedBody {...props} />
      )}
    </section>
  )
}
