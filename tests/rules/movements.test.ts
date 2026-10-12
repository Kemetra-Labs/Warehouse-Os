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
  writeBatch,
} from 'firebase/firestore'
import { createEnv, ownerDb, validItem, validMovement } from './helpers'

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

describe('rules test 3: movements are create-only', () => {
  it('owner can create a valid movement and read it back', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'movements/m1'), validMovement()))
    await assertSucceeds(getDoc(doc(db, 'movements/m1')))
  })

  it('cannot update a movement', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'movements/m1'), validMovement()))
    await assertFails(updateDoc(doc(db, 'movements/m1'), { note: 'edited' }))
  })

  it('cannot delete a movement', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'movements/m1'), validMovement()))
    await assertFails(deleteDoc(doc(db, 'movements/m1')))
  })
})

describe('rules test 4: deterministic IDs', () => {
  it('rejects creating imp-r12 twice', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'movements/imp-r12'), validMovement()))
    await assertFails(setDoc(doc(db, 'movements/imp-r12'), validMovement()))
  })
})

describe('rules test 5: reversals', () => {
  const rev = (over: Record<string, unknown> = {}) =>
    validMovement({
      type: 'تسوية',
      qty: -5,
      reverses: 'imp-r12',
      reason: 'خطأ في الإدخال',
      source: { kind: 'manual', id: null },
      ...over,
    })

  it('accepts a well-formed rev- movement once, then rejects a second', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'movements/rev-imp-r12'), rev()))
    await assertFails(setDoc(doc(db, 'movements/rev-imp-r12'), rev()))
  })

  it('rejects an empty reason or a missing reason', async () => {
    const db = ownerDb(env)
    await assertFails(setDoc(doc(db, 'movements/rev-imp-r12'), rev({ reason: '' })))
    await assertFails(setDoc(doc(db, 'movements/rev-imp-r12'), rev({ reason: null })))
  })

  it('rejects reverses that does not match the id', async () => {
    const db = ownerDb(env)
    await assertFails(setDoc(doc(db, 'movements/rev-imp-r12'), rev({ reverses: 'imp-r13' })))
    await assertFails(setDoc(doc(db, 'movements/rev-imp-r12'), rev({ reverses: null })))
  })
})

describe('rules test 6: validation', () => {
  it('rejects qty 0', async () => {
    await assertFails(setDoc(doc(ownerDb(env), 'movements/m1'), validMovement({ qty: 0 })))
    await assertFails(
      setDoc(doc(ownerDb(env), 'movements/m2'), validMovement({ type: 'تسوية', qty: 0 })),
    )
  })

  it('rejects a negative qty on صرف, إضافة and مرتجع', async () => {
    const db = ownerDb(env)
    await assertFails(setDoc(doc(db, 'movements/m1'), validMovement({ type: 'صرف', qty: -2 })))
    await assertFails(setDoc(doc(db, 'movements/m2'), validMovement({ type: 'إضافة', qty: -2 })))
    await assertFails(setDoc(doc(db, 'movements/m3'), validMovement({ type: 'مرتجع', qty: -2 })))
  })

  it('accepts a positive صرف and a signed تسوية', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'movements/m1'), validMovement({ type: 'صرف', qty: 2 })))
    await assertSucceeds(setDoc(doc(db, 'movements/m2'), validMovement({ type: 'تسوية', qty: -3 })))
  })

  it('rejects a missing required field', async () => {
    const db = ownerDb(env)
    for (const key of [
      'type',
      'itemCode',
      'qty',
      'businessDate',
      'priceMinor',
      'source',
      'deviceId',
    ]) {
      const data = validMovement()
      delete data[key]
      await assertFails(setDoc(doc(db, `movements/missing-${key}`), data))
    }
  })

  it('rejects a postedAt that is not the request time', async () => {
    const db = ownerDb(env)
    await assertFails(
      setDoc(doc(db, 'movements/m1'), validMovement({ postedAt: Timestamp.fromMillis(1000) })),
    )
    await assertFails(setDoc(doc(db, 'movements/m2'), validMovement({ postedAt: Timestamp.now() })))
  })

  it('rejects an unknown type, an unknown field, a bad date and a wrong createdBy', async () => {
    const db = ownerDb(env)
    await assertFails(setDoc(doc(db, 'movements/a'), validMovement({ type: 'خطأ' })))
    await assertFails(setDoc(doc(db, 'movements/b'), validMovement({ extra: 1 })))
    await assertFails(setDoc(doc(db, 'movements/c'), validMovement({ businessDate: '1/10/2026' })))
    await assertFails(setDoc(doc(db, 'movements/d'), validMovement({ createdBy: 'someone' })))
    await assertFails(setDoc(doc(db, 'movements/e'), validMovement({ qty: 1.5 })))
  })
})

describe('rules test 10: batch budget (no exists/get calls)', () => {
  it('accepts one batched write of 450 valid movement creates', async () => {
    const db = ownerDb(env)
    const batch = writeBatch(db)
    for (let row = 1; row <= 450; row += 1) {
      batch.set(
        doc(db, `movements/imp-r${row}`),
        validMovement({ source: { kind: 'import', id: null, row } }),
      )
    }
    await assertSucceeds(batch.commit())
  })

  it('accepts a 30-line posting: 30 movements + 1 document update + 30 item updates', async () => {
    const db = ownerDb(env)
    await env.withSecurityRulesDisabled(async (ctx) => {
      const seed = writeBatch(ctx.firestore())
      for (let n = 1; n <= 30; n += 1) {
        const code = `SCR-${String(n).padStart(2, '0')}`
        seed.set(doc(ctx.firestore(), `items/${code}`), validItem(code, { page: n }))
      }
      // receipts are deny-all until T047, so the "1 document update" uses settings/app
      seed.set(doc(ctx.firestore(), 'settings/app'), { coverageMonths: 1.5 })
      await seed.commit()
    })

    const batch = writeBatch(db)
    for (let n = 1; n <= 30; n += 1) {
      const code = `SCR-${String(n).padStart(2, '0')}`
      batch.set(
        doc(db, `movements/doc1-L${n}`),
        validMovement({ itemCode: code, source: { kind: 'receipt', id: 'doc1' } }),
      )
      batch.update(doc(db, `items/${code}`), {
        priceMinor: 13000 + n,
        updatedAt: serverTimestamp(),
      })
    }
    batch.update(doc(db, 'settings/app'), { defaultReorder: 6 })
    await assertSucceeds(batch.commit())
  })
})
