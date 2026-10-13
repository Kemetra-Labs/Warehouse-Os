import { useId, useState } from 'react'
import { interpretClass } from '../../domain/receiveScan'
import { classify } from '../../domain/search'
import type { Item } from '../../domain/types'
import { Bdi } from './Bdi'
import styles from './ItemPicker.module.css'

export interface ItemPickerProps {
  readonly items: readonly Item[]
  /** Shown before anything is typed (the matches of an ambiguous scan). */
  readonly candidates?: readonly Item[]
  readonly onPick: (item: Item) => void
}

function matchesFor(items: readonly Item[], text: string): readonly Item[] {
  const outcome = interpretClass(items, classify(text), 'typed')
  if (outcome.kind === 'item') return [outcome.item]
  return outcome.kind === 'choose' ? outcome.items : []
}

/** Finds an item by page, code, GTIN or name as you type, and lists every match to tap. */
export function ItemPicker({ items, candidates = [], onPick }: ItemPickerProps) {
  const [text, setText] = useState('')
  const listId = useId()
  const query = text.trim()
  const shown = query === '' ? candidates : matchesFor(items, query)

  return (
    <div className={styles.picker}>
      <input
        className={styles.input}
        type="search"
        dir="auto"
        autoComplete="off"
        aria-label="ابحث عن الصنف"
        aria-controls={listId}
        placeholder="رقم الصفحة أو الكود أو الاسم"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <ul id={listId} className={styles.list}>
        {shown.map((item) => (
          <li key={item.code}>
            <button type="button" className={styles.row} onClick={() => onPick(item)}>
              <span className={styles.name}>{item.nameAr}</span>
              <span className={styles.meta}>
                ص {item.page} · <Bdi>{item.code}</Bdi>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {query !== '' && shown.length === 0 ? (
        <p className={styles.empty}>مفيش صنف بالاسم أو الرقم ده</p>
      ) : null}
    </div>
  )
}
