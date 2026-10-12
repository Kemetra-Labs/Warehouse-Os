# Contract: Firestore Security Rules

This file is the contract that `firestore.rules` implements and that `tests/rules/*.test.ts`
proves. `OWNER` means `request.auth != null && request.auth.uid == '__OWNER_UID__'`. The
placeholder is replaced at deploy time (research R3).

## Global

| Path | read | create | update | delete |
|---|---|---|---|---|
| anything not listed | deny | deny | deny | deny |
| any path, non-owner or signed out | deny | deny | deny | deny |

## `items/{code}`

| Op | Allowed when |
|---|---|
| read | OWNER |
| create | OWNER, `code == id`, required fields present and typed, `page` is an int ≥ 1, `priceMinor` is an int ≥ 0, optional `authorityCode` is a string or null |
| update | OWNER, `code` unchanged, field types valid |
| delete | never (deactivate with `active = false`) |

## `movements/{id}`

| Op | Allowed when |
|---|---|
| read | OWNER |
| create | OWNER **and** the schema is valid (data-model; the "not in the future" date check is **client-only**, see data-model) **and** `postedAt == request.time` **and** `createdBy == request.auth.uid` **and** the type/qty sign rule holds (`qty > 0` unless type is تسوية, where `qty != 0`) **and**, if `id` starts with `rev-`, `reverses == id[4:]` **and** `reason` is non-empty. **No `exists()`/`get()` calls.** Item existence and original existence are checked on the client (research R2, access-call budget). |
| update | **never** |
| delete | **never** |

## `receipts/{id}` and `issueBatches/{id}`

| Op | Allowed when |
|---|---|
| read | OWNER |
| create | OWNER and `status == 'draft'` |
| update while draft | OWNER, `resource.data.status == 'draft'`, and new `status` is `draft` or `posted` |
| draft → posted | as above, plus `postedAt == request.time` |
| posted → cancelled | OWNER, `resource.data.status == 'posted'`, **`request.resource.data.status == 'cancelled'`**, **`request.resource.data.cancelledAt == request.time`**, `request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','cancelledAt','cancelReason'])`, `cancelReason` is non-empty |
| posted → anything else (draft, posted with new keys) | never |
| any change after cancelled | never |
| delete | OWNER **only** while `status == 'draft'` (discarding a draft) |

## `settings/app`

| Op | Allowed when |
|---|---|
| read, create, update | OWNER |
| delete | never |

## Required rules tests (each one must fail before the rules exist)

1. A signed-out user cannot read or write any collection.
2. A signed-in non-owner cannot read or write any collection.
3. The owner can create a valid movement, and cannot update or delete it.
4. Creating `imp-r12` twice fails the second time.
5. Creating `rev-X` twice fails the second time. `rev-X` fails when the reason is empty or
   `reverses` ≠ `X`.
6. A movement with `qty = 0`, a negative qty on صرف, a missing required field, or a `postedAt` that is not
   the request time is rejected.
7. A posted receipt cannot change its lines. A posted receipt can become cancelled only by
   touching the three allowed keys, with `status == 'cancelled'` and `cancelledAt` equal to the
   request time. **Posted → draft is rejected, posted → posted with a new `cancelReason` is
   rejected, and a delete after an attempted downgrade is rejected.** A cancelled receipt cannot
   change.
8. A draft can be deleted. Posted and cancelled documents cannot be deleted.
9. An item cannot be deleted, and its code cannot be changed.
10. **Budget**: one batched write of 450 valid movement creates (the import shape) succeeds, and
    so does a 30-line posting batch (30 movements + 1 document update + 30 item updates).
