# Research: Daily Operations (Phase 1)

**Feature**: [spec.md](./spec.md) · **Date**: 2026-10-12

Each entry records a decision, why it was made, and what was rejected. Package versions are the
current npm releases checked on 2026-10-12. Implementation pins exact versions in `package.json`.

## R1. Platform and offline sync

- **Decision**: An installable PWA (React 19 + TypeScript 7 + Vite 8) on Cloud Firestore
  (`firebase` JS SDK 13) with `persistentLocalCache` and `persistentMultipleTabManager`. All
  reads come from the local cache and all writes queue locally and sync on reconnect.
- **Rationale**: The user chose this approach during brainstorming (approach "أ"). Firestore's
  offline cache is mature and needs no custom sync code (constitution IV). Phase 1 data is small:
  97 items, about 1,000 movements a year, one user. This stays well inside the free Spark tier.
  Queued writes survive app restarts in IndexedDB.
- **Alternatives rejected**:
  - Supabase + PowerSync: three services, more failure points.
  - A custom sync engine on Cloudflare D1: the sync code would be the riskiest part of the
    product, and we would write it ourselves.
  - Dexie-only local storage: no cross-device sync.

## R2. Immutability enforced by the server (FR-051, constitution I)

- **Decision**: Firestore Security Rules.
  - `movements/{id}`: `allow create` only (with schema validation); `update` and `delete` are
    denied for everyone.
  - Draft documents (`receipts`, `issueBatches`): updatable only while `status == 'draft'`.
    Allowed transitions are `draft → posted` and `posted → cancelled`. Header and lines are
    frozen once posted.
- **Deterministic IDs give uniqueness for free**:
  - Import rows: `imp-r{row}`. Re-importing hits `create` on existing IDs and is rejected
    (FR-004).
  - A reversal of movement `X`: `rev-{X}`. A second reversal is rejected (FR-052, "reversed only
    once").
  - Posted lines: `{docId}-L{n}`.
  - **Retrying a post is NOT a no-op.** A `set()` on an existing document is evaluated as an
    update, which the rules deny for movements and posted documents. So a resend of a post the
    server already applied is rejected. The outbox (R12) handles this by checking server state
    before reporting a failure.
- **Access-call budget**: Firestore rules allow about 10 `exists()`/`get()` calls per
  operation and about 20 per batched write; repeat calls on the same document are cached. So
  movement rules **must not** call `exists()` per movement. The rules validate shape, sign,
  owner and time, plus create-only. "The item exists" and "the original exists" (for `rev-*`)
  are validated on the client in `src/domain` before the batch is built. Uniqueness still comes
  from deterministic IDs, which costs no access calls. The rules tests include a full 450-op
  import batch and a 30-line posting to prove the budget holds.
- **Rationale**: Rules run on the server for every client, so a modified client or a direct API
  call still cannot change the ledger. Deterministic IDs turn "must not happen twice" into "the
  document already exists", which the rules can check without queries.
- **Alternatives rejected**:
  - Cloud Functions validation: needs the paid Blaze plan, and fails while offline anyway.
  - UI-only guards: violate constitution I.

## R3. Owner-only access (FR-073)

- **Decision**: Google sign-in via Firebase Auth. Rules allow access only when
  `request.auth.uid == OWNER_UID`. The UID is substituted into `firestore.rules` at deploy time
  from an untracked `.env.local` (`scripts/render-rules.mjs`); the committed file holds a
  placeholder. Auth state persists in IndexedDB, so the app opens offline after the first
  sign-in.
- **Rationale**: Single user (spec assumptions). It avoids hardcoding personal identifiers in the
  repo.
- **Alternatives rejected**:
  - An email allowlist inside the rules: puts personal data in the repo.
  - Custom claims: need the Admin SDK and add a bootstrap step for no benefit with one user.

## R4. Balances and negative stock (FR-010, FR-044, FR-072)

- **Decision**: Balances are computed on the client from the full movement set, which is held by
  one live listener on `movements`.
  - Formula: إضافة − صرف + مرتجع + تسوية (signed), plus the same per batch.
  - A negative balance is a derived state, never a stored flag.
  - "Highlight until opened" (FR-072) is tracked per device in local storage: `seenAt` per item
    versus the latest movement time.
- **Rationale**: There are a few thousand documents at most, so computing in memory is instant.
  Rules cannot sum across documents, so the server cannot block negative stock. That is fine
  because the spec allows negative stock with a reason (FR-044), and the flag is computed after
  sync.
- **Read budget**: one listener over about 1,000 to 5,000 small documents. The cache serves
  reloads. After long offline periods the listener re-reads once, which stays well under the
  50k reads/day free quota.

## R5. Barcode scanning (FR-020, constitution V)

- **Decision**: The `barcode-detector` 3.x ponyfill.
  - It uses the native `BarcodeDetector` on Android Chrome (EAN-13 supported) and the bundled
    ZXing WASM elsewhere.
  - The WASM file is precached by the service worker, so scanning works offline.
  - Camera via `getUserMedia({ video: { facingMode: 'environment' } })`.
  - Formats: `ean_13`, `ean_8`, `upc_a`, `code_128`, `data_matrix`.
  - **GS1 element strings** (GS1-128 or GS1 DataMatrix, e.g. `01…17…10…`) are parsed: AI 01 →
    GTIN-14, AI 17 → expiry (YYMMDD), AI 10 → batch. The parsed batch and expiry prefill the
    receipt line.
  - **Normalisation**: a GTIN-14 with a leading 0 becomes GTIN-13, and a 12-digit UPC-A gets a
    leading 0 to become GTIN-13.
- **Fallback**: the single search input (FR-020) is always visible. It is classified by shape:
  a GS1 element string → parsed as above; `^\d{8,9}$` → **ambiguous**: looked up both as a
  GTIN (EAN-8) and as an authority code (كود الهيئة, e.g. `70000409`, `150004771`), and if two
  different items match the user chooses; `^\d{12}$`, `^\d{13}$` or `^\d{14}$` → GTIN
  (normalised as above); `^\d{1,4}$` → page number; `^[A-Z]{3}-\d{2,3}$`
  (case-insensitive) → code;
  anything else → name search. Arabic-Indic digits (٠-٩) are normalised to ASCII first.

## R6. Reading the workbook (FR-001…FR-005)

- **Decision**: SheetJS Community Edition **0.20.3**, from the vendor's official tarball
  (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`). The npm registry copy is stuck at
  0.18.5, which has known advisories. It reads values, and the cached results of formula cells
  (`cell.v`) for the parity oracle.
- **Probe on the real workbook (2026-10-12)**:
  - SheetJS read `L5 = 4`, `N5 = متاح` and 97/97 cached balances, and found 237 movement rows.
  - **ExcelJS 4.4 failed to open the workbook**, with `Cannot set properties of undefined
    (setting 'filterButton')`. Its table parser breaks on this file's tables. So ExcelJS is used
    **only to write** new files (R7) and never to read the user's workbook.
- **Dates**: the workbook is read with `cellDates: false`, so date cells come back as Excel
  serial numbers. The business date is computed from the serial by integer arithmetic
  (serial 1 = 1900-01-01, with Excel's 1900 leap-year quirk), so no time zone is involved. The
  import tests run under `TZ=Africa/Cairo` as well as UTC to prove it.
  - Sheets: "القائمة الاساسية" (items, header row 4, data from row 5), table "الحركات" on
    "سجل الحركات" (header row 4), and "الأرصدة اللحظية" (cached balance column L, status
    column N).
  - The 6 rows dated 2026-01-08 are remapped to 2026-08-01 (FR-005, confirmed by the user).
- **Verified facts** (workbook inspection, 2026-10-12):
  - 97 items; codes and names unique; cached balances present for all 97.
  - 237 movements: 148 إضافة and 89 صرف. Columns م, الصنف, الخامة, الوحدة, الأثر,
    الرصيد الجاري and تحقق are formulas. The inputs are التاريخ, نوع الحركة, الكود, الكمية,
    الشركة, رقم الفاتورة/الإذن, ملاحظات, المرجع, رقم التشغيلة and تاريخ الانتهاء.
  - "مسلسل الصنف" is a formula except in 5 rows.
  - Workbook formulas match on item **name**. The app keys on **code**. Equivalent here because
    names are unique.
- **Alternative rejected**: ExcelJS for reading, because it fails on this workbook (see the
  probe above). SheetJS CE cannot write styles, so writing stays with ExcelJS (R7).

## R7. Printable documents and exports (FR-060…FR-062)

- **Decision**: ExcelJS builds the files in the browser.
  - Print setup: A4 portrait, `rightToLeft: true` sheet view, fit to one page wide, print titles,
    official header rows, signature block.
  - Fonts referenced: Arial (always present on Windows and Excel), so printing needs nothing
    installed.
  - Downloads use a Blob plus an anchor, which works offline.
- **Phase 2 risk, logged now**: openpyxl already warned that this workbook uses
  conditional-formatting and data-validation *extensions*. A library that round-trips the
  official monthly-report template may drop them. Phase 2 starts with a round-trip spike on a
  copy of the template; phase 1 only *generates* new files, so it is unaffected.

## R8. Getting rows back into the workbook (FR-061)

- **Decision**: Export a small `.xlsx` whose columns A–R mirror table "الحركات" exactly. Formula
  columns stay empty and input columns are filled. Users copy rows A–R from that file and use
  **Paste Special → Skip blanks** onto the first empty row of the table. Because the source is
  Excel, the option is available. Blank cells in the source do not overwrite the destination's
  formula cells.
- **Spike required before the export task is marked done** (task-level acceptance):
  1. On a copy of the real workbook, paste 10 exported rows using the steps above.
  2. Confirm the formula columns still calculate.
  3. Confirm "الأرصدة اللحظية" equals the app for the touched items.
- **If Skip blanks misbehaves with the table**: fall back to exporting two contiguous blocks
  (C–E and I, then K–M and P–R) with on-screen steps.
- **Capacity warning**: the table ends at row 595, with 237 rows used. The app warns when the
  next export would pass row 595.
- **Rejected**: copying from the browser to the clipboard. Excel then pastes plain text, and
  "Skip blanks" is not reliable for non-Excel sources.

## R9. Offline app shell

- **Decision**: `vite-plugin-pwa` 2.x (Workbox).
  - Precaches the app shell, the self-hosted Almarai font files (WOFF2) and the ZXing WASM.
  - Update flow: prompt-to-reload, never mid-task.
  - Web app manifest with `dir: "rtl"`, `lang: "ar"` and standalone display.
- **Rationale**: Fonts and WASM must be local, or the first offline cold start renders without
  them (constitution IV, V). Google Fonts CDN is not used at runtime.

## R10. Document numbering offline

- **Decision**:
  - Receipts use the supplier's delivery-note number. No generated number is needed.
  - Issue batches get a local sequential number: max posted or draft number + 1. Two devices
    creating batches while both are offline could collide. That case is rare with one user. It
    is detected after sync (duplicate `number`) and shown as a warning, never auto-renumbered,
    because the number may already be printed.
  - The internal document ID is always a UUID, so a collision never loses data.

## R11. Testing stack (constitution VI)

- **Unit**: Vitest 5. Covers ledger math, status, reorder point, substitute ranking, the search
  classifier, import mapping, and export column mapping.
- **Rules**: `@firebase/rules-unit-testing` 6 against the Firestore emulator (firebase-tools 15.33,
  which needs **Java 21**; CI uses Temurin 21).
- **Parity**: a Vitest suite that reads the real workbook from `WORKBOOK_PATH`. The workbook
  contains government custody data and is **never committed**.
  - Locally the suite is mandatory before release.
  - In CI it runs on a synthetic fixture (`tests/fixtures/mini-workbook.xlsx`, generated by a
    script) that reproduces the same sheet and table shapes with fake items.
- **E2E**: Playwright 1.64 against the emulator. It uses `context.setOffline(true)` for the
  offline flows, and uses a fake camera stream (`--use-file-for-fake-video-capture`) with a
  rendered EAN-13 image for the scan path.

## R12. Writes the server rejects after an offline period (SC-005)

- **Risk**: a write queued offline that the rules reject when it syncs is rolled back in the
  local cache. Without handling, the user would never see the failure, and the data would be
  silently lost.
- **Decision**: an **outbox** in IndexedDB (`src/data/outbox.ts`).
  - Before a post or cancel batch is committed, its full payload is stored in the outbox under
    its document ID.
  - The entry is removed only when the batch's `commit()` promise resolves, which means the
    server acknowledged it.
  - **On a rejection, the outbox first reads server state** for that document ID: status
    `posted` (or `cancelled`) and the `{id}-L*` movements present. A match means an earlier send
    already succeeded, so the entry is cleared as success. Only a real mismatch is marked
    `failed`. This prevents a lost acknowledgement from turning into a false failure and then a
    double post. Pending promises are re-attached on app start through
    `waitForPendingWrites()` plus a per-entry check of server state.
  - If the promise rejects, the entry is marked `failed`, the sync pill turns red ("فشل الإرسال"),
    and a "مستندات لم تُرسل" (unsent documents) screen shows the payload. From there the user can
    retry after a fix, or export it to Excel. Nothing is discarded automatically.
- **Test**: an E2E case goes offline, posts a document crafted to violate a rule (via a test
  hook), reconnects, and asserts that the failed state is shown and the payload is kept.
