import { useEffect, useRef, useState } from 'react'
import type { IssueDraft } from '../../domain/issue'
import {
  joinRequest,
  requestProblem,
  stepApprove,
  stepPick,
  type OpenRequest,
} from '../../domain/issueRequest'
import type { StockView } from '../../domain/issueStock'
import { interpretClass } from '../../domain/receiveScan'
import type { SearchClass } from '../../domain/search'
import type { Item } from '../../domain/types'

export interface IssueRequestInput {
  readonly draft: IssueDraft
  readonly items: readonly Item[]
  readonly stock: StockView
  readonly onChange: (draft: IssueDraft) => void
}

export interface IssueRequestFlow {
  /** The line being filled in. It joins the batch by itself once it is ready and the next item, or the approval, comes. */
  readonly open: OpenRequest | null
  /** Changes whenever a different line is opened, so its card can start fresh for it. */
  readonly openKey: number
  /** What the open line still needs before it can join; null when it is ready. */
  readonly problem: string | null
  /** The batch as it will read once the open line (when it is ready) has joined. */
  readonly withOpen: IssueDraft
  readonly notice: string | null
  /** Items to choose from after an ambiguous search; null when no choice is open. */
  readonly choices: readonly Item[] | null
  onSearch(cls: SearchClass): void
  pick(item: Item): void
  setQty(qty: number): void
  /** The quantity field now holds a whole number (true) or text that is not one (false). */
  setQtyValid(valid: boolean): void
  discard(): void
  /** The batch with the open line joined, or null (with a notice) while the line is not ready. */
  approve(): IssueDraft | null
  closeChoices(): void
}

const busyNotice = (problem: string): string =>
  `كمّل الصنف المفتوح الأول: ${problem}. وبعدين اختار الصنف اللي بعده.`
const approveNotice = (problem: string): string =>
  `كمّل الصنف المفتوح الأول: ${problem}. أو امسحه وكمّل للاعتماد.`
const notFound = (query: string): string => `مفيش صنف بالرقم أو الاسم ده (${query})`

/**
 * The state of the open line on the issue screen: what a search pick does to the batch. A ready
 * line joins on its own with the next item, with the approval, when the screen is left, or when
 * the app goes to the background. A line that is not ready never joins: it stays open and says
 * what it still needs.
 */
export function useIssueRequest(input: IssueRequestInput): IssueRequestFlow {
  const { draft, items, stock, onChange } = input
  const [open, setOpen] = useState<OpenRequest | null>(null)
  // Text that is not a whole number commits nothing, so `open.qty` keeps the last good value;
  // while this is false the line counts as having no quantity and never joins.
  const [qtyValid, setQtyValid] = useState(true)
  const [openKey, setOpenKey] = useState(0)
  const [notice, setNotice] = useState<string | null>(null)
  const [choices, setChoices] = useState<readonly Item[] | null>(null)

  /** The last rendered batch and open line: leaving the screen comes after the last render. */
  const current = open && !qtyValid ? { ...open, qty: Number.NaN } : open
  const latest = useRef({ draft, open: current, stock, onChange })
  useEffect(() => {
    latest.current = { draft, open: current, stock, onChange }
  })

  // The card calls a ready line "it will be added", so leaving the screen (a nav tab, back) or
  // the app going to the background joins it, as the next pick would. A line that is not ready
  // stays out: it was never shown as added.
  useEffect(() => {
    const keepReady = (): void => {
      const { draft: d, open: o, stock: s, onChange: save } = latest.current
      const joined = o ? joinRequest(d, o, s) : null
      if (!joined) return
      latest.current = { draft: joined, open: null, stock: s, onChange: save }
      save(joined)
      setOpen(null)
    }
    const onHidden = (): void => {
      if (document.visibilityState === 'hidden') keepReady()
    }
    document.addEventListener('visibilitychange', onHidden)
    return () => {
      document.removeEventListener('visibilitychange', onHidden)
      keepReady()
    }
  }, [])

  const problem = current ? requestProblem(current) : null
  const withOpen =
    (current && problem === null ? joinRequest(draft, current, stock) : null) ?? draft

  const pick = (item: Item): void => {
    const step = stepPick(draft, current, item, stock)
    setNotice(null)
    if (step.kind === 'refused') return setNotice(step.problem)
    if (step.kind === 'busy') return setNotice(busyNotice(step.problem))
    if (step.draft !== draft) onChange(step.draft)
    if (open === null || step.joined) setOpenKey((k) => k + 1)
    setQtyValid(true)
    setOpen(step.open)
  }

  return {
    open,
    openKey,
    problem,
    withOpen,
    notice,
    choices,
    onSearch(cls) {
      const outcome = interpretClass(items, cls, 'typed')
      if (outcome.kind === 'item') return pick(outcome.item)
      if (outcome.kind === 'choose') return setChoices(outcome.items)
      setNotice(notFound(outcome.kind === 'not-found' ? outcome.query : 'باركود'))
    },
    pick,
    setQty: (qty) => setOpen((o) => (o ? { ...o, qty } : o)),
    setQtyValid,
    discard() {
      setQtyValid(true)
      setOpen(null)
    },
    approve() {
      const step = stepApprove(draft, current, stock)
      if (step.kind === 'blocked') {
        setNotice(approveNotice(step.problem))
        return null
      }
      if (current) {
        onChange(step.draft)
        setQtyValid(true)
        setOpen(null)
        // The screen may unmount in this same render: the leaving effect must not join it again.
        latest.current = { draft: step.draft, open: null, stock, onChange }
      }
      return step.draft
    },
    closeChoices: () => setChoices(null),
  }
}
