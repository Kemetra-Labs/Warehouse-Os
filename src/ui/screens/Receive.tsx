import { useMemo, useState } from 'react'
import { patchLine, removeLine } from '../../domain/receiptEdit'
import type { ExistingReceipt, ReceiptDraft } from '../../domain/receipt'
import type { Item, ReceiptLine } from '../../domain/types'
import { Scanner } from '../../scan/Scanner'
import type { ScanSource } from '../../scan/types'
import { Button } from '../components/Button'
import { ItemPickerSheet } from '../components/ItemPickerSheet'
import { SearchBox } from '../components/SearchBox'
import { LineCard } from './LineCard'
import styles from './Receive.module.css'
import { ReceiveHeader } from './ReceiveHeader'
import { useReceiveFlow } from './useReceiveFlow'

export interface ReceiveProps {
  readonly draft: ReceiptDraft
  readonly items: readonly Item[]
  /** Every receipt the app knows, to spot a repeated delivery note (FR-030b). */
  readonly existing: readonly ExistingReceipt[]
  /** The id of this receipt, so it never counts as its own duplicate. */
  readonly selfId: string
  /** The camera and detector; tests pass a fake. */
  readonly scanSource?: ScanSource
  readonly onChange: (draft: ReceiptDraft) => void
  readonly onOpenExisting: (id: string) => void
  readonly onReview: () => void
}

/** Receiving: scan or type each item, fill batch, expiry, counts and price, then review. */
export function Receive(props: ReceiveProps) {
  const { draft, items, scanSource, onChange, onReview } = props
  const [cameraOff, setCameraOff] = useState(false)
  const flow = useReceiveFlow(props)
  const byCode = useMemo(() => new Map(items.map((i) => [i.code, i])), [items])
  const itemOf = (line: ReceiptLine): Item | null =>
    line.itemCode === null ? null : (byCode.get(line.itemCode) ?? null)
  const { pending } = flow

  return (
    <section className={styles.screen} aria-labelledby="receive-title">
      <h1 id="receive-title" className={styles.title}>
        استلام · مسودة
      </h1>
      <ReceiveHeader
        draft={draft}
        existing={props.existing}
        selfId={props.selfId}
        onChange={onChange}
        onOpenExisting={props.onOpenExisting}
      />
      <Scanner source={scanSource} onCode={flow.onCode} onUnavailable={() => setCameraOff(true)} />
      {cameraOff ? <p className={styles.note}>الكاميرا مش شغالة. اكتب الرقم في الخانة.</p> : null}
      <SearchBox clearOnSubmit onResolve={flow.onSearch} />
      {flow.notice ? (
        <p className={styles.notice} role="status" data-testid="notice">
          {flow.notice}
        </p>
      ) : null}

      {pending ? (
        <LineCard
          mode="pending"
          line={pending}
          item={itemOf(pending)}
          businessDate={draft.businessDate}
          onChange={flow.patchPending}
          onPickItem={() => flow.askResolve({ kind: 'pending' })}
          onAdd={flow.addPending}
          onDiscard={flow.discardPending}
        />
      ) : null}

      {draft.lines.map((line) => (
        <LineCard
          key={line.n}
          mode="saved"
          line={line}
          item={itemOf(line)}
          businessDate={draft.businessDate}
          onChange={(patch) => onChange(patchLine(draft, line.n, patch))}
          onPickItem={() => flow.askResolve({ kind: 'line', n: line.n })}
          onRemove={() => onChange(removeLine(draft, line.n))}
          onAddBatch={() => {
            const item = itemOf(line)
            if (item) flow.startBatch(item)
          }}
        />
      ))}

      <footer className={styles.footer}>
        <span>{draft.lines.length} سطور</span>
        <Button
          variant="primary"
          disabled={draft.lines.length === 0 || pending !== null}
          onClick={onReview}
        >
          مراجعة
        </Button>
      </footer>

      <ItemPickerSheet
        open={flow.chooseItems !== null}
        title="اختار الصنف"
        note="الرقم ده يطابق أكتر من صنف. اختار الصنف الصح."
        items={items}
        candidates={flow.chooseItems ?? []}
        onPick={flow.pickChosen}
        onClose={flow.closeChoose}
      />
      <ItemPickerSheet
        open={flow.resolving !== null}
        title="الباركود مش معروف"
        note="اختار الصنف اللي الباركود ده بتاعه. هيتربط بعد الاعتماد، والمرة الجاية يتعرف لوحده."
        items={items}
        onPick={flow.pickResolved}
        onClose={flow.closeResolve}
      />
    </section>
  )
}
