import type { Item } from '../../domain/types'
import { Bdi } from './Bdi'
import styles from './SuggestionList.module.css'

export const NO_MATCH = 'مفيش صنف بالرقم أو الاسم ده'

/** The DOM id of the nth option, so the input can point at it with aria-activedescendant. */
export const optionId = (listId: string, index: number): string => `${listId}-opt-${index}`

export interface SuggestionListProps {
  /** The id the combobox input points at with aria-controls. */
  readonly id: string
  readonly items: readonly Item[]
  /** The highlighted option (arrow keys), or -1 when none is. */
  readonly activeIndex: number
  readonly onPick: (item: Item) => void
}

/** The matches under a search box: name, page and code. Tapping one picks it. */
export function SuggestionList({ id, items, activeIndex, onPick }: SuggestionListProps) {
  if (items.length === 0) return <p className={styles.empty}>{NO_MATCH}</p>
  return (
    <ul id={id} role="listbox" aria-label="الأصناف المطابقة" className={styles.list}>
      {items.map((item, i) => (
        <li
          key={item.code}
          id={optionId(id, i)}
          role="option"
          aria-selected={i === activeIndex}
          className={styles.option}
          // Keep the focus in the input: a tap must not blur it before the click lands.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(item)}
        >
          <span className={styles.name}>{item.nameAr}</span>
          <span className={styles.meta}>
            ص <Bdi>{item.page}</Bdi> · <Bdi>{item.code}</Bdi>
          </span>
        </li>
      ))}
    </ul>
  )
}
