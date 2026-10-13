import { describe, expect, it } from 'vitest'
import { coverage } from '../../../src/domain/issue'
import {
  joinRequest,
  requestProblem,
  startRequest,
  stepApprove,
  stepPick,
  type OpenRequest,
} from '../../../src/domain/issueRequest'
import { addRequested } from '../../../src/domain/issueEdit'
import { draftOf, priced, stockOf } from '../../helpers/issueFixtures'

const SCR = priced('SCR-01', 120_000, { page: 10, nameAr: 'مسمار قشري' })
const NAL = priced('NAL-01', 289_570, { page: 8, nameAr: 'نخاعي للفخذ' })
const OLD = priced('OLD-01', 1_000, { page: 30, nameAr: 'صنف موقوف', active: false })

const stock = stockOf([
  { code: 'SCR-01', qty: 30, batchNo: 'S1', expiry: '2029-01' },
  { code: 'NAL-01', qty: 4, batchNo: 'N1', expiry: '2028-01' },
  { code: 'OLD-01', qty: 4, batchNo: 'O1', expiry: '2028-01' },
])

const empty = () => draftOf({ permits: [] })
const open = (item = SCR, qty = 1): OpenRequest => ({ item, qty })

describe('requestProblem: what an open line still needs', () => {
  it('is ready with a whole quantity above zero', () => {
    expect(requestProblem(open(SCR, 3))).toBeNull()
  })

  it.each([0, -2, 1.5, Number.NaN])('asks for the quantity when it is %s', (qty) => {
    expect(requestProblem(open(SCR, qty))).toBe('اكتب الكمية المطلوبة')
  })

  it('refuses an item that is stopped', () => {
    expect(requestProblem(open(OLD, 1))).toBe('الصنف ده موقوف. مينفعش يتصرف.')
  })
})

describe('startRequest', () => {
  it('opens a line for one piece', () => {
    expect(startRequest(SCR)).toEqual({ item: SCR, qty: 1 })
  })
})

describe('joinRequest: a ready line joins the batch', () => {
  it('adds the requested line and issues it from stock', () => {
    const joined = joinRequest(empty(), open(SCR, 3), stock)
    expect(joined?.requested).toEqual([{ itemCode: 'SCR-01', qty: 3, priceMinor: 120_000 }])
    expect(joined?.issued.map((l) => [l.itemCode, l.qty, l.batchNo])).toEqual([['SCR-01', 3, 'S1']])
  })

  it('a second permit of the same item adds to the one line (FR-041)', () => {
    const first = addRequested(empty(), SCR, 3, stock)
    expect(joinRequest(first, open(SCR, 2), stock)?.requested[0]?.qty).toBe(5)
  })

  it('does not change the draft it was given', () => {
    const draft = empty()
    joinRequest(draft, open(SCR, 3), stock)
    expect(draft.requested).toEqual([])
  })

  it('an unready line does not join', () => {
    expect(joinRequest(empty(), open(SCR, 0), stock)).toBeNull()
    expect(joinRequest(empty(), open(OLD, 1), stock)).toBeNull()
  })

  it('a quantity beyond the stock still joins: the row then asks for a substitute or a reason', () => {
    const joined = joinRequest(empty(), open(NAL, 6), stock)
    expect(joined).not.toBeNull()
    expect(coverage(joined ?? empty())[0]).toMatchObject({ requestedQty: 6, shortQty: 2 })
  })
})

describe('stepPick: a scan, search pick or tap', () => {
  it('opens a line for the item when none is open', () => {
    const draft = empty()
    expect(stepPick(draft, null, SCR, stock)).toEqual({
      kind: 'step',
      draft,
      open: { item: SCR, qty: 1 },
      joined: false,
    })
  })

  it('the same item again counts one more on the open line', () => {
    const draft = empty()
    expect(stepPick(draft, open(SCR, 2), SCR, stock)).toEqual({
      kind: 'step',
      draft,
      open: { item: SCR, qty: 3 },
      joined: false,
    })
  })

  it('the same item on a quantity that is not a number is busy, not counted', () => {
    expect(stepPick(empty(), open(SCR, Number.NaN), SCR, stock)).toEqual({
      kind: 'busy',
      problem: 'اكتب الكمية المطلوبة',
    })
  })

  it('another item first finishes a ready open line, then opens the new one', () => {
    const step = stepPick(empty(), open(SCR, 3), NAL, stock)
    if (step.kind !== 'step') throw new Error('expected a step')
    expect(step.joined).toBe(true)
    expect(step.draft.requested).toEqual([{ itemCode: 'SCR-01', qty: 3, priceMinor: 120_000 }])
    expect(step.open).toEqual({ item: NAL, qty: 1 })
  })

  it('an unready open line never joins silently: it stays open and says what it needs', () => {
    const draft = empty()
    expect(stepPick(draft, open(SCR, 0), NAL, stock)).toEqual({
      kind: 'busy',
      problem: 'اكتب الكمية المطلوبة',
    })
  })

  it('a stopped item is refused and the open line is left alone', () => {
    expect(stepPick(empty(), open(SCR, 2), OLD, stock)).toEqual({
      kind: 'refused',
      problem: 'الصنف ده موقوف. مينفعش يتصرف.',
    })
    expect(stepPick(empty(), null, OLD, stock).kind).toBe('refused')
  })

  it('an item that is already requested opens a fresh line that adds to it on joining', () => {
    const draft = addRequested(empty(), SCR, 3, stock)
    const step = stepPick(draft, null, SCR, stock)
    if (step.kind !== 'step') throw new Error('expected a step')
    expect(step.open).toEqual({ item: SCR, qty: 1 })
    expect(step.draft).toBe(draft)
  })
})

describe('stepApprove: going on to approve takes a ready open line along', () => {
  it('without an open line the draft is as it was', () => {
    const draft = addRequested(empty(), SCR, 3, stock)
    expect(stepApprove(draft, null, stock)).toEqual({ kind: 'ok', draft })
  })

  it('a ready open line joins first', () => {
    const step = stepApprove(empty(), open(SCR, 4), stock)
    expect(step.kind).toBe('ok')
    if (step.kind === 'ok') expect(step.draft.requested[0]?.qty).toBe(4)
  })

  it('an unready open line blocks it and says why', () => {
    expect(stepApprove(empty(), open(SCR, 0), stock)).toEqual({
      kind: 'blocked',
      problem: 'اكتب الكمية المطلوبة',
    })
  })
})
