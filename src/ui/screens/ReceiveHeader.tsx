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
import styles from './ReceiveHeader.module.css'

export interface ReceiveHeaderProps {
  readonly draft: ReceiptDraft
  readonly existing: readonly ExistingReceipt[]
  readonly selfId: string
  readonly onChange: (draft: ReceiptDraft) => void
  /** FR-030b: this delivery note already has a receipt. */
  readonly onOpenExisting: (id: string) => void
}

interface Chip {
  readonly label: string
  readonly value: string
  /** The three fields the paper note always has; shown as missing when empty. */
  readonly required?: boolean
}

function chipsOf(draft: ReceiptDraft): Chip[] {
  const invoice = [draft.invoiceNo, formatDay(draft.invoiceDate ?? '')].filter((p) => p !== '')
  const all: Chip[] = [
    { label: 'الشركة', value: draft.supplier, required: true },
    { label: 'إذن', value: draft.deliveryNo, required: true },
    { label: 'فاتورة', value: invoice.join(' · '), required: true },
    { label: 'طلب إمداد', value: draft.supplyRequestNo ?? '' },
    { label: 'أمر توريد', value: draft.supplyOrderNo ?? '' },
    { label: 'تاريخ الاستلام', value: formatDay(draft.businessDate), required: true },
  ]
  return all.filter((c) => c.required || c.value !== '')
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
  const [values, setValues] = useState(() => valuesOf(draft))
  const today = cairoToday()

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    const dup = findDuplicateDelivery(existing, values.deliveryNo, selfId)
    if (dup) onOpenExisting(dup.id)
    else onChange(applyValues(draft, values))
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

/** Supplier, delivery note, invoice, supply request and order as chips; a tap edits them all. */
export function ReceiveHeader(props: ReceiveHeaderProps) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className={styles.chips}>
        {chipsOf(props.draft).map((chip) => (
          <button
            key={chip.label}
            type="button"
            className={`${styles.chip} ${chip.required && chip.value === '' ? styles.missing : ''}`}
            onClick={() => setOpen(true)}
          >
            {chip.label} <b>{chip.value === '' ? '—' : <Bdi>{chip.value}</Bdi>}</b>
          </button>
        ))}
        <button type="button" className={styles.edit} onClick={() => setOpen(true)}>
          بيانات الإذن
        </button>
      </div>
      <BottomSheet open={open} title="بيانات الإذن" onClose={() => setOpen(false)}>
        <HeaderForm {...props} onDone={() => setOpen(false)} />
      </BottomSheet>
    </>
  )
}
