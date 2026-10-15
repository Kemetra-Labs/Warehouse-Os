import { useState, type FormEvent } from 'react'
import { cairoToday } from '../../domain/dates'
import { formatDay } from '../../domain/fieldInput'
import {
  findDuplicateDelivery,
  type ExistingReceipt,
  type ReceiptDraft,
} from '../../domain/receipt'
import { Bdi } from '../components/Bdi'
import { BottomSheet } from '../components/BottomSheet'
import { Button } from '../components/Button'
import { HeaderSummary, type SummaryItem } from './HeaderSummary'
import styles from './ReceiveHeader.module.css'

export interface ReceiveHeaderProps {
  readonly draft: ReceiptDraft
  readonly existing: readonly ExistingReceipt[]
  readonly selfId: string
  readonly onChange: (draft: ReceiptDraft) => void
  /** FR-030b: this delivery note already has a receipt. */
  readonly onOpenExisting: (id: string) => void
}

const field = (label: string, value: string, required: boolean): SummaryItem => ({
  label,
  value: <Bdi>{value}</Bdi>,
  empty: value === '',
  required,
})

/**
 * The header fields for the summary line. The supplier is already in the screen's title, so it
 * only appears here while it is missing; the fields the paper note always has show a dash in
 * amber when empty; the two optional numbers show only once they are filled.
 */
function summaryOf(draft: ReceiptDraft): SummaryItem[] {
  const invoice = [draft.invoiceNo, formatDay(draft.invoiceDate ?? '')].filter((p) => p !== '')
  const all: SummaryItem[] = [
    field('إذن', draft.deliveryNo, true),
    field('فاتورة', invoice.join(' · '), true),
    field('طلب إمداد', draft.supplyRequestNo ?? '', false),
    field('أمر توريد', draft.supplyOrderNo ?? '', false),
    field('تاريخ الاستلام', formatDay(draft.businessDate), true),
  ]
  const supplier = draft.supplier.trim() === '' ? [field('الشركة', '', true)] : []
  return [...supplier, ...all.filter((c) => c.required === true || c.empty !== true)]
}

interface FormValues {
  supplier: string
  deliveryNo: string
  invoiceNo: string
  invoiceDate: string
  supplyRequestNo: string
  supplyOrderNo: string
  businessDate: string
}

const valuesOf = (d: ReceiptDraft): FormValues => ({
  supplier: d.supplier,
  deliveryNo: d.deliveryNo,
  invoiceNo: d.invoiceNo,
  invoiceDate: d.invoiceDate ?? '',
  supplyRequestNo: d.supplyRequestNo ?? '',
  supplyOrderNo: d.supplyOrderNo ?? '',
  businessDate: d.businessDate,
})

const orNull = (text: string): string | null => (text.trim() === '' ? null : text.trim())

function applyValues(draft: ReceiptDraft, v: FormValues): ReceiptDraft {
  return {
    ...draft,
    supplier: v.supplier.trim(),
    deliveryNo: v.deliveryNo.trim(),
    invoiceNo: v.invoiceNo.trim(),
    invoiceDate: orNull(v.invoiceDate),
    supplyRequestNo: orNull(v.supplyRequestNo),
    supplyOrderNo: orNull(v.supplyOrderNo),
    businessDate: v.businessDate || draft.businessDate,
  }
}

interface FieldSpec {
  readonly key: keyof FormValues
  readonly label: string
  readonly type?: 'date'
  readonly ltr?: boolean
}

const FIELDS: readonly FieldSpec[] = [
  { key: 'supplier', label: 'الشركة' },
  { key: 'deliveryNo', label: 'رقم الإذن', ltr: true },
  { key: 'invoiceNo', label: 'رقم الفاتورة', ltr: true },
  { key: 'invoiceDate', label: 'تاريخ الفاتورة', type: 'date' },
  { key: 'supplyRequestNo', label: 'طلب إمداد', ltr: true },
  { key: 'supplyOrderNo', label: 'أمر توريد', ltr: true },
  { key: 'businessDate', label: 'تاريخ الاستلام', type: 'date' },
]

function HeaderForm({
  draft,
  existing,
  selfId,
  onChange,
  onOpenExisting,
  onDone,
}: ReceiveHeaderProps & { onDone: () => void }) {
  const [opened] = useState(() => valuesOf(draft))
  const [values, setValues] = useState(opened)
  const today = cairoToday()

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    // Only what was typed here: the scanner keeps reading behind the sheet, and a delivery
    // note QR read meanwhile must not be undone by the values the sheet opened with.
    const typed = FIELDS.filter((f) => values[f.key] !== opened[f.key])
    const next = { ...valuesOf(draft) }
    for (const f of typed) next[f.key] = values[f.key]
    const dup = findDuplicateDelivery(existing, next.deliveryNo, selfId)
    if (dup) onOpenExisting(dup.id)
    else onChange(applyValues(draft, next))
    onDone()
  }

  return (
    <form className={styles.form} onSubmit={submit}>
      {FIELDS.map((f) => (
        <label key={f.key} className={styles.field}>
          <span>{f.label}</span>
          <input
            className={styles.input}
            type={f.type ?? 'text'}
            dir={f.ltr ? 'ltr' : 'auto'}
            autoComplete="off"
            max={f.key === 'businessDate' ? today : undefined}
            value={values[f.key]}
            onChange={(e) => setValues({ ...values, [f.key]: e.target.value })}
          />
        </label>
      ))}
      <Button type="submit" variant="primary">
        حفظ
      </Button>
    </form>
  )
}

/** Delivery note, invoice, supply request, order and date as one line; the button edits them all. */
export function ReceiveHeader(props: ReceiveHeaderProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <HeaderSummary
        items={summaryOf(props.draft)}
        editLabel="بيانات الإذن"
        onEdit={() => setOpen(true)}
      />
      <BottomSheet open={open} title="بيانات الإذن" onClose={() => setOpen(false)}>
        <HeaderForm {...props} onDone={() => setOpen(false)} />
      </BottomSheet>
    </>
  )
}
