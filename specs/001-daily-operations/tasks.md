---
description: "Task list for phase 1 (daily operations)"
---

# Tasks: الشغل اليومي لمخزن الشرائح والمسامير (المرحلة 1)

**Input**: Design documents from `specs/001-daily-operations/`

**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/](./contracts/), [quickstart.md](./quickstart.md)

**Tests**: REQUIRED. Constitution VI (test-first, NON-NEGOTIABLE) applies. Every test task comes
before its implementation, and the test must fail first.

**Organization**: Tasks are grouped by user story. P1 stories run in dependency order:
US1 → US2 → US3 → US7. P2 stories follow: US4 → US5 → US6.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependency on an incomplete task)
- **[Story]**: The user story from spec.md (US1–US7)
- Paths follow the single-project layout in plan.md (`src/`, `tests/` at the repository root)

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Project initialization and tooling.

- [X] T001 Scaffold the Vite + React 19 + TypeScript (strict) app at the repository root: `package.json`, `vite.config.ts`, `tsconfig.json`, and `index.html` with `lang="ar" dir="rtl"`
- [X] T002 [P] Add ESLint (typescript-eslint, react-hooks) and Prettier config in `eslint.config.js` and `.prettierrc`
- [X] T003 [P] Configure Vitest with coverage thresholds of 80% for `src/domain`, `src/data` and `src/excel` in `vitest.config.ts`
- [X] T004 [P] Configure Playwright (Android Chrome viewport, emulator base URL, fake-camera launch flags) in `playwright.config.ts`
- [X] T005 [P] Add Firebase project files: `firebase.json` (hosting, firestore, Auth and Firestore emulators), `.firebaserc` (placeholder project), `firestore.indexes.json`
- [X] T006 [P] Add `.env.example` (`VITE_FIREBASE_*`, `VITE_USE_EMULATORS`, `OWNER_UID`). (`.gitignore` already covers `.env*.local`, `firestore.rules`, `*.xlsx` except the fixture, and `node_modules/`.)
- [X] T007 [P] Write `scripts/render-rules.mjs`, which renders `firestore.rules.template` to `firestore.rules` with `OWNER_UID` from the environment (research R3)
- [X] T008 Add npm scripts `dev`, `dev:https`, `emulators`, `test:unit`, `test:rules`, `test:e2e`, `test:parity`, `build` and `deploy` in `package.json`
- [X] T009 [P] Install pinned dependencies in `package.json`: `firebase` 13, `exceljs` 4.4, `barcode-detector` 3, `zod` 4, `react-router` 8, `vite-plugin-pwa` 2. Add SheetJS CE 0.20.3 from the vendor tarball `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (research R6)
- [X] T010 [P] Configure the PWA: `vite-plugin-pwa` in `vite.config.ts`, a manifest with `dir: "rtl"`, `lang: "ar"` and standalone display, and precaching of fonts and the ZXing WASM. Add the reload prompt in `src/app/UpdatePrompt.tsx`
- [X] T011 [P] Self-host Almarai WOFF2 in `public/fonts/`. Define design tokens (palette, type scale with tabular numerals, spacing, motion durations and easings, `prefers-reduced-motion` overrides) in `src/ui/tokens.css`, following plan.md "Design Notes"
- [X] T012 [P] Add CI in `.github/workflows/ci.yml`: lint, typecheck, unit, rules (emulator), parity on the fixture, e2e
- [X] T013 Record the impeccable direction contract (count-board world, violet seal reserved for posted state, motion grammar) as the surface brief for `src/ui/tokens.css`, the design system every screen inherits (plan.md "Design Notes")

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Domain rules, data access, auth, shell and sync. No user story starts before this phase is done.

### Tests first

- [X] T014 [P] Unit tests for the movement effect (إضافة +, صرف −, مرتجع +, signed تسوية), item and batch balances, the "unspecified batch" bucket, and the reversal builder in `tests/unit/domain/ledger.test.ts`
- [X] T015 [P] Unit tests for `monthsOfConsumption`, `reorderPoint` (manual, computed, default 5, coverage 1.5) and status thresholds, including the exact label "تجاوز — رصيد سالب", in `tests/unit/domain/status.test.ts`
- [X] T016 [P] Unit tests for search classification (GS1 element strings parsed; 8, 12, 13 or 14 digits → GTIN normalised to 13 per research R5; 1–4 digits → page; `SCR-01` or `PLA-123` in any case → code; 5–7 or 9–11 digits → name search; otherwise name; Arabic-Indic digits normalised) and multi-match behaviour in `tests/unit/domain/search.test.ts`
- [X] T017 [P] Unit tests for piastre conversion, rounding, and formatting with Western digits in `tests/unit/domain/money.test.ts`
- [X] T018 [P] Rules tests 1, 2 and 9 (signed out, non-owner, items not deletable and code immutable) in `tests/rules/access.test.ts`
- [X] T019 [P] Rules tests 3, 4, 6 and 10 (movements create-only, deterministic-ID duplicates rejected, validation, 450-op and 30-line batch budget) in `tests/rules/movements.test.ts`
- [X] T020 [P] Unit tests for the outbox (store before commit, delete on ack, mark failed on reject, survive reload, **a rejected resend whose document is already posted on the server is cleared as success**) using `fake-indexeddb` in `tests/unit/data/outbox.test.ts`

### Implementation

- [X] T021 Define zod schemas and types for Item, Movement, Receipt, IssueBatch and Settings in `src/domain/types.ts` (data-model.md)
- [X] T022 [P] Implement `src/domain/ledger.ts` so T014 passes
- [X] T023 [P] Implement `src/domain/status.ts` so T015 passes
- [X] T024 [P] Implement `src/domain/search.ts` so T016 passes
- [X] T025 [P] Implement `src/domain/money.ts` so T017 passes
- [X] T026 Write `firestore.rules.template` for items, movements and settings per `contracts/firestore-rules.md` (no `exists()` in movement rules) so T018 and T019 pass
- [X] T027 Initialise Firebase with `persistentLocalCache` and `persistentMultipleTabManager`, plus the emulator switch, in `src/data/firebase.ts`
- [X] T028 Implement Google sign-in, persisted session and owner gate in `src/data/auth.ts`, and the sign-in screen in `src/ui/screens/SignIn.tsx`
- [X] T029 [P] Implement live repositories for items, movements and settings in `src/data/repos/items.ts`, `src/data/repos/movements.ts` and `src/data/repos/settings.ts`
- [X] T030 Implement the IndexedDB outbox in `src/data/outbox.ts` so T020 passes (research R12)
- [X] T031 Implement the sync state (synced / pending N / failed) from `hasPendingWrites`, `waitForPendingWrites()` and the outbox in `src/data/sync.ts`, plus the `SyncPill` component in `src/ui/components/SyncPill.tsx`
- [X] T032 Implement the derived-state hook (balances, statuses, reorder points, pending settlements) with memoization in `src/data/useLedger.ts`, with a unit test in `tests/unit/data/useLedger.test.ts`
- [X] T033 [P] Build UI primitives in `src/ui/components/`: `Bdi.tsx` (LTR isolate for codes), `StatusDot.tsx` (colour plus glyph), `CountTable.tsx`, `Seal.tsx` (SVG with a stamp animation and reduced-motion fallback), `BottomSheet.tsx`, `SearchBox.tsx`
- [X] T034 Build the app shell (routes, header with SyncPill, bottom navigation الرئيسية / الأصناف / الحركات / التقارير, providers) in `src/app/App.tsx` and `src/app/routes.tsx`

**Checkpoint**: domain tests and rules tests are green, and the shell runs signed in against the emulator.

---

## Phase 3: User Story 1 - نقل المخزن من الإكسيل والتأكد من المطابقة (Priority: P1) 🎯 MVP

**Goal**: import 97 items and 237 movements, and show 97/97 balance parity.

**Independent Test**: import the real workbook (or the fixture in CI). The parity screen shows 97/97, and re-importing is refused.

### Tests for User Story 1

- [X] T035 [P] [US1] Write the fixture generator `scripts/make-fixture.mjs` that produces `tests/fixtures/mini-workbook.xlsx`. It must have the same three sheets, a table named "الحركات" spanning A4:R595, cached L and N values, fake items, opening rows dated 2026-08-01, and a row dated 2026-01-08
- [X] T036 [P] [US1] Unit tests for the import mapping per `contracts/excel-import.md`: item columns; movement input columns; formula columns ignored; dates from Excel serials, with the suite run under both `TZ=UTC` and `TZ=Africa/Cairo`; GTIN count asserted; 2026-01-08 → 2026-08-01 (FR-005); no opening movement from column I (FR-002); named precondition errors. File: `tests/unit/excel/importWorkbook.test.ts`
- [X] T037 [P] [US1] Parity tests against the fixture (always run) and the real workbook from `WORKBOOK_PATH` (skipped when unset; mandatory before release) in `tests/parity/parity.test.ts`
- [X] T038 [P] [US1] Unit tests for the import writer (batches of at most 450, resume skips existing `imp-r*` IDs, `workbookImport` written only after the last batch) in `tests/unit/data/importWriter.test.ts`

### Implementation for User Story 1

- [X] T039 [US1] Implement `src/excel/importWorkbook.ts` with SheetJS (preconditions, mapping, date remap) so T036 passes
- [X] T040 [US1] Implement `src/excel/parity.ts` (balances against cached L, statuses against N, the "سبب محتمل" note) so T037 passes
- [X] T041 [US1] Implement `src/data/importWriter.ts` so T038 passes
- [X] T042 [US1] Build the import and parity screen (file picker, progress, the 97/97 counter, per-item differences) in `src/ui/screens/ImportParity.tsx`
- [X] T043 [US1] Write an E2E test that imports the fixture, checks parity, and confirms re-import is refused, in `tests/e2e/import.spec.ts`

**Checkpoint**: real-workbook parity is 97/97 locally, and fixture parity passes in CI.

---

## Phase 4: User Story 2 - استلام طلبية من الشركة (Priority: P1)

**Goal**: receive by scan or typed lookup with a double count, then post with the seal.

**Independent Test**: create a receipt with 4 lines (scanned, typed by page, unknown GTIN, counted ≠ invoiced) and post it. Balances rise by the counted quantity, the price is updated, and the GTIN is linked.

### Tests for User Story 2

- [X] T044 [P] [US2] Unit tests for the receipt domain in `tests/unit/domain/receipt.test.ts`:
  - line validation; a difference reason is required; an unresolved GTIN blocks posting;
  - `toMovements()` uses the counted quantity, IDs `{id}-L{n}` and the price snapshot;
  - `priceUpdates`; a warning when a GTIN is already linked to another item;
  - an expiry before the business date needs a reason (edge case);
  - a business date in the future is rejected (edge case);
  - a line with counted quantity 0 writes no movement and keeps its difference on the receipt;
  - header fields `invoiceDate`, `supplyRequestNo`, `supplyOrderNo` and line fields `authorityCode`, `mfgDate` validate and round-trip;
  - a second receipt with an existing `deliveryNo` is refused, and the existing one is returned (FR-030b);
  - a line resolved by authority code links nothing on posting (authority codes come only from the reviewed mapping, FR-017).
- [X] T045 [P] [US2] Rules tests 7 and 8 for documents (draft editable, posted frozen, posted → cancelled limited to three keys with `status == 'cancelled'` and `cancelledAt == request.time`, **posted → draft rejected, posted → posted rejected, delete after an attempted downgrade rejected**, drafts deletable) in `tests/rules/documents.test.ts`

### Implementation for User Story 2

- [X] T046 [US2] Update the search classifier per FR-020 and research R5: an 8–9 digit number is `{kind:'ambiguous'}` and resolves against both GTINs and authority codes, returning every match; add `authorityCode` (optional, `^\d{8,9}$`) to the item schema in `src/domain/types.ts`. Tests first in `tests/unit/domain/search.test.ts`, then `src/domain/search.ts`
- [X] T047 [US2] Implement `src/domain/receipt.ts` so T044 passes
- [X] T048 [US2] Extend `firestore.rules.template` with the transitions for `receipts` and `issueBatches` so T045 passes
- [X] T049 [US2] Implement `src/data/repos/receipts.ts`: draft CRUD, plus one atomic post batch (movements, item price, GTIN link, status) written through the outbox
- [ ] T050 [P] [US2] Implement the scanner in `src/scan/detector.ts` (barcode-detector ponyfill; EAN-13/8, Code-128 and DataMatrix) and `src/scan/Scanner.tsx`. Requirements:
  - the whole view is the tap target, with continuous mode;
  - a beep and `navigator.vibrate`;
  - a green outline with a tick for known codes and a red outline with a cross for unknown ones;
  - a reduced-motion fallback;
  - the camera hides when no camera is available.
- [ ] T051 [US2] Build the receive screen in `src/ui/screens/Receive.tsx`. Requirements:
  - header chips (supplier, delivery note, invoice number and date, supply request, supply order); scanning the note's QR fills the delivery-note number, and an existing receipt with that number opens instead (FR-030b);
  - the scanner and the always-visible SearchBox;
  - a line card with batch, expiry, invoiced and counted quantities, and price (flagged when it changes);
  - an expired batch shows a clear warning and asks for a reason before the line is added;
  - each scan increments the counted quantity.
- [ ] T052 [US2] Build the receipt review screen in `src/ui/screens/ReceiptReview.tsx`. Requirements:
  - the double-count table (الفاتورة | اتعدّ);
  - the difference-reason prompt;
  - the unknown-GTIN resolver;
  - اعتماد stays disabled until the review is valid;
  - the seal appears on post.
- [ ] T053 [US2] Write an E2E receiving test in `tests/e2e/receive.spec.ts` covering:
  - a fake-camera EAN-13 scan;
  - a typed page number;
  - an unknown GTIN;
  - a count difference;
  - a price change;
  - posting.

**Checkpoint**: a receipt can be completed on the phone against the emulator, and balances and prices are correct.

---

## Phase 5: User Story 3 - الصرف للمندوب بالبدائل (Priority: P1)

**Goal**: an issue batch with aggregation, substitutes, negative issue with a reason, and the seal.

**Independent Test**: create a batch with one fully available item and one item short by 2 that gets a substitute, then post. The substitute is debited, the requested item is untouched, and the totals are correct.

### Tests for User Story 3

- [ ] T054 [P] [US3] Unit tests for substitute ranking in `tests/unit/domain/substitutes.test.ts`:
  - same category, in stock, excluding the item itself;
  - ordered by absolute price difference, then by balance;
  - the "all categories" toggle;
  - a check against workbook prices (NAL-01 → NAL-07 ±0, NAL-11 +75%).
- [ ] T055 [P] [US3] Unit tests for the issue domain in `tests/unit/domain/issue.test.ts`:
  - aggregation per item (FR-041);
  - the coverage check;
  - a negative issue needs a reason;
  - FEFO batch default;
  - `toMovements()` sets `substituteFor` and `reference = "دفعة {n}"`;
  - requested, issued and difference totals from prices snapshotted at posting, **unchanged after a later receipt changes a price**;
  - the negative check sums issued quantity per item and per batch (two lines within balance whose sum is not need a reason);
  - local sequential numbering;
  - a business date in the future is rejected.

### Implementation for User Story 3

- [ ] T056 [P] [US3] Implement `src/domain/substitutes.ts` so T054 passes
- [ ] T057 [US3] Implement `src/domain/issue.ts` so T055 passes
- [ ] T058 [US3] Implement `src/data/repos/issues.ts` (drafts, local numbering, atomic post through the outbox)
- [ ] T059 [US3] Build the issue screen in `src/ui/screens/Issue.tsx`. Requirements:
  - rep name and permit numbers (numbers only);
  - requested lines;
  - the مطلوب | اتسلّم count table with status dots;
  - the totals summary;
  - the seal on post.
- [ ] T060 [US3] Build the substitute bottom sheet in `src/ui/screens/SubstituteSheet.tsx`. Requirements:
  - nearest price pre-selected;
  - difference shown in EGP and percent, with balance;
  - the "كل الفئات" toggle;
  - "صرف بالسالب + سبب".
- [ ] T061 [US3] Build the home screen in `src/ui/screens/Home.tsx`: the open draft batch at the top, receive and issue actions, and tallies (تحتاج طلب / نافد / تسويات معلّقة)
- [ ] T062 [US3] Write an E2E issuing test (aggregation, substitute, negative with a reason, post, totals) in `tests/e2e/issue.spec.ts`

**Checkpoint**: the MVP's daily loop (import → receive → issue) works end to end.

---

## Phase 6: User Story 7 - الشغل من غير نت والمزامنة (Priority: P1)

**Goal**: zero data loss offline, a visible sync state, and correct merges across two devices.

**Independent Test**: go offline on the phone context, post a receipt and a batch, reconnect, and confirm both appear on the second context with matching balances.

### Tests for User Story 7

- [ ] T063 [P] [US7] E2E test in `tests/e2e/offline-sync.spec.ts`:
  - two browser contexts;
  - offline receive and issue on the first;
  - "N مستنية النت", then "متزامن" after reconnect;
  - the same balances on the second context;
  - concurrent offline issues that push an item negative get flagged.
- [ ] T064 [P] [US7] E2E test in `tests/e2e/outbox-rejected.spec.ts`: an offline post that the rules reject after reconnect turns the pill red, and the payload is kept on the unsent screen (research R12)

### Implementation for User Story 7

- [ ] T065 [US7] Build the unsent-documents screen (list, details, retry, export to Excel) in `src/ui/screens/Unsent.tsx`
- [ ] T066 [US7] Implement the post-sync negative flag and the "changed since seen" highlight (tint plus marker-blue dot, no side stripe; cleared when opened) in `src/data/useLedger.ts` and `src/ui/components/ItemRow.tsx`
- [ ] T067 [US7] Add the duplicate batch-number warning after sync (research R10) in `src/data/repos/issues.ts` and `src/ui/screens/Issue.tsx`

**Checkpoint**: all P1 stories are done. This is the field-trial build.

---

## Phase 7: User Story 4 - الأصناف والأرصدة وكارت الصنف (Priority: P2)

**Goal**: find any item, see its state, batches and full history, and edit master data.

**Independent Test**: open the card of an item that has an addition, an issue, a substitute and a reversal. Every movement shows with its running balance, and the reversal is struck through and linked.

- [ ] T068 [P] [US4] Unit tests for item validation (unique code and page, GTIN format, a warning for duplicate GTINs, edits never touch movement prices) in `tests/unit/domain/items.test.ts`
- [ ] T069 [P] [US4] Unit tests for settings validation (coverage months > 0, default reorder point ≥ 1) and recomputed reorder points after a change in `tests/unit/domain/settings.test.ts`
- [ ] T070 [US4] Implement `src/domain/items.ts` so T068 passes
- [ ] T071 [US4] Build the items list with filters (تحتاج طلب / نافد / تسويات معلّقة / category) and the search box in `src/ui/screens/Items.tsx`
- [ ] T072 [US4] Build the item card in `src/ui/screens/ItemCard.tsx`. It shows master data, balance, status, reorder point, batches with expiry, and the movement history with running balance, price at the time, the document, and struck reversals.
- [ ] T073 [US4] Build the item add/edit form (new code and page suggested, GTIN list) in `src/ui/screens/ItemEdit.tsx`
- [ ] T074 [US4] Implement `src/domain/settings.ts` so T069 passes, and build the settings screen (مدة التغطية لحد الطلب، الحد الافتراضي للأصناف الجديدة) in `src/ui/screens/Settings.tsx` (FR-012)
- [ ] T075 [P] [US4] Unit tests for the authority-code mapping import (two columns الكود / كود الهيئة plus a تأكيد column; only confirmed rows; duplicate codes rejected; unknown item codes listed) in `tests/unit/excel/importAuthorityCodes.test.ts`, and a rules test that an item update may set `authorityCode` in `tests/rules/access.test.ts`
- [ ] T076 [US4] Implement `src/excel/importAuthorityCodes.ts`, add `authorityCode` to the items allowlist in `firestore.rules.template`, and add an "استيراد أكواد الهيئة" action with a result summary to `src/ui/screens/ImportParity.tsx` (FR-017)
- [ ] T077 [US4] Write an E2E test for items (filter, open card, edit price; the history keeps its old prices) in `tests/e2e/items.spec.ts`

---

## Phase 8: User Story 5 - إلغاء حركة، ومرتجع، وتسوية (Priority: P2)

**Goal**: correct mistakes without editing posted data.

**Independent Test**: cancel a posted issue batch. Balances return, both movements are visible, and a second cancel is refused.

- [ ] T078 [P] [US5] Unit tests for cancel composition in `tests/unit/domain/cancel.test.ts`:
  - receipt reversals plus the price-restore rule, with GTIN links kept;
  - issue reversals;
  - return (+) and signed adjustment;
  - a reason is required.
- [ ] T079 [P] [US5] Rules test 5 (`rev-X` once only, reason required, `reverses == X`) in `tests/rules/movements.test.ts`
- [ ] T080 [US5] Implement the cancel batches in `src/data/repos/receipts.ts` and `src/data/repos/issues.ts` (through the outbox) so T078 and T079 pass
- [ ] T081 [US5] Build the return and adjustment screen in `src/ui/screens/Adjust.tsx`
- [ ] T082 [US5] Add the cancel action with a reason and the red "ملغي" seal to `src/ui/screens/ReceiptReview.tsx` and `src/ui/screens/Issue.tsx`
- [ ] T083 [US5] Write an E2E test (cancel a batch, adjust a pending settlement, re-cancel refused) in `tests/e2e/cancel.spec.ts`

---

## Phase 9: User Story 6 - المطبوعات والتصدير والنسخة الاحتياطية (Priority: P2)

**Goal**: printable documents, ledger rows for the workbook, and a full backup.

**Independent Test**: print a posted receipt to A4, and paste exported rows into a **copy** of the workbook so that its balances equal the app.

- [ ] T084 [P] [US6] Unit tests for ledger rows in `tests/unit/excel/ledgerRows.test.ts`:
  - columns A–R in table order;
  - formula columns empty;
  - signed تسوية;
  - ordering;
  - only movements not yet exported; **imported movements are never exported, so the first export after an import is empty**; exported IDs are added with `arrayUnion`;
  - dates written correctly under `TZ=Africa/Cairo`;
  - the capacity warning beyond row 595.
- [ ] T085 [P] [US6] Unit tests for the print files (official header rows, RTL view, A4, fit width, totals, signature block, the ملغي banner) in `tests/unit/excel/prints.test.ts`
- [ ] T086 [P] [US6] Unit tests for the backup workbook (three sheets with all fields) and the 7-day reminder in `tests/unit/excel/backup.test.ts`
- [ ] T087 [US6] Implement `src/excel/printReceipt.ts` and `src/excel/printIssue.ts` with ExcelJS so T085 passes
- [ ] T088 [US6] Implement `src/excel/ledgerRows.ts` and the "تم اللصق" confirmation that records exported IDs, so T084 passes
- [ ] T089 [US6] Implement `src/excel/backup.ts` and the reminder banner so T086 passes
- [ ] T090 [US6] Build the exports screen (print, ledger rows with steps, backup) in `src/ui/screens/Exports.tsx`
- [ ] T091 [US6] **Spike R8, with the user, on a COPY of the workbook**:
  1. Paste exported rows with Paste Special → Skip blanks. The set must include at least one إضافة, one صرف, one positive تسوية, one negative تسوية, one مرتجع and one reversal pair, and column D's validation must accept them.
  2. Check that the formula columns still calculate and that the touched items' balances equal the app.
  3. Record the outcome in `specs/001-daily-operations/research.md`.
  4. Switch to the two-block fallback if it fails.

---

## Phase 10: Polish & Cross-Cutting Concerns

- [ ] T092 [P] Motion pass per `docs/design/ui-inspiration.md` (8 moments, transform and opacity only, reduced-motion fallbacks). Check the easing values against the official Material 3 tokens in `src/ui/tokens.css`
- [ ] T093 [P] RTL and accessibility pass on the Android device: logical properties, `<bdi>` on codes, minimum 12 px text, contrast in dim light, two-line labels for long Arabic text
- [ ] T094 [P] Performance checks against plan.md goals: a Vitest bench for search under 100 ms over 97 items and 1,000 movements in `tests/unit/domain/search.bench.ts`, and a Playwright trace for offline cold start under 2 s after install in `tests/e2e/perf.spec.ts`
- [ ] T095 Run `impeccable detect` and the impeccable finish review on the built screens. Fix the findings, then write `DESIGN.md` with the documenter
- [ ] T096 Coverage gate (≥ 80% for domain, data and excel) and the real-workbook parity gate (`WORKBOOK_PATH=… npm run test:parity`)
- [ ] T097 Walk through `specs/001-daily-operations/quickstart.md` §4 on the phone with the user, timing SC-003 (a receive line under 30 s scanned and 45 s typed) and SC-004 (a 10-permit batch with one substitute under 5 min). Record the times in `specs/001-daily-operations/quickstart.md`
- [ ] T098 Run `pr-review` in a fresh context, fix the findings, then deploy (`npm run deploy`) after the user approves

---

## Dependencies & Execution Order

```text
Setup (T001–T013) ─▶ Foundational (T014–T034) ─▶ US1 Import (T035–T043)
                                                   │
                                                   ├─▶ US2 Receive (T044–T053) ─▶ US3 Issue (T054–T062) ─▶ US7 Offline (T063–T067)
                                                   │                                   │
                                                   └─▶ US4 Items (T068–T077)           └─▶ US5 Cancel (T078–T083)
                                                                                           US6 Outputs (T084–T091) needs US2 + US3
Polish (T092–T098) after all stories
```

- US1 comes first because every other story needs real items and balances.
- US3 reuses the document rules and the post-through-outbox path from US2.
- US7 hardens the offline paths that US2 and US3 created.
- US4 can run in parallel with US2 and US3 after US1.
- Within each story: tests (red) → domain → data → screens → E2E.

## Parallel Examples

- **Foundational tests**: T014, T015, T016, T017, T018, T019 and T020 together (separate files).
- **Foundational domain code**: T022, T023, T024 and T025 together once T021 lands.
- **US1**: T035, T036, T037 and T038 together, then T039 and T041 in parallel (separate files).
- **US3**: T054 and T055 together, then T056 alongside T058.
- **US6**: T084, T085 and T086 together.

## Implementation Strategy

1. **MVP = Setup + Foundational + US1 + US2 + US3 + US7.** This is the field-trial build. The
   storekeeper runs it beside the workbook. The parity gate is green.
2. **Increment 2**: US4 + US5. Full item card and corrections.
3. **Increment 3**: US6. Paper and workbook paste-back. After this the user can stop writing
   permits by hand (SC-009).
4. Polish, review, deploy. Then phase 2 (official monthly report and ID cards) gets its own
   spec.

**Totals**: 98 tasks. Setup 13 · Foundational 21 · US1 9 · US2 10 · US3 9 · US7 5 · US4 10 ·
US5 6 · US6 8 · Polish 7.
