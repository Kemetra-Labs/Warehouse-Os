import { useMemo, useState } from 'react'
import { formatMoney } from '../../domain/money'
import {
  formatDiffMinor,
  formatDiffPercent,
  rankSubstitutes,
  type SubstituteCandidate,
} from '../../domain/substitutes'
import type { Item } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { BottomSheet } from '../components/BottomSheet'
import { Button } from '../components/Button'
import styles from './SubstituteSheet.module.css'

export interface SubstituteSheetProps {
  readonly open: boolean
  /** The requested item that is short; null while the sheet is closed. */
  readonly requested: Item | null
  /** How much of it is missing. */
  readonly shortQty: number
  readonly items: readonly Item[]
  /** Stock of an item that this batch has not claimed yet. */
  readonly availableOf: (code: string) => number
  /** Issue `qty` of `substitute` in place of the requested item. */
  readonly onPick: (substitute: Item, qty: number) => void
  /** "صرف بالسالب + سبب": the caller asks for the reason. */
  readonly onNegative: () => void
  readonly onClose: () => void
}

interface ListProps {
  readonly candidates: readonly SubstituteCandidate[]
  readonly chosenCode: string | null
  readonly onChoose: (code: string) => void
}

function Options({ candidates, chosenCode, onChoose }: ListProps) {
  return (
    <ul className={styles.list} role="radiogroup" aria-label="البدائل">
      {candidates.map((c) => {
        const same = c.diffMinor === 0
        return (
          <li key={c.item.code}>
            <label
              className={`${styles.option} ${c.item.code === chosenCode ? styles.chosen : ''}`}
            >
              <input
                type="radio"
                name="substitute"
                checked={c.item.code === chosenCode}
                onChange={() => onChoose(c.item.code)}
              />
              <span className={styles.body}>
                <span className={styles.name}>{c.item.nameAr}</span>
                <span className={styles.meta}>
                  ص {c.item.page} · <Bdi>{c.item.code}</Bdi> · الرصيد {c.balance} ·{' '}
                  {formatMoney(c.item.priceMinor)} ج
                </span>
              </span>
              <span className={`${styles.diff} ${same ? styles.same : styles.off}`}>
                <bdi dir="ltr">{formatDiffPercent(c.diffPercent, c.diffMinor)}</bdi>
                <small>
                  <bdi dir="ltr">{formatDiffMinor(c.diffMinor)}</bdi> ج
                </small>
              </span>
            </label>
          </li>
        )
      })}
    </ul>
  )
}

function SheetBody(props: SubstituteSheetProps & { readonly requested: Item }) {
  const { requested, shortQty, items, availableOf, onPick, onNegative } = props
  const [allCategories, setAllCategories] = useState(false)
  const [picked, setPicked] = useState<string | null>(null)

  const candidates = useMemo(
    () => rankSubstitutes(requested, items, availableOf, { allCategories }),
    [requested, items, availableOf, allCategories],
  )
  // The nearest price is chosen until the user picks another one.
  const chosen = candidates.find((c) => c.item.code === picked) ?? candidates[0] ?? null
  const qty = chosen ? Math.min(shortQty, chosen.balance) : 0

  return (
    <div className={styles.body2}>
      <p className={styles.hint}>
        {allCategories ? 'كل الفئات' : 'نفس الفئة'} · ليها رصيد · مترتبة بأقرب سعر من{' '}
        {formatMoney(requested.priceMinor)} ج
      </p>
      <label className={styles.toggle}>
        <input
          type="checkbox"
          checked={allCategories}
          onChange={(e) => {
            setAllCategories(e.target.checked)
            setPicked(null)
          }}
        />
        كل الفئات
      </label>
      {candidates.length === 0 ? (
        <p className={styles.empty}>مفيش بدائل ليها رصيد. ممكن تصرف بالسالب مع السبب.</p>
      ) : (
        <Options
          candidates={candidates}
          chosenCode={chosen?.item.code ?? null}
          onChoose={setPicked}
        />
      )}
      <div className={styles.actions}>
        <Button
          variant="primary"
          disabled={chosen === null}
          onClick={() => chosen && onPick(chosen.item, qty)}
        >
          صرف {qty} بديل
        </Button>
        <Button onClick={onNegative}>صرف بالسالب + سبب</Button>
      </div>
    </div>
  )
}

/** FR-042: substitutes of the same category by nearest price, or "كل الفئات", or a negative issue. */
export function SubstituteSheet(props: SubstituteSheetProps) {
  const { open, requested, shortQty, onClose } = props
  const title = requested ? `بديل لـ ${shortQty} ${requested.nameAr}` : 'بديل'
  return (
    <BottomSheet open={open} title={title} onClose={onClose}>
      {requested ? <SheetBody {...props} requested={requested} /> : null}
    </BottomSheet>
  )
}
