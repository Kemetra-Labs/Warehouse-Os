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

export function validReceiptLine(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    n: 1,
    itemCode: 'SCR-01',
    scannedGtin: null,
    authorityCode: null,
    batchNo: 'B1',
    mfgDate: null,
    expiry: '2028-01',
    invoicedQty: 5,
    countedQty: 5,
    priceMinor: 12550,
    prevPriceMinor: 12000,
    diffReason: null,
    expiredReason: null,
    ...over,
  }
}

/** A draft receipt as the client writes it (no postedAt/cancelledAt keys yet). */
export function validReceipt(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'draft',
    supplier: 'الهيئة',
    deliveryNo: 'D-1001',
    invoiceNo: 'INV-1',
    invoiceDate: '2026-10-01',
    supplyRequestNo: null,
    supplyOrderNo: null,
    businessDate: '2026-10-01',
    lines: [validReceiptLine()],
    postedAt: null,
    cancelledAt: null,
    cancelReason: null,
    priceUpdates: [],
    ...over,
  }
}

export function validIssueBatch(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    status: 'draft',
    number: 1,
    rep: 'مندوب',
    businessDate: '2026-10-01',
    permits: ['P-1'],
    requested: [{ itemCode: 'SCR-01', qty: 2, priceMinor: 12550 }],
    requestedValueMinor: 0,
    issuedValueMinor: 0,
    issued: [],
    postedAt: null,
    cancelledAt: null,
    cancelReason: null,
    ...over,
  }
}
