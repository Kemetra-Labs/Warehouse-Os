/**
 * The unsent-documents view of the outbox (research R12): a readable summary of each queued or
 * rejected post, and the retry that sends it again. Pure: the Firebase writes are injected, so
 * this is tested with fake-indexeddb and fakes.
 */
import { toDraftDoc as issueDraftDoc } from '../domain/issue'
import { toDraftDoc as receiptDraftDoc } from '../domain/receipt'
import { ISSUE_POST_KIND, buildIssueWrites, type IssueCommitPlan } from './issuePost'
import type { Outbox, OutboxEntry, ServerCheck } from './outbox'
import {
  RECEIPT_POST_KIND,
  buildWrites,
  settlePost,
  type CommitPlan,
  type PostOutcome,
} from './receiptPost'

export type UnsentKind = 'receipt' | 'issue' | 'unknown'

/** One movement the document would have written. */
export interface UnsentLine {
  readonly itemCode: string
  readonly name: string
  readonly type: string
  readonly qty: number
  readonly priceMinor: number
  readonly batchNo: string | null
  readonly expiry: string | null
}

export interface UnsentView {
  readonly id: string
  readonly kind: UnsentKind
  readonly title: string
  readonly subtitle: string
  readonly businessDate: string
  readonly status: OutboxEntry['status']
  readonly error: string | null
  readonly createdAt: number
  readonly lines: readonly UnsentLine[]
}

type Rec = Readonly<Record<string, unknown>>

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const recs = (v: unknown): Rec[] => (Array.isArray(v) ? v.filter(isRec) : [])

/** Names are looked up by the caller (the payload only holds item codes). */
export type NameOf = (itemCode: string) => string

function linesOf(batch: unknown, nameOf: NameOf): UnsentLine[] {
  const movements = isRec(batch) ? recs(batch['movements']) : []
  return movements.flatMap((m) => {
    const data = m['data']
    if (!isRec(data)) return []
    const itemCode = str(data['itemCode'])
    return [
      {
        itemCode,
        name: nameOf(itemCode),
        type: str(data['type']),
        qty: num(data['qty']),
        priceMinor: num(data['priceMinor']),
        batchNo: strOrNull(data['batchNo']),
        expiry: strOrNull(data['expiry']),
      },
    ]
  })
}

function receiptView(payload: Rec, nameOf: NameOf): Partial<UnsentView> {
  const draft = isRec(payload['draft']) ? payload['draft'] : {}
  const supplier = str(draft['supplier'])
  const deliveryNo = str(draft['deliveryNo'])
  return {
    kind: 'receipt',
    title: `استلام ${supplier || 'من غير شركة'}`,
    subtitle: deliveryNo ? `إذن ${deliveryNo}` : 'من غير رقم إذن',
    businessDate: str(draft['businessDate']),
    lines: linesOf(payload['batch'], nameOf),
  }
}

function issueView(payload: Rec, nameOf: NameOf): Partial<UnsentView> {
  const draft = isRec(payload['draft']) ? payload['draft'] : {}
  const rep = str(draft['rep'])
  return {
    kind: 'issue',
    title: `دفعة صرف ${num(draft['number']) || ''}`.trim(),
    subtitle: rep || 'من غير مندوب',
    businessDate: str(draft['businessDate']),
    lines: linesOf(payload['batch'], nameOf),
  }
}

/** A readable summary of an outbox entry; unknown kinds and broken payloads still show up. */
export function describeUnsent(entry: OutboxEntry, nameOf: NameOf = (c) => c): UnsentView {
  const payload = isRec(entry.payload) ? entry.payload : {}
  const specific =
    entry.kind === RECEIPT_POST_KIND
      ? receiptView(payload, nameOf)
      : entry.kind === ISSUE_POST_KIND
        ? issueView(payload, nameOf)
        : {}
  return {
    id: entry.id,
    kind: 'unknown',
    title: 'مستند مش معروف',
    subtitle: entry.kind,
    businessDate: '',
    lines: [],
    ...specific,
    status: entry.status,
    error: entry.error,
    createdAt: entry.createdAt,
  }
}

/** Failed entries first (they need a person), then the ones still waiting for the network. */
export function sortUnsent(views: readonly UnsentView[]): UnsentView[] {
  const rank = (v: UnsentView): number => (v.status === 'failed' ? 0 : 1)
  return [...views].sort((a, b) => rank(a) - rank(b) || a.createdAt - b.createdAt)
}

export type RebuiltPost =
  | { readonly kind: 'receipt'; readonly plan: CommitPlan }
  | { readonly kind: 'issue'; readonly plan: IssueCommitPlan }

/** Rebuilds the atomic write from the stored payload, or null when the payload is unreadable. */
export function rebuildPost(entry: OutboxEntry): RebuiltPost | null {
  const payload = entry.payload
  if (!isRec(payload) || !isRec(payload['draft']) || !isRec(payload['batch'])) return null
  if (!Array.isArray(payload['batch']['movements'])) return null
  // The stored value is the very object the post built; the shape is checked above.
  if (entry.kind === RECEIPT_POST_KIND) {
    const draft = payload['draft'] as unknown as Parameters<typeof receiptDraftDoc>[0]
    const batch = payload['batch'] as unknown as Parameters<typeof buildWrites>[1]
    const plan: CommitPlan = {
      receiptId: entry.id,
      draftDoc: receiptDraftDoc(draft),
      writes: buildWrites(entry.id, batch),
    }
    return { kind: 'receipt', plan }
  }
  if (entry.kind === ISSUE_POST_KIND) {
    const draft = payload['draft'] as unknown as Parameters<typeof issueDraftDoc>[0]
    const batch = payload['batch'] as unknown as Parameters<typeof buildIssueWrites>[1]
    const plan: IssueCommitPlan = {
      batchId: entry.id,
      draftDoc: issueDraftDoc(draft),
      writes: buildIssueWrites(entry.id, batch),
    }
    return { kind: 'issue', plan }
  }
  return null
}

export interface RetryDeps {
  readonly outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>
  readonly commitReceipt: (plan: CommitPlan) => Promise<void>
  readonly commitIssue: (plan: IssueCommitPlan) => Promise<void>
  readonly checkReceipt: ServerCheck
  readonly checkIssue: ServerCheck
}

export type RetryResult =
  | { readonly ok: false }
  /** `outcome` settles when the server answers; never while offline, never rejects. */
  | { readonly ok: true; readonly outcome: Promise<PostOutcome> }

/**
 * Sends a stored post again. The entry goes back to pending first, so the pill stops being red
 * until the server answers; a second rejection fails it again and keeps the payload.
 */
export async function retryUnsent(entry: OutboxEntry, deps: RetryDeps): Promise<RetryResult> {
  const rebuilt = rebuildPost(entry)
  if (!rebuilt) return { ok: false }
  await deps.outbox.put({ id: entry.id, kind: entry.kind, payload: entry.payload })
  const outcome =
    rebuilt.kind === 'receipt'
      ? settlePost(entry.id, rebuilt.plan, {
          outbox: deps.outbox,
          commit: deps.commitReceipt,
          checkServer: deps.checkReceipt,
        })
      : settlePost(entry.id, rebuilt.plan, {
          outbox: deps.outbox,
          commit: deps.commitIssue,
          checkServer: deps.checkIssue,
        })
  return { ok: true, outcome }
}
