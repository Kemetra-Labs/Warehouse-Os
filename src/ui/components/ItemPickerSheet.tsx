import type { ReactNode } from 'react'
import type { Item } from '../../domain/types'
import { BottomSheet } from './BottomSheet'
import { ItemPicker } from './ItemPicker'
import styles from './ItemPickerSheet.module.css'

export interface ItemPickerSheetProps {
  readonly open: boolean
  readonly title: string
  readonly note?: ReactNode
  readonly items: readonly Item[]
  readonly candidates?: readonly Item[]
  readonly onPick: (item: Item) => void
  readonly onClose: () => void
}

/**
 * "Which item is this?" as a bottom sheet. Used for an unknown GTIN (link it once, FR-033)
 * and for a search that matched more than one item (never picked automatically, FR-021).
 */
export function ItemPickerSheet({
  open,
  title,
  note,
  items,
  candidates,
  onPick,
  onClose,
}: ItemPickerSheetProps) {
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      {note ? <p className={styles.note}>{note}</p> : null}
      <ItemPicker items={items} candidates={candidates} onPick={onPick} />
    </BottomSheet>
  )
}
