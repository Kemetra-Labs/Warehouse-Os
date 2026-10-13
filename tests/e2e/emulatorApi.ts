import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { APIRequestContext } from '@playwright/test'

/**
 * Talks to the local Firebase emulators over REST, as the emulator's admin (`Bearer owner`
 * skips the security rules). Used by the emulator-gated E2E tests to seed data and to read back
 * what the app wrote. Nothing here ships in the app.
 */
const FIRESTORE = 'http://localhost:8081'
const AUTH = 'http://localhost:9099'
const ADMIN = { Authorization: 'Bearer owner' }

type Json = Record<string, unknown>

export function projectId(): string {
  const file = resolve(import.meta.dirname, '..', '..', '.env.local')
  try {
    const m = /^\s*VITE_FIREBASE_PROJECT_ID\s*=\s*(.+?)\s*$/m.exec(readFileSync(file, 'utf8'))
    if (m?.[1]) return m[1].replace(/^["']|["']$/g, '')
  } catch {
    // No .env.local: the default demo project below.
  }
  return 'demo-warehouse-os'
}

/**
 * The project the Auth emulator itself runs under (`.firebaserc`). The sign-in popup lists the
 * accounts of this project, which may differ from VITE_FIREBASE_PROJECT_ID that the SDK sends.
 */
function authProjectId(): string {
  try {
    const rc = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '..', '..', '.firebaserc'), 'utf8'),
    ) as {
      projects?: { default?: string }
    }
    if (rc.projects?.default) return rc.projects.default
  } catch {
    // No .firebaserc: fall back to the app's project.
  }
  return projectId()
}

const docsUrl = (): string =>
  `${FIRESTORE}/v1/projects/${projectId()}/databases/(default)/documents`

export interface SeedItem {
  readonly code: string
  readonly page: number
  readonly nameAr: string
  readonly priceMinor: number
  readonly gtins?: readonly string[]
}

function itemFields(item: SeedItem): Json {
  return {
    code: { stringValue: item.code },
    page: { integerValue: String(item.page) },
    category: { stringValue: 'فئة اختبار' },
    nameAr: { stringValue: item.nameAr },
    nameEn: { stringValue: '' },
    material: { stringValue: '' },
    size: { stringValue: '' },
    unit: { stringValue: 'قطعة' },
    supplier: { stringValue: 'مورد اختبار' },
    gtins: { arrayValue: { values: (item.gtins ?? []).map((g) => ({ stringValue: g })) } },
    authorityCode: { nullValue: null },
    priceMinor: { integerValue: String(item.priceMinor) },
    reorderManual: { nullValue: null },
    active: { booleanValue: true },
    // The item schema parses `updatedAt` as an object: a timestamp is one.
    updatedAt: { timestampValue: new Date().toISOString() },
  }
}

/** Writes (or overwrites) items, so a re-run starts from the same prices and GTINs. */
export async function seedItems(request: APIRequestContext, items: readonly SeedItem[]) {
  for (const item of items) {
    const res = await request.patch(`${docsUrl()}/items/${item.code}`, {
      headers: ADMIN,
      data: { fields: itemFields(item) },
    })
    if (!res.ok())
      throw new Error(`seeding ${item.code} failed: ${res.status()} ${await res.text()}`)
  }
}

/** Creates the owner account with the uid the emulator rules were rendered for. Idempotent. */
export async function ensureOwnerAccount(request: APIRequestContext, uid: string): Promise<void> {
  const res = await request.post(
    `${AUTH}/identitytoolkit.googleapis.com/v1/projects/${authProjectId()}/accounts:batchCreate`,
    {
      headers: ADMIN,
      data: {
        users: [
          {
            localId: uid,
            email: 'owner@example.test',
            displayName: uid,
            emailVerified: true,
            providerUserInfo: [
              {
                providerId: 'google.com',
                rawId: `${uid}-google`,
                email: 'owner@example.test',
                displayName: uid,
              },
            ],
          },
        ],
      },
    },
  )
  if (!res.ok()) throw new Error(`creating ${uid} failed: ${res.status()} ${await res.text()}`)
}

type FieldValue = {
  stringValue?: string
  integerValue?: string
  arrayValue?: { values?: FieldValue[] }
}
export interface FirestoreDoc {
  readonly name: string
  readonly fields: Record<string, FieldValue>
}

/** The first document of `collection` whose `field` equals `value`, or null. */
export async function findDoc(
  request: APIRequestContext,
  collection: string,
  field: string,
  value: string,
): Promise<FirestoreDoc | null> {
  const res = await request.post(`${docsUrl()}:runQuery`, {
    headers: ADMIN,
    data: {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: {
          fieldFilter: { field: { fieldPath: field }, op: 'EQUAL', value: { stringValue: value } },
        },
        limit: 1,
      },
    },
  })
  const rows = (await res.json()) as { document?: FirestoreDoc }[]
  return rows[0]?.document ?? null
}

export async function getDocFields(
  request: APIRequestContext,
  path: string,
): Promise<FirestoreDoc['fields'] | null> {
  const res = await request.get(`${docsUrl()}/${path}`, { headers: ADMIN })
  if (res.status() === 404) return null
  return ((await res.json()) as FirestoreDoc).fields
}

export const idOf = (doc: FirestoreDoc): string => doc.name.split('/').pop() ?? ''
export const intOf = (v: FieldValue | undefined): number => Number(v?.integerValue ?? Number.NaN)
export const stringsOf = (v: FieldValue | undefined): string[] =>
  (v?.arrayValue?.values ?? []).map((x) => x.stringValue ?? '')
