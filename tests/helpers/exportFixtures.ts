import type { MovementDoc } from '../../src/data/deriveLedger'
import type { IssueBatch, Item, Receipt } from '../../src/domain/types'

/** A Firestore-Timestamp-shaped value (the code only ever calls `toMillis`). */
export const ts = (ms: number): object => ({ toMillis: () => ms })

export function item(code: string, extra: Partial<Item> = {}): Item {
  return {
    code,
    page: 12,
    category: 'مسامير',
    nameAr: `صنف ${code}`,
    nameEn: '',
    material: '',
    size: '',
    unit: 'قطعة',
    supplier: 'مورد',
    gtins: ['6221234567890'],
    authorityCode: null,
    priceMinor: 12_550,
    reorderManual: null,
    active: true,
    updatedAt: ts(1_700_000_000_000),
    ...extra,
  }
}

let counter = 0

/** A movement doc with every field set, so a test overrides only what it is about. */
export function mov(over: Partial<MovementDoc> = {}): MovementDoc {
  counter += 1
  return {
    id: `m${counter}`,
    type: 'إضافة',
    itemCode: 'SCR-01',
    qty: 5,
    businessDate: '2026-10-12',
    postedAt: ts(1_760_000_000_000 + counter),
    priceMinor: 12_550,
    batchNo: null,
    expiry: null,
    docNumber: null,
    reference: null,
    note: null,
    supplier: null,
    source: { kind: 'manual', id: null },
    substituteFor: null,
    reverses: null,
    reason: null,
    deviceId: 'dev-1',
    createdBy: 'uid-1',
    ...over,
  }
}

export const nameOf = (code: string): string | null => `صنف ${code}`

export type ReceiptFixture = Receipt & { readonly id: string }
export type IssueFixture = IssueBatch & { readonly id: string }

export function receiptDoc(over: Partial<ReceiptFixture> = {}): ReceiptFixture {
  return {
    id: 'r1',
    status: 'posted',
    supplier: 'شركة الأمل',
    deliveryNo: 'D-77/2',
    invoiceNo: 'INV-9',
    invoiceDate: '2026-10-10',
    supplyRequestNo: null,
    supplyOrderNo: null,
    businessDate: '2026-10-12',
    lines: [
      {
        n: 1,
        itemCode: 'SCR-01',
        scannedGtin: null,
        authorityCode: null,
        batchNo: 'B-1',
        mfgDate: null,
        expiry: '2028-03',
        invoicedQty: 10,
        countedQty: 8,
        priceMinor: 12_550,
        prevPriceMinor: 12_000,
        diffReason: 'ناقص من المورد',
        expiredReason: null,
      },
      {
        n: 2,
        itemCode: 'SCR-02',
        scannedGtin: null,
        authorityCode: null,
        batchNo: null,
        mfgDate: null,
        expiry: null,
        invoicedQty: 4,
        countedQty: 4,
        priceMinor: 5_000,
        prevPriceMinor: 5_000,
        diffReason: null,
        expiredReason: null,
      },
    ],
    postedAt: ts(Date.UTC(2026, 9, 12, 9, 30)),
    cancelledAt: null,
    cancelReason: null,
    priceUpdates: [],
    ...over,
  }
}

type Line = IssueBatch['issued'][number]
const line = (n: number, itemCode: string, qty: number, over: Partial<Line> = {}): Line => ({
  n,
  itemCode,
  qty,
  batchNo: null,
  expiry: null,
  forItemCode: null,
  negativeReason: null,
  ...over,
})

export function issueDoc(over: Partial<IssueFixture> = {}): IssueFixture {
  return {
    id: 'b1',
    number: 14,
    status: 'posted',
    rep: 'إيجي فيكس',
    businessDate: '2026-10-12',
    permits: ['1001', '1002'],
    requested: [
      { itemCode: 'SCR-01', qty: 4, priceMinor: 12_550 },
      { itemCode: 'SCR-02', qty: 3, priceMinor: 5_000 },
    ],
    requestedValueMinor: 4 * 12_550 + 3 * 5_000,
    issuedValueMinor: 3 * 12_550 + 3 * 5_000 + 5_000,
    issued: [
      line(1, 'SCR-01', 3, { batchNo: 'B-1', expiry: '2028-03' }),
      line(2, 'SCR-02', 3),
      line(3, 'SCR-02', 1, { forItemCode: 'SCR-01' }),
    ],
    postedAt: ts(Date.UTC(2026, 9, 12, 10, 0)),
    cancelledAt: null,
    cancelReason: null,
    ...over,
  }
}

/** The movements an issue batch wrote: `{batchId}-L{n}` with the price at posting. */
export function issueMovements(batch: IssueFixture): MovementDoc[] {
  const prices: Record<string, number> = { 'SCR-01': 12_550, 'SCR-02': 5_000 }
  return batch.issued.map((l) =>
    mov({
      id: `${batch.id}-L${l.n}`,
      type: 'صرف',
      itemCode: l.itemCode,
      qty: l.qty,
      priceMinor: prices[l.itemCode] ?? 0,
      source: { kind: 'issue', id: batch.id },
    }),
  )
}
