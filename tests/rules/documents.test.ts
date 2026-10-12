// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  Timestamp,
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { createEnv, ownerDb, validIssueBatch, validReceipt, validReceiptLine } from './helpers'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createEnv()
})
afterAll(async () => {
  await env.cleanup()
})
beforeEach(async () => {
  await env.clearFirestore()
})

type Factory = (over?: Record<string, unknown>) => Record<string, unknown>

const KINDS: ReadonlyArray<readonly [string, Factory]> = [
  ['receipts', validReceipt],
  ['issueBatches', validIssueBatch],
]

/** Writes a document with the rules disabled, to start a test from a known state. */
async function seed(path: string, data: Record<string, unknown>): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), path), data)
  })
}

const POSTED_AT = Timestamp.fromMillis(1_700_000_000_000)
const posted = (make: Factory): Record<string, unknown> =>
  make({ status: 'posted', postedAt: POSTED_AT })

describe.each(KINDS)('rules tests 7 and 8: %s', (col, make) => {
  const path = `${col}/d1`

  it('lets the owner create only a draft, and read it back', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, path), make()))
    await assertSucceeds(getDoc(doc(db, path)))
    const asPosted = make({ status: 'posted', postedAt: serverTimestamp() })
    await assertFails(setDoc(doc(db, `${col}/d2`), asPosted))
    await assertFails(setDoc(doc(db, `${col}/d3`), make({ status: 'cancelled' })))
  })

  it('rejects a bad shape on create: unknown key, wrong type, missing key', async () => {
    const db = ownerDb(env)
    await assertFails(setDoc(doc(db, `${col}/a`), make({ extra: 1 })))
    await assertFails(setDoc(doc(db, `${col}/b`), make({ businessDate: '1/10/2026' })))
    const listKey = col === 'receipts' ? 'lines' : 'issued'
    await assertFails(setDoc(doc(db, `${col}/c`), make({ [listKey]: 'x' })))
    const missing = make()
    delete missing.status
    await assertFails(setDoc(doc(db, `${col}/d`), missing))
  })

  it('lets a draft be edited and stay a draft', async () => {
    await seed(path, make())
    await assertSucceeds(updateDoc(doc(ownerDb(env), path), { businessDate: '2026-10-02' }))
  })

  it('lets a draft become posted only with postedAt == request.time', async () => {
    const db = ownerDb(env)
    await seed(path, make())
    await assertFails(updateDoc(doc(db, path), { status: 'posted' }))
    await assertFails(updateDoc(doc(db, path), { status: 'posted', postedAt: POSTED_AT }))
    await assertSucceeds(
      updateDoc(doc(db, path), { status: 'posted', postedAt: serverTimestamp() }),
    )
  })

  it('does not let a draft jump straight to cancelled', async () => {
    await seed(path, make())
    await assertFails(
      updateDoc(doc(ownerDb(env), path), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelReason: 'خطأ',
      }),
    )
  })

  it('freezes a posted document: no edit, no second post', async () => {
    const db = ownerDb(env)
    await seed(path, posted(make))
    await assertFails(updateDoc(doc(db, path), { businessDate: '2026-10-02' }))
    await assertFails(updateDoc(doc(db, path), { status: 'posted', postedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, path), { status: 'posted', cancelReason: 'x' }))
  })

  it('rejects posted -> draft, and a delete after that attempted downgrade', async () => {
    const db = ownerDb(env)
    await seed(path, posted(make))
    await assertFails(updateDoc(doc(db, path), { status: 'draft', postedAt: null }))
    await assertFails(deleteDoc(doc(db, path)))
  })

  it('allows posted -> cancelled with status, cancelledAt == request.time and a reason', async () => {
    await seed(path, posted(make))
    await assertSucceeds(
      updateDoc(doc(ownerDb(env), path), {
        status: 'cancelled',
        cancelledAt: serverTimestamp(),
        cancelReason: 'تم الاستلام بالخطأ',
      }),
    )
  })

  it('rejects cancelling without a reason, with a wrong time, or touching a fourth key', async () => {
    const db = ownerDb(env)
    await seed(path, posted(make))
    const now = serverTimestamp()
    await assertFails(
      updateDoc(doc(db, path), { status: 'cancelled', cancelledAt: now, cancelReason: '' }),
    )
    await assertFails(updateDoc(doc(db, path), { status: 'cancelled', cancelledAt: now }))
    await assertFails(
      updateDoc(doc(db, path), { status: 'cancelled', cancelledAt: POSTED_AT, cancelReason: 'x' }),
    )
    await assertFails(
      updateDoc(doc(db, path), {
        status: 'cancelled',
        cancelledAt: now,
        cancelReason: 'x',
        businessDate: '2026-10-09',
      }),
    )
  })

  it('freezes a cancelled document and refuses to delete it', async () => {
    const db = ownerDb(env)
    await seed(
      path,
      make({
        status: 'cancelled',
        postedAt: POSTED_AT,
        cancelledAt: POSTED_AT,
        cancelReason: 'x',
      }),
    )
    await assertFails(updateDoc(doc(db, path), { cancelReason: 'y' }))
    await assertFails(updateDoc(doc(db, path), { status: 'posted', postedAt: serverTimestamp() }))
    await assertFails(updateDoc(doc(db, path), { status: 'draft' }))
    await assertFails(deleteDoc(doc(db, path)))
  })

  it('deletes drafts, but never posted documents', async () => {
    const db = ownerDb(env)
    await seed(path, make())
    await assertSucceeds(deleteDoc(doc(db, path)))
    await seed(`${col}/p1`, posted(make))
    await assertFails(deleteDoc(doc(db, `${col}/p1`)))
  })
})

describe('receipt lines', () => {
  it('accepts every line field of the contract (authorityCode, mfgDate, reasons)', async () => {
    const line = validReceiptLine({
      itemCode: null,
      scannedGtin: '6221234567890',
      authorityCode: '70000409',
      mfgDate: '2026-01-15',
      diffReason: 'نقص',
      expiredReason: 'قرب الانتهاء',
    })
    await assertSucceeds(setDoc(doc(ownerDb(env), 'receipts/r9'), validReceipt({ lines: [line] })))
  })

  it('accepts priceUpdates written at posting', async () => {
    await seed('receipts/r8', validReceipt())
    await assertSucceeds(
      updateDoc(doc(ownerDb(env), 'receipts/r8'), {
        status: 'posted',
        postedAt: serverTimestamp(),
        priceUpdates: [{ itemCode: 'SCR-01', fromMinor: 12000, toMinor: 12550 }],
      }),
    )
  })
})

describe('non-owners', () => {
  it('cannot touch documents', async () => {
    const other = env.authenticatedContext('someone-else').firestore()
    await seed('receipts/r7', validReceipt())
    await assertFails(getDoc(doc(other, 'receipts/r7')))
    await assertFails(setDoc(doc(other, 'receipts/r6'), validReceipt()))
    await assertFails(deleteDoc(doc(other, 'receipts/r7')))
  })
})
