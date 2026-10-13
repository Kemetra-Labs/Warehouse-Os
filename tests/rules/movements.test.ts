// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
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
import {
  createEnv,
  ownerDb,
  validIssueBatch,
  validItem,
  validMovement,
  validReceipt,
} from './helpers'

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

describe('rules test 5b: a cancel is one atomic batch', () => {
  const POSTED_AT = Timestamp.fromMillis(1_700_000_000_000)

  const reversal = (original: string, over: Record<string, unknown> = {}) =>
    validMovement({
      type: 'تسوية',
      qty: -5,
      reverses: original,
      reason: 'استلام بالغلط',
      source: { kind: 'receipt', id: 'doc1' },
      ...over,
    })

  const posted = (make: typeof validReceipt): Record<string, unknown> =>
    make({ status: 'posted', postedAt: POSTED_AT })

  /** Starts from a posted document with two line movements, with the rules off. */
  async function seedPosted(col: string, make: typeof validReceipt): Promise<void> {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const db = ctx.firestore()
      const kind = col === 'receipts' ? 'receipt' : 'issue'
      await setDoc(doc(db, `${col}/doc1`), posted(make))
      await setDoc(doc(db, 'items/SCR-01'), validItem('SCR-01', { priceMinor: 12550 }))
      for (const n of [1, 2]) {
        await setDoc(
          doc(db, `movements/doc1-L${n}`),
          validMovement({ source: { kind, id: 'doc1' }, postedAt: POSTED_AT }),
        )
      }
    })
  }

  const cancelPatch = { status: 'cancelled', cancelReason: 'استلام بالغلط' }

  const cancelBatch = (db: ReturnType<typeof ownerDb>, col: string, lines: readonly number[]) => {
    const batch = writeBatch(db)
    const kind = col === 'receipts' ? 'receipt' : 'issue'
    for (const n of lines) {
      batch.set(
        doc(db, `movements/rev-doc1-L${n}`),
        reversal(`doc1-L${n}`, { source: { kind, id: 'doc1' } }),
      )
    }
    batch.update(doc(db, `${col}/doc1`), { ...cancelPatch, cancelledAt: serverTimestamp() })
    return batch
  }

  async function exists(path: string): Promise<boolean> {
    let found = false
    await env.withSecurityRulesDisabled(async (ctx) => {
      found = (await getDoc(doc(ctx.firestore(), path))).exists()
    })
    return found
  }

  describe.each([
    ['receipts', validReceipt],
    ['issueBatches', validIssueBatch],
  ] as const)('%s', (col, make) => {
    it('accepts the reversals and the posted -> cancelled update together', async () => {
      await seedPosted(col, make)
      await assertSucceeds(cancelBatch(ownerDb(env), col, [1, 2]).commit())
      expect(await exists('movements/rev-doc1-L1')).toBe(true)
      expect(await exists('movements/rev-doc1-L2')).toBe(true)
    })

    it('refuses a second cancel as a whole: no new reversal is written either', async () => {
      await seedPosted(col, make)
      await assertSucceeds(cancelBatch(ownerDb(env), col, [1]).commit())
      // Line 2 was never reversed, yet the document is already cancelled: the batch must fail.
      await assertFails(cancelBatch(ownerDb(env), col, [2]).commit())
      expect(await exists('movements/rev-doc1-L2')).toBe(false)
      // And so must the very same batch again.
      await assertFails(cancelBatch(ownerDb(env), col, [1]).commit())
    })

    it('fails as a whole when one reversal has no reason: the document stays posted', async () => {
      await seedPosted(col, make)
      const db = ownerDb(env)
      const batch = writeBatch(db)
      batch.set(doc(db, 'movements/rev-doc1-L1'), reversal('doc1-L1', { reason: '' }))
      batch.update(doc(db, `${col}/doc1`), { ...cancelPatch, cancelledAt: serverTimestamp() })
      await assertFails(batch.commit())
      expect(await exists('movements/rev-doc1-L1')).toBe(false)
      await env.withSecurityRulesDisabled(async (ctx) => {
        const snap = await getDoc(doc(ctx.firestore(), `${col}/doc1`))
        expect(snap.get('status')).toBe('posted')
      })
    })

    it('fails when the document is not posted (a draft cannot be cancelled)', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), `${col}/doc1`), make())
      })
      await assertFails(cancelBatch(ownerDb(env), col, [1]).commit())
      expect(await exists('movements/rev-doc1-L1')).toBe(false)
    })
  })

  it('accepts the price restore in the same cancel batch (receipt)', async () => {
    await seedPosted('receipts', validReceipt)
    const db = ownerDb(env)
    const batch = cancelBatch(db, 'receipts', [1, 2])
    batch.update(doc(db, 'items/SCR-01'), { priceMinor: 12000, updatedAt: serverTimestamp() })
    await assertSucceeds(batch.commit())
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'items/SCR-01'))
      expect(snap.get('priceMinor')).toBe(12000)
    })
  })

  it('rejects a rev- movement that is not a تسوية', async () => {
    const db = ownerDb(env)
    for (const type of ['إضافة', 'صرف', 'مرتجع']) {
      await assertFails(
        setDoc(doc(db, 'movements/rev-imp-r12'), reversal('imp-r12', { type, qty: 5 })),
      )
    }
  })

  it('rejects `reverses` on a movement whose id is not rev-{original}', async () => {
    const db = ownerDb(env)
    // A stray adjustment must not be able to strike another movement out of the history.
    await assertFails(
      setDoc(
        doc(db, 'movements/m1'),
        validMovement({ type: 'تسوية', qty: -1, reverses: 'imp-r12' }),
      ),
    )
    await assertFails(
      setDoc(
        doc(db, 'movements/m2'),
        validMovement({ type: 'مرتجع', qty: 1, reverses: 'imp-r12' }),
      ),
    )
    await assertSucceeds(setDoc(doc(db, 'movements/m3'), validMovement({ reverses: null })))
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
      seed.set(doc(ctx.firestore(), 'receipts/doc1'), validReceipt())
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
    batch.update(doc(db, 'receipts/doc1'), {
      status: 'posted',
      postedAt: serverTimestamp(),
    })
    await assertSucceeds(batch.commit())
  })
})
