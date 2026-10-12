// @vitest-environment node
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'
import { createEnv, ownerDb, validItem } from './helpers'

let env: RulesTestEnvironment

beforeAll(async () => {
  env = await createEnv()
})
afterAll(async () => {
  await env.cleanup()
})
beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'items/SCR-01'), { code: 'SCR-01', page: 1 })
    await setDoc(doc(db, 'movements/m1'), { qty: 1 })
    await setDoc(doc(db, 'receipts/r1'), { status: 'draft' })
    await setDoc(doc(db, 'issueBatches/b1'), { status: 'draft' })
    await setDoc(doc(db, 'settings/app'), { coverageMonths: 1.5 })
  })
})

const PATHS = [
  'items/SCR-01',
  'movements/m1',
  'receipts/r1',
  'issueBatches/b1',
  'settings/app',
  'other/x',
]

describe('rules test 1: signed out', () => {
  it.each(PATHS)('denies read, write and delete on %s', async (path) => {
    const db = env.unauthenticatedContext().firestore()
    await assertFails(getDoc(doc(db, path)))
    await assertFails(setDoc(doc(db, `${path}-new`), { a: 1 }))
    await assertFails(updateDoc(doc(db, path), { a: 1 }))
    await assertFails(deleteDoc(doc(db, path)))
  })
})

describe('rules test 2: signed-in non-owner', () => {
  it.each(PATHS)('denies read, write and delete on %s', async (path) => {
    const db = env.authenticatedContext('someone-else').firestore()
    await assertFails(getDoc(doc(db, path)))
    await assertFails(setDoc(doc(db, `${path}-new`), { a: 1 }))
    await assertFails(updateDoc(doc(db, path), { a: 1 }))
    await assertFails(deleteDoc(doc(db, path)))
  })

  it('denies a non-owner creating an otherwise valid item', async () => {
    const db = env.authenticatedContext('someone-else').firestore()
    await assertFails(setDoc(doc(db, 'items/SCR-09'), validItem('SCR-09')))
  })
})

describe('owner access', () => {
  it('can read items, movements and settings', async () => {
    const db = ownerDb(env)
    await assertSucceeds(getDoc(doc(db, 'items/SCR-01')))
    await assertSucceeds(getDoc(doc(db, 'movements/m1')))
    await assertSucceeds(getDoc(doc(db, 'settings/app')))
  })

  it('cannot touch unlisted collections', async () => {
    await assertFails(getDoc(doc(ownerDb(env), 'other/x')))
    await assertFails(setDoc(doc(ownerDb(env), 'other/y'), { a: 1 }))
  })
})

describe('rules test 9: items', () => {
  it('owner can create a valid item and edit it', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'items/SCR-02'), validItem('SCR-02', { page: 2 })))
    await assertSucceeds(updateDoc(doc(db, 'items/SCR-02'), { priceMinor: 20000 }))
  })

  it('rejects an item whose code differs from its id, page 0, or negative price', async () => {
    const db = ownerDb(env)
    await assertFails(setDoc(doc(db, 'items/SCR-03'), validItem('SCR-04')))
    await assertFails(setDoc(doc(db, 'items/SCR-03'), validItem('SCR-03', { page: 0 })))
    await assertFails(setDoc(doc(db, 'items/SCR-03'), validItem('SCR-03', { priceMinor: -1 })))
  })

  it('cannot delete an item', async () => {
    await assertFails(deleteDoc(doc(ownerDb(env), 'items/SCR-01')))
  })

  it('cannot change the code of an item', async () => {
    const db = ownerDb(env)
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'items/SCR-05'), validItem('SCR-05', { page: 5 }))
    })
    await assertFails(updateDoc(doc(db, 'items/SCR-05'), { code: 'SCR-06' }))
    await assertSucceeds(updateDoc(doc(db, 'items/SCR-05'), { active: false }))
  })
})

describe('settings', () => {
  it('owner can create and update settings/app but not delete it', async () => {
    const db = ownerDb(env)
    await assertSucceeds(setDoc(doc(db, 'settings/app'), { coverageMonths: 2 }))
    await assertSucceeds(updateDoc(doc(db, 'settings/app'), { defaultReorder: 6 }))
    await assertFails(deleteDoc(doc(db, 'settings/app')))
  })

  it('owner cannot write other settings documents', async () => {
    await assertFails(setDoc(doc(ownerDb(env), 'settings/other'), { a: 1 }))
  })
})

describe('receipts and issueBatches placeholders', () => {
  it('stay deny-all until T047', async () => {
    const db = ownerDb(env)
    await assertFails(getDoc(doc(db, 'receipts/r1')))
    await assertFails(setDoc(doc(db, 'issueBatches/b2'), { status: 'draft' }))
  })
})
