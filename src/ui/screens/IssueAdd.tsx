import { useState, type FormEvent } from 'react'
import { parseQtyInput } from '../../domain/fieldInput'
import { interpretClass } from '../../domain/receiveScan'
import type { SearchClass } from '../../domain/search'
import type { Item } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { ItemPickerSheet } from '../components/ItemPickerSheet'
import { SearchBox } from '../components/SearchBox'
import styles from './IssueAdd.module.css'

export interface IssueAddProps {
  readonly items: readonly Item[]
  /** Stock of an item that this batch has not claimed yet. */
  readonly availableOf: (code: string) => number
  readonly onAdd: (item: Item, qty: number) => void
}

const notFound = (query: string): string => `مفيش صنف بالرقم أو الاسم ده (${query})`

interface RequestCardProps {
  readonly item: Item
  readonly available: number
  readonly onAdd: (qty: number) => void
  readonly onCancel: () => void
}

function RequestCard({ item, available, onAdd, onCancel }: RequestCardProps) {
  const [text, setText] = useState('1')
  const qty = parseQtyInput(text)
  const valid = qty !== null && qty > 0

  const submit = (e: FormEvent<HTMLFormElement>): void => {
    e.preventDefault()
    if (valid) onAdd(qty)
  }

  return (
    <form className={styles.card} data-testid="pending-request" onSubmit={submit}>
      <div>
        <div className={styles.name}>{item.nameAr}</div>
        <div className={styles.meta}>
          ص {item.page} · <Bdi>{item.code}</Bdi> · الرصيد {available}
        </div>
      </div>
      <label className={styles.field}>
        <span>الكمية المطلوبة</span>
        <input
          className={styles.input}
          type="text"
          inputMode="numeric"
          dir="ltr"
          autoComplete="off"
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
      </label>
      <div className={styles.actions}>
        <Button type="submit" variant="primary" disabled={!valid}>
          إضافة للدفعة
        </Button>
        <Button onClick={onCancel}>إلغاء</Button>
      </div>
    </form>
  )
}

/** Search for an item, say how many the permit asks for, and add it to the batch. */
export function IssueAdd({ items, availableOf, onAdd }: IssueAddProps) {
  const [pending, setPending] = useState<Item | null>(null)
  const [choices, setChoices] = useState<readonly Item[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const pick = (item: Item): void => {
    if (!item.active) return setNotice('الصنف ده موقوف. مينفعش يتصرف.')
    setNotice(null)
    setPending(item)
  }

  const resolve = (cls: SearchClass): void => {
    const outcome = interpretClass(items, cls, 'typed')
    if (outcome.kind === 'item') return pick(outcome.item)
    if (outcome.kind === 'choose') return setChoices(outcome.items)
    setNotice(notFound(outcome.kind === 'not-found' ? outcome.query : 'باركود'))
  }

  return (
    <>
      <SearchBox clearOnSubmit onResolve={resolve} />
      {notice ? (
        <p className={styles.notice} role="status" data-testid="notice">
          {notice}
        </p>
      ) : null}
      {pending ? (
        <RequestCard
          key={pending.code}
          item={pending}
          available={availableOf(pending.code)}
          onAdd={(qty) => {
            onAdd(pending, qty)
            setPending(null)
          }}
          onCancel={() => setPending(null)}
        />
      ) : null}
      <ItemPickerSheet
        open={choices !== null}
        title="اختار الصنف"
        note="الرقم ده يطابق أكتر من صنف. اختار الصنف الصح."
        items={items}
        candidates={choices ?? []}
        onPick={(item) => {
          setChoices(null)
          pick(item)
        }}
        onClose={() => setChoices(null)}
      />
    </>
  )
}
