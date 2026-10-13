import type { OpenRequest } from '../../domain/issueRequest'
import type { Item } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import { ItemPickerSheet } from '../components/ItemPickerSheet'
import { QtyStepper } from '../components/QtyStepper'
import { SearchBox } from '../components/SearchBox'
import styles from './IssueAdd.module.css'
import type { IssueRequestFlow } from './useIssueRequest'

export interface IssueAddProps {
  readonly items: readonly Item[]
  readonly flow: IssueRequestFlow
  /** Stock of an item that this batch has not claimed yet. */
  readonly availableOf: (code: string) => number
}

interface OpenCardProps {
  readonly open: OpenRequest
  readonly available: number
  readonly problem: string | null
  readonly onQty: (qty: number) => void
  readonly onQtyValid: (valid: boolean) => void
  readonly onDiscard: () => void
}

/** The open line: the item, how many the permit asks for (−/+), and what it still needs. */
function OpenCard({ open, available, problem, onQty, onQtyValid, onDiscard }: OpenCardProps) {
  const { item, qty } = open
  const ready = problem === null
  const short = Math.max(0, qty - available)
  return (
    <section className={styles.card} data-testid="pending-request">
      <div className={styles.head}>
        <strong className={styles.name}>{item.nameAr}</strong>
        <em className={styles.meta}>
          ص {item.page} · <Bdi>{item.code}</Bdi>
        </em>
      </div>
      <QtyStepper
        value={qty}
        label="الكمية المطلوبة"
        onCommit={onQty}
        onValidChange={onQtyValid}
        caption={
          <>
            الرصيد {available}
            {ready && short > 0 ? (
              <span className={styles.short}> · هيبقى ناقص {short}</span>
            ) : null}
          </>
        }
      />
      <p className={ready ? styles.ready : styles.problem} role="status">
        <svg viewBox="0 0 16 16" aria-hidden="true" focusable="false">
          <path d={ready ? 'M3.5 8.5l3 3 6-7' : 'M8 3v6M8 12.5v.5'} />
        </svg>
        {ready ? 'جاهز: بيتضاف مع الصنف اللي بعده أو مع راجع واعتمد' : problem}
      </p>
      <div className={styles.actions}>
        <Button onClick={onDiscard}>امسح السطر</Button>
      </div>
    </section>
  )
}

/** Search for an item, say how many the permit asks for; the line joins the batch by itself. */
export function IssueAdd({ items, flow, availableOf }: IssueAddProps) {
  const { open } = flow
  return (
    <>
      <SearchBox
        clearOnSubmit
        onResolve={flow.onSearch}
        suggestFrom={items}
        onPickItem={flow.pick}
      />
      {flow.notice ? (
        <p className={styles.notice} role="status" data-testid="notice">
          {flow.notice}
        </p>
      ) : null}
      {open ? (
        <OpenCard
          key={flow.openKey}
          open={open}
          available={availableOf(open.item.code)}
          problem={flow.problem}
          onQty={flow.setQty}
          onQtyValid={flow.setQtyValid}
          onDiscard={flow.discard}
        />
      ) : null}
      <ItemPickerSheet
        open={flow.choices !== null}
        title="اختار الصنف"
        note="الرقم ده يطابق أكتر من صنف. اختار الصنف الصح."
        items={items}
        candidates={flow.choices ?? []}
        onPick={(item) => {
          flow.closeChoices()
          flow.pick(item)
        }}
        onClose={flow.closeChoices}
      />
    </>
  )
}
