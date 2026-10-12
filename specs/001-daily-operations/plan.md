# Implementation Plan: الشغل اليومي لمخزن الشرائح والمسامير (المرحلة 1)

**Branch**: `claude/warehouse-management-app-e964ec` | **Date**: 2026-10-12 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-daily-operations/spec.md`

## Summary

Phase 1 replaces the storekeeper's daily Excel and paper work with an installable, offline-first
Arabic PWA. It covers:
- importing the workbook and proving 97/97 balance parity;
- receiving with barcode or typed lookup and a double count (invoiced vs counted);
- issuing to the representative with same-category nearest-price substitutes;
- the item list and item card;
- reversals, returns and adjustments;
- printable receipt and issue documents, ledger rows for the workbook, and backup.

**Technical approach**:
- The client is React and TypeScript on Cloud Firestore, using Firestore's persistent offline
  cache.
- The append-only ledger is enforced by Security Rules.
- Deterministic document IDs prevent duplicates.
- Balances are derived on the client.
- SheetJS reads the workbook and ExcelJS writes all Excel outputs, both in the browser.
- An IndexedDB outbox keeps every posted document until the server acknowledges it, so a write
  rejected after an offline period is shown and kept, never silently lost (research R12).

Details: [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 7 (strict), targeting ES2022. Node 22 for tooling.

**Primary Dependencies**:
- React 19, React Router 8, Vite 8, `vite-plugin-pwa` 2;
- `firebase` 13 (Firestore with `persistentLocalCache`, Auth);
- SheetJS CE 0.20.3 (reads the user's workbook; ExcelJS cannot open it), ExcelJS 4.4 (writes
  prints, exports and backup), `barcode-detector` 3 (ZXing WASM ponyfill), zod 4.

**Storage**: Cloud Firestore (Spark free tier), with IndexedDB offline persistence on each device.

**Testing**:
- Vitest 5 (unit and parity);
- `@firebase/rules-unit-testing` 6 with the Firestore emulator (rules);
- Playwright 1.64 (E2E, including offline and a fake camera).

**Target Platform**:
- Android Chrome (primary, installed PWA);
- desktop Chrome or Edge on Windows (laptop).

**Project Type**: Single-page web application (static hosting; no custom backend).

**Performance Goals**:
- Search result under 100 ms on a mid-range Android device.
- Scan-to-item under 500 ms.
- App cold start offline under 2 s after install.
- Supports SC-003 (receive line under 30 s) and SC-004 (10-permit batch under 5 min).

**Constraints**:
- Fully offline after first sign-in (constitution IV).
- Owner-only access.
- No patient data.
- Fonts and WASM self-hosted.
- Free tier only.
- Arabic RTL.

**Scale/Scope**:
- 1 user, 2 devices, 97 items (growing slowly);
- about 1,000 movements a year;
- 12 screens.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | How this plan complies | Status |
|---|---|---|
| I. Sacred Custody Ledger | `movements` is create-only in the rules. Drafts are separate documents and do not affect balances. Reversals use `rev-{id}` (only once). Balances are derived, never stored. Every movement has `postedAt` (server) and `businessDate` (user). | ✅ |
| II. Price Snapshot | `priceMinor` is stored on every movement. Receipt posting updates the item price. Reports use the movement price. Imported history uses the current price, which is documented as a known limitation (the workbook has no historical prices). | ✅ (limitation recorded) |
| III. Excel Parity Gate | The parity suite on the real workbook (`WORKBOOK_PATH`) is a release gate. The status and reorder formulas are copied from the workbook (data-model "Derived state"). Paste-back is verified by a spike (R8). | ✅ |
| IV. Offline Is Normal | Firestore persistent cache, a PWA precache of the shell, fonts and WASM, and a sync pill driven by pending-write metadata, not `navigator.onLine`. The outbox keeps writes the server rejects after sync (R12). | ✅ |
| V. Faster Than Paper, In Arabic | A single search input that understands page number, GTIN, code or name, so the camera is optional. RTL with logical CSS. Violet is reserved for the seal. One-handed thumb-zone actions. | ✅ |
| VI. Test-First | The test suites in R11 are written before the code in each task. Coverage of at least 80% for `src/domain` and `src/data`. | ✅ |
| Data & Privacy | Permit numbers only. Owner UID injected at deploy, not committed. The workbook is never committed. | ✅ |

**Post-design re-check** (after data-model and contracts): still passes. There are no
violations, so Complexity Tracking stays empty.

## Project Structure

### Documentation (this feature)

```text
specs/001-daily-operations/
├── plan.md              # this file
├── research.md          # Phase 0: decisions R1–R11
├── data-model.md        # Phase 1: collections, derived state
├── quickstart.md        # Phase 1: run, test, accept, deploy
├── contracts/
│   ├── firestore-rules.md   # server-enforced access + immutability contract
│   ├── excel-import.md      # workbook → items/movements mapping + parity
│   └── excel-exports.md     # receipt/issue prints, ledger rows, backup
├── checklists/requirements.md
└── tasks.md             # Phase 2 (/speckit-tasks, not created here)
```

### Source Code (repository root)

```text
src/
├── domain/                  # pure TypeScript, no Firebase/React; most unit tests live here
│   ├── types.ts             # Item, Movement, Receipt, IssueBatch (zod schemas + types)
│   ├── ledger.ts            # effect(), balances, batch balances, reversal builder
│   ├── status.ts            # monthsOfConsumption, reorderPoint, status, pendingSettlement
│   ├── substitutes.ts       # same-category nearest-price ranking
│   ├── search.ts            # classify(input) → gtin | page | code | name; Arabic digit normalisation
│   ├── receipt.ts           # draft validation + toMovements() on post
│   ├── issue.ts             # aggregate requested, coverage check, toMovements() on post
│   ├── items.ts             # item validation (unique code/page, GTIN format and uniqueness)
│   ├── settings.ts          # settings validation (coverage months, default reorder point)
│   └── money.ts             # piastres helpers, formatting (Western digits)
├── data/                    # Firebase adapters (repository pattern)
│   ├── firebase.ts          # app init, persistentLocalCache, emulator switch
│   ├── auth.ts              # Google sign-in, owner check
│   ├── repos/               # items.ts, movements.ts, receipts.ts, issues.ts, settings.ts
│   ├── importWriter.ts      # batched, resumable import writes (contracts/excel-import.md)
│   ├── useLedger.ts         # derived balances, statuses, pending settlements, changed-since-seen
│   ├── sync.ts              # pending-writes / synced state from snapshot metadata
│   └── outbox.ts            # IndexedDB copy of each post/cancel batch until server ack (R12)
├── excel/
│   ├── importWorkbook.ts    # contracts/excel-import.md
│   ├── parity.ts            # compare with cached الأرصدة اللحظية
│   ├── printReceipt.ts      # contracts/excel-exports.md §1
│   ├── printIssue.ts        # §2
│   ├── ledgerRows.ts        # §3
│   └── backup.ts            # §4
├── scan/
│   ├── Scanner.tsx          # camera viewfinder, continuous mode, haptics, beep
│   └── detector.ts          # barcode-detector ponyfill wrapper
├── ui/
│   ├── tokens.css           # palette, type, spacing, motion tokens (docs/design/ui-inspiration.md)
│   ├── components/          # SyncPill, SearchBox, CountTable, Seal, BottomSheet, StatusDot, Bdi, ItemRow …
│   └── screens/             # Home, Receive, ReceiptReview, Issue, SubstituteSheet, Items, ItemCard,
│                            # ItemEdit, Movements, Adjust, ImportParity, Exports, Unsent, Settings, SignIn
├── app/                     # routes, providers, PWA update prompt
└── main.tsx

tests/
├── unit/                    # mirrors src/domain, src/excel mappings
├── rules/                   # contracts/firestore-rules.md tests 1–9
├── parity/                  # real workbook (WORKBOOK_PATH) + synthetic fixture
├── e2e/                     # Playwright: receive, issue, offline sync, cancel
└── fixtures/                # mini-workbook.xlsx generator + EAN-13 test frames

firestore.rules.template     # rendered to firestore.rules by scripts/render-rules.mjs
firebase.json · .firebaserc · .env.example · scripts/
```

**Structure Decision**: one Vite SPA with no backend. Pure business rules live in `src/domain`
so they can be tested without Firebase. That code is where parity and the ledger rules are
proven. Firebase is behind repositories in `src/data`, following the repository pattern from the
project rules. Excel I/O is isolated in `src/excel` because it carries the parity and paste-back
contracts.

## Design Notes

These notes carry decisions from brainstorming and from `docs/design/ui-inspiration.md`.

- **Visual world**: the "operating-room count board". Scrub-green shell `#0f5f58`,
  whiteboard-white ground `#f4f7f6`, marker blue for counts, red for mismatch, green for match.
  Almarai, self-hosted, with tabular figures.
  - **Signature moves**: the requested/counted double-count table, and the violet `#5b2d8e`
    approval seal on posting. Violet is never used elsewhere.
  - Approved mockups: [docs/design/mockups/issue-flow.html](../../docs/design/mockups/issue-flow.html)
    and [docs/design/mockups/receiving-flow.html](../../docs/design/mockups/receiving-flow.html).
    These are fragments made for the brainstorm viewer, so they render unstyled outside it.
  - The direction contract is recorded with the impeccable surface brief at the start of
    implementation.
- **Motion**: 8 moments from the inspiration report's motion table. Examples: seal 420 ms
  emphasized-decelerate; scan confirm 200 ms; sheet 300/200 ms. Only `transform` and `opacity`
  are animated, and every moment has a `prefers-reduced-motion` fallback. Easing values must be
  checked against official Material 3 tokens before shipping (the report flags them as
  unverified).
- **Deviation from the report**: a row changed by sync is marked with a tint plus a small
  marker-blue dot, **not** a 3 px inline-start bar. Thick side-stripe accents are banned by the
  project's design floor.
- **Scanning**:
  - The whole viewfinder is the tap target, with continuous mode while receiving.
  - Each scan of a known GTIN increments the line's counted quantity by 1. The quantity is also
    typeable.
  - A known code gets a green outline with a tick glyph, a beep and a vibration. An unknown code
    gets a red outline with a cross glyph.
- **RTL**:
  - Logical CSS properties only.
  - Codes, GTINs, batch numbers and sizes are wrapped as LTR isolates (`<bdi dir="ltr">`).
  - Western digits everywhere, matching the workbook. Quantity inputs use `inputmode="numeric"`.
- **Sync pill states**: `synced` (solid) / `pending N` (dashed) / `failed` (red dashed, tap to
  retry). Driven by Firestore `hasPendingWrites` and `waitForPendingWrites()`.

## Delivery Slices (input for /speckit-tasks)

Each slice ends test-green and demoable. The order follows the spec's priorities and
dependencies.

1. **Foundation**: Vite, PWA, TypeScript strict, lint, Vitest, Playwright, the emulator,
   `.gitattributes` (LF for `*.sh`), tokens and fonts, auth with owner gate, sync pill. Rules
   contract tests 1–2 and 9.
2. **Domain core**: `ledger`, `status`, `search`, `substitutes`, `money`, with unit tests (TDD).
3. **Import + parity** (US1): `importWorkbook`, the parity screen, the parity suite (real + fixture), rules tests 3–6.
4. **Items + item card** (US4).
5. **Receiving** (US2): the scanner, receipt draft/review/post, GTIN linking, price update, rules
   test 7.
6. **Issuing** (US3): the batch, aggregation, the substitute sheet, negative issue with reason,
   seal.
7. **Reversal / return / adjust** (US5): rules tests 5 and 8.
8. **Outputs** (US6): print receipt and issue, ledger rows (with the R8 paste spike on a workbook
   copy), backup and reminder.
9. **Offline hardening** (US7): E2E offline on two browser contexts, post-sync negative flag,
   duplicate batch-number warning, the outbox, and the rejected-write E2E case (R12).
10. **Finish**: impeccable finish review on the real screens, accessibility and RTL pass on the
    device, the quickstart walk-through, `pr-review`, deploy.

## Complexity Tracking

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| Principle II, partially: imported history (237 movements) stores the item's price **at import time**, not a true historical price | The workbook keeps one price per item (column K) and no price per movement, so no historical price exists to import. The workbook's own value columns use that same single price, so imported values match the workbook exactly (parity, Principle III). Every movement posted in the app stores its real price at posting. | Leaving `priceMinor` empty on imported rows would break value totals and the backup. Inventing past prices would fabricate custody data. |
