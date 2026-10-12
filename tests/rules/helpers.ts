import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { serverTimestamp } from 'firebase/firestore'

export const OWNER_UID = 'test-owner'

export async function createEnv(): Promise<RulesTestEnvironment> {
  return initializeTestEnvironment({
    projectId: 'demo-warehouse',
    firestore: { rules: readFileSync(resolve(process.cwd(), 'firestore.rules'), 'utf8') },
  })
}

export function ownerDb(env: RulesTestEnvironment) {
  return env.authenticatedContext(OWNER_UID).firestore()
}

export function validMovement(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'إضافة',
    itemCode: 'SCR-01',
    qty: 5,
    businessDate: '2026-10-01',
    postedAt: serverTimestamp(),
    priceMinor: 12550,
    batchNo: null,
    expiry: null,
    docNumber: null,
    reference: null,
    note: null,
    supplier: null,
    source: { kind: 'import', id: null, row: 12 },
    substituteFor: null,
    reverses: null,
    reason: null,
    deviceId: 'device-1',
    createdBy: OWNER_UID,
    ...over,
  }
}

export function validItem(
  code = 'SCR-01',
  over: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    code,
    page: 1,
    category: 'مسامير',
    nameAr: 'مسمار عظم',
    nameEn: 'Bone Screw',
    material: 'تيتانيوم',
    size: '4.5',
    unit: 'قطعة',
    supplier: '',
    gtins: [],
    priceMinor: 12550,
    reorderManual: null,
    active: true,
    updatedAt: serverTimestamp(),
    ...over,
  }
}
