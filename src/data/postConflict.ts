/**
 * A post that the server rejects is normally "already there": this device's post landed before
 * the app closed, or was sent twice. But the same document can also have been posted from another
 * device with other lines (both worked on the same draft). Clearing the entry then would drop this
 * device's lines silently. These helpers tell the two apart by comparing what the server holds
 * with what this device meant to post.
 */

export class PostConflictError extends Error {
  constructor() {
    super(
      'المستند ده اتعتمد قبل كده من جهاز تاني بسطور مختلفة. السطور اللي على الجهاز ده محفوظة هنا ومتسجّلتش.',
    )
    this.name = 'PostConflictError'
  }
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const orNull = (v: unknown): unknown => (v === undefined ? null : v)

/**
 * The lines this device meant to post, from either shape it has at hand: the commit plan
 * (`draftDoc.lines`) while posting or retrying, the stored payload (`draft.lines`) after a restart.
 */
export function expectedLines(source: unknown, key: 'lines' | 'issued'): readonly unknown[] | null {
  if (!isRec(source)) return null
  for (const holder of [source['draftDoc'], source['draft']]) {
    if (isRec(holder) && Array.isArray(holder[key])) return holder[key]
  }
  return null
}

function signature(lines: unknown, pick: (l: Rec) => unknown[]): string {
  if (!Array.isArray(lines)) return '[]'
  const rows = lines.filter(isRec).map(pick)
  rows.sort((a, b) => Number(a[0]) - Number(b[0]))
  return JSON.stringify(rows)
}

/** What a receipt post writes: a movement per line that counted something. */
const receiptRow = (l: Rec): unknown[] => [
  l['n'],
  orNull(l['itemCode']),
  l['countedQty'],
  orNull(l['batchNo']),
  orNull(l['expiry']),
  l['priceMinor'],
]

/** What an issue post writes: a movement per issued line. */
const issueRow = (l: Rec): unknown[] => [
  l['n'],
  orNull(l['itemCode']),
  l['qty'],
  orNull(l['batchNo']),
  orNull(l['expiry']),
  orNull(l['forItemCode']),
]

const counted = (l: unknown): boolean => isRec(l) && Number(l['countedQty']) > 0

/** True when the server's receipt lines write the same movements as the ones this device posts. */
export function sameReceiptPost(serverLines: unknown, mine: readonly unknown[]): boolean {
  const onlyCounted = (v: unknown): unknown => (Array.isArray(v) ? v.filter(counted) : v)
  return (
    signature(onlyCounted(serverLines), receiptRow) === signature(onlyCounted(mine), receiptRow)
  )
}

/** True when the server's issued lines write the same movements as the ones this device posts. */
export function sameIssuePost(serverIssued: unknown, mine: readonly unknown[]): boolean {
  return signature(serverIssued, issueRow) === signature(mine, issueRow)
}
