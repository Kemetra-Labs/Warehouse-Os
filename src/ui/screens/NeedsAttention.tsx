import { useNavigate } from 'react-router'
import { useLedger } from '../../data/useLedger'
import { ItemRow } from '../components/ItemRow'
import styles from './NeedsAttention.module.css'

const MAX_ROWS = 8

/**
 * Items below zero (تسويات معلّقة) and items another device changed, until they are opened.
 * Negative ones come first. A tap opens the item card, and opening the card is what clears the
 * highlight (`markItemSeen` in ItemCard); a negative one stays listed until it is settled.
 */
export function NeedsAttention() {
  const { rows } = useLedger()
  const navigate = useNavigate()
  const flagged = rows
    .filter((r) => r.item.active && (r.pendingSettlement || r.changedSinceSeen))
    .sort((a, b) => Number(b.pendingSettlement) - Number(a.pendingSettlement))
  if (flagged.length === 0) return null

  return (
    <section className={styles.panel} aria-labelledby="needs-attention">
      <h2 id="needs-attention" className={styles.title}>
        محتاجة انتباهك
      </h2>
      <ul className={styles.list}>
        {flagged.slice(0, MAX_ROWS).map((r) => (
          <li key={r.item.code}>
            <ItemRow row={r} onOpen={(code) => void navigate(`/items/${code}`)} />
          </li>
        ))}
      </ul>
      {flagged.length > MAX_ROWS ? (
        <p className={styles.more}>و {flagged.length - MAX_ROWS} أصناف تانية</p>
      ) : null}
    </section>
  )
}
