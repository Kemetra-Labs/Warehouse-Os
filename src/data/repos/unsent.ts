import type { Outbox, OutboxEntry } from '../outbox'
import { retryUnsent, type RetryResult } from '../unsent'
import { commitCancel } from './cancelCommit'
import {
  commitPlan as commitIssue,
  issueBatchCancelledOnServer,
  issueBatchPostedOnServer,
} from './issues'
import { commitManualMovement, movementExistsOnServer } from './movements'
import {
  commitPlan as commitReceipt,
  receiptCancelledOnServer,
  receiptPostedOnServer,
} from './receipts'

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
    commitCancel,
    checkReceiptCancel: receiptCancelledOnServer,
    checkIssueCancel: issueBatchCancelledOnServer,
    commitManual: commitManualMovement,
    checkManual: movementExistsOnServer,
  })
}
