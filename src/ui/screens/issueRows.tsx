import { formatExpiry } from '../../domain/fieldInput'
import { coverage, type CoverageRow, type IssueDraft } from '../../domain/issue'
import { balanceOf, batchKey, type BatchRef, type StockView } from '../../domain/issueStock'
import type { IssuedLine, Item } from '../../domain/types'
import { Bdi } from '../components/Bdi'
import { Button } from '../components/Button'
import type { CountRow } from '../components/CountTable'
import type { DotState } from '../components/StatusDot'
import styles from './IssueRows.module.css'

export interface IssueRowActions {
  readonly onSubstitute: (itemCode: string) => void
  readonly onReason: (itemCode: string) => void
  readonly onQty: (itemCode: string, qty: number) => void
  readonly onRemove: (itemCode: string) => void
  readonly onDropSubstitute: (forItemCode: string, subItemCode: string) => void
  readonly onBatch: (n: number, batch: BatchRef) => void
}

export interface IssueRowsInput {
  readonly draft: IssueDraft
  readonly items: readonly Item[]
  /** Needed to edit; a posted batch is shown from its own lines and passes null. */
  readonly stock: StockView | null
  /** Items whose lines go beyond the balance. */
  readonly overdrawn: ReadonlySet<string>
  readonly actions: IssueRowActions | null
}

const sum = (lines: readonly IssuedLine[]): number => lines.reduce((s, l) => s + l.qty, 0)
const hasText = (value: string | null): boolean => value !== null && value.trim() !== ''
const reasonOf = (lines: readonly IssuedLine[]): string =>
  (lines.find((l) => hasText(l.negativeReason))?.negativeReason ?? '').trim()

function BatchLine({ line, stock, onBatch }: LineProps) {
  const batches = stock?.batches(line.itemCode) ?? []
  const index = batches.findIndex((b) => batchKey(b) === batchKey(line))
  const label = line.batchNo ?? 'من غير تشغيلة'
  const expiry = line.expiry ? ` · ${formatExpiry(line.expiry)}` : ''
  if (batches.length < 2 || onBatch === null) {
    return (
      <span className={styles.batch}>
        {line.qty} من تشغيلة <Bdi>{label}</Bdi>
        {expiry}
      </span>
    )
  }
  return (
    <label className={styles.batch}>
      <span>{line.qty} من تشغيلة</span>
      <select
        className={styles.select}
        value={index}
        aria-label={`تشغيلة السطر ${line.n}`}
        onChange={(e) => {
          const next = batches[Number(e.target.value)]
          if (next) onBatch(line.n, { batchNo: next.batchNo, expiry: next.expiry })
        }}
      >
        {index < 0 ? <option value={-1}>{label}</option> : null}
        {batches.map((b, i) => (
          <option key={batchKey(b)} value={i}>
            {b.label}
            {b.expiry ? ` · ${formatExpiry(b.expiry)}` : ''} · الرصيد {b.balance}
          </option>
        ))}
      </select>
    </label>
  )
}

interface LineProps {
  readonly line: IssuedLine
  readonly stock: StockView | null
  readonly onBatch: IssueRowActions['onBatch'] | null
}

interface ReasonProps {
  readonly itemCode: string
  readonly lines: readonly IssuedLine[]
  readonly overdrawn: boolean
  readonly onReason: IssueRowActions['onReason'] | null
}

function ReasonNote({ itemCode, lines, overdrawn, onReason }: ReasonProps) {
  const reason = reasonOf(lines)
  if (!overdrawn && reason === '') return null
  return (
    <>
      <span className={styles.amber}>
        {overdrawn ? 'الصرف أكتر من الرصيد' : 'صرف بالسالب'}
        {reason !== '' ? ` · السبب: ${reason}` : ''}
      </span>
      {onReason ? (
        <Button onClick={() => onReason(itemCode)}>
          {reason !== '' ? 'تعديل السبب' : 'اكتب السبب'}
        </Button>
      ) : null}
    </>
  )
}

interface RequestNotesProps {
  readonly row: CoverageRow
  readonly item: Item | undefined
  readonly direct: readonly IssuedLine[]
  readonly input: IssueRowsInput
}

function RequestNotes({ row, item, direct, input }: RequestNotesProps) {
  const { stock, actions, overdrawn } = input
  const code = row.itemCode
  const balance = stock ? balanceOf(stock, code) : null
  return (
    <>
      <span className={styles.sub}>
        {item ? <>ص {item.page} · </> : null}
        <Bdi>{code}</Bdi>
        {balance !== null ? <> · الرصيد {balance}</> : null}
      </span>
      {direct.map((l) => (
        <BatchLine key={l.n} line={l} stock={stock} onBatch={actions?.onBatch ?? null} />
      ))}
      {row.shortQty > 0 ? <span className={styles.amber}>ناقص {row.shortQty}</span> : null}
      <ReasonNote
        itemCode={code}
        lines={direct}
        overdrawn={overdrawn.has(code)}
        onReason={actions?.onReason ?? null}
      />
      {actions ? (
        <span className={styles.controls}>
          {row.shortQty > 0 ? (
            <Button onClick={() => actions.onSubstitute(code)}>بديل</Button>
          ) : null}
          <Button
            size="square"
            aria-label="قلّل المطلوب"
            disabled={row.requestedQty <= 1}
            onClick={() => actions.onQty(code, row.requestedQty - 1)}
          >
            −
          </Button>
          <Button
            size="square"
            aria-label="زوّد المطلوب"
            onClick={() => actions.onQty(code, row.requestedQty + 1)}
          >
            +
          </Button>
          <Button variant="danger" onClick={() => actions.onRemove(code)}>
            مسح
          </Button>
        </span>
      ) : null}
    </>
  )
}

function requestState(row: CoverageRow, flagged: boolean): DotState {
  if (row.shortQty > 0) return 'miss'
  return row.substituteQty > 0 || flagged ? 'warn' : 'match'
}

function requestRow(row: CoverageRow, input: IssueRowsInput): CountRow {
  const { draft, items, overdrawn } = input
  const item = items.find((i) => i.code === row.itemCode)
  const direct = draft.issued.filter((l) => l.itemCode === row.itemCode && l.forItemCode === null)
  const flagged = overdrawn.has(row.itemCode) || reasonOf(direct) !== ''
  return {
    key: `r-${row.itemCode}`,
    name: item ? item.nameAr : row.itemCode,
    sub: <RequestNotes row={row} item={item} direct={direct} input={input} />,
    requested: row.requestedQty,
    delivered: row.directQty,
    state: requestState(row, flagged),
  }
}

function substituteRows(row: CoverageRow, input: IssueRowsInput): CountRow[] {
  const { draft, items, actions, stock, overdrawn } = input
  const lines = draft.issued.filter((l) => l.forItemCode === row.itemCode)
  const codes = [...new Set(lines.map((l) => l.itemCode))]
  const target = items.find((i) => i.code === row.itemCode)
  return codes.map((code) => {
    const own = lines.filter((l) => l.itemCode === code)
    const item = items.find((i) => i.code === code)
    return {
      key: `s-${row.itemCode}-${code}`,
      name: item ? item.nameAr : code,
      sub: (
        <>
          <span className={`${styles.sub} ${styles.marker}`}>
            بديل عن {sum(own)} {target ? target.nameAr : row.itemCode}
          </span>
          {own.map((l) => (
            <BatchLine key={l.n} line={l} stock={stock} onBatch={actions?.onBatch ?? null} />
          ))}
          <ReasonNote
            itemCode={code}
            lines={own}
            overdrawn={overdrawn.has(code)}
            onReason={actions?.onReason ?? null}
          />
          {actions ? (
            <span className={styles.controls}>
              <Button variant="danger" onClick={() => actions.onDropSubstitute(row.itemCode, code)}>
                إلغاء البديل
              </Button>
            </span>
          ) : null}
        </>
      ),
      requested: null,
      delivered: sum(own),
      state: overdrawn.has(code) ? 'warn' : 'match',
    }
  })
}

/**
 * The مطلوب | اتسلّم rows (FR-040): each requested item, then the substitutes given for it as
 * rows of their own with no request (FR-043). A row that is covered by a substitute or a negative
 * issue is amber, one that is still short is red.
 */
export function buildIssueRows(input: IssueRowsInput): CountRow[] {
  return coverage(input.draft).flatMap((row) => [
    requestRow(row, input),
    ...substituteRows(row, input),
  ])
}
