import type { Outbox, OutboxEntry } from '../outbox'
import { retryUnsent, type RetryResult } from '../unsent'
import { commitPlan as commitIssue, issueBatchPostedOnServer } from './issues'
import { commitPlan as commitReceipt, receiptPostedOnServer } from './receipts'

/** Thin Firestore adapter over `unsent.ts`: sends a stored post again. */
export function retryOutboxEntry(
  entry: OutboxEntry,
  outbox: Pick<Outbox, 'put' | 'markAcked' | 'reconcile'>,
): Promise<RetryResult> {
  return retryUnsent(entry, {
    outbox,
    commitReceipt,
    commitIssue,
    checkReceipt: receiptPostedOnServer,
    checkIssue: issueBatchPostedOnServer,
  })
}
