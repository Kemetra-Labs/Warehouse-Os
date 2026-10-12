<!--
Sync Impact Report
- Version change: template → 1.0.0 (initial ratification)
- Principles defined: I. Sacred Custody Ledger; II. Price Snapshot per Movement;
  III. Excel Parity Is a Release Gate; IV. Offline Is Normal; V. Faster Than Paper, In Arabic;
  VI. Test-First (NON-NEGOTIABLE)
- Added sections: Data & Privacy Constraints; Development Workflow & Quality Gates; Governance
- Removed sections: none
- Templates: .specify/templates/plan-template.md ✅ (its generic "Constitution Check" gate reads
  these principles; no edit needed) · spec-template.md ✅ no change · tasks-template.md ✅ no change
  · .claude/skills/speckit-*/SKILL.md ✅ no agent-specific references to fix
- Follow-up TODOs: none
-->

# Warehouse OS Constitution

Warehouse OS is the custody and operations tool for the government plates-and-screws store
(مخزن الشرائح والمسامير) at مستشفى القناطر الخيرية. Product truth lives in `PRODUCT.md`.

## Core Principles

### I. Sacred Custody Ledger

- Every stock change is a movement (حركة) in one append-only ledger: إضافة، صرف، مرتجع، تسوية.
- A posted (معتمد) movement MUST NEVER be edited or deleted, by any user, client, or code path.
  This MUST be enforced by the data store's own access rules, not only by the UI.
- Corrections are made by a reversing movement linked to the original, followed by a new one.
  Both stay visible in the item's card.
- Work in progress lives in drafts (مسودة). Drafts are freely editable and do not affect
  balances until posted.
- Balances are always derived from movements. No balance is stored as an independent truth.
- Every movement records who posted it, when it was posted (system time), and its business date
  (chosen by the user).

Rationale: this is government custody (عهدة). The ledger must answer "who changed what, when,
and why" years later, and must be provably untampered.

### II. Price Snapshot per Movement

- The item price is the latest purchase price, updated by the receipt that carried it.
- Every movement MUST store the unit price in force when it was posted. Reports for a past
  period MUST use those stored prices, never today's price.

Rationale: a monthly report handed to custody audit must reproduce the same values forever.

### III. Excel Parity Is a Release Gate

- Until the user retires the workbook, the app MUST reproduce the workbook's balances exactly.
  For the imported history, every item's balance MUST equal the cached value of the workbook's
  "الأرصدة اللحظية" sheet. An automated test using the real workbook enforces this.
- Business rules copied from the workbook (balance sign rules, status thresholds, reorder point)
  MUST match its formulas. Any intentional deviation MUST be written down and approved.
- Printed outputs MUST match the official layouts the user already hands in.

Rationale: the user trusts the app only when it agrees with the book he already trusts.

### IV. Offline Is Normal

- Every operation (receive, issue, return, adjust, look up, print) MUST work with no
  connectivity and sync automatically when connectivity returns. No step may lose data while
  offline.
- Sync state MUST always be visible: fully synced, or N movements waiting.
- Conflicts resolve without losing posted movements: concurrent movements merge as a union; a
  balance that turns negative after sync is flagged for review, never silently "fixed".

Rationale: mobile internet in the store is intermittent, and the phone is the primary tool.

### V. Faster Than Paper, In Arabic

- Arabic, right-to-left, in the store's own vocabulary (the workbook's terms) throughout.
- The phone flows for receiving and issuing MUST be usable one-handed and MUST be faster than
  writing the paper permit.
- The camera is a shortcut, never a dependency: every lookup MUST also accept typed input
  (page number, GTIN, item code, or part of the name).
- The colour reserved for "posted" (the approval seal) MUST NOT be used for anything else.

### VI. Test-First (NON-NEGOTIABLE)

- Tests are written and seen failing before the implementation (red, green, refactor).
- Coverage of business logic MUST be at least 80%.
- Required suites: unit tests for ledger rules; access-rule tests proving posted movements cannot
  be changed or deleted and that only the owner has access; the Excel parity test; end-to-end
  tests for receiving and issuing, online and offline.

## Data & Privacy Constraints

- No patient data. Issue batches store patient permit numbers only, never names or file
  numbers.
- Only the owner's account may read or write data. Single user in phase 1; no roles.
- The user MUST be able to take a full backup (all items and movements) as an Excel file at any
  time, and the app prompts for one when the last backup is older than 7 days.
- No secrets in the repository. Configuration comes from the environment.

## Development Workflow & Quality Gates

- Flow per feature: spec → user review → plan → tasks → implement, using Spec Kit
  (`specs/NNN-name/`).
- Before any merge: lint, type check, all tests green, parity test green, and a code review
  (the `pr-review` skill, run in a fresh context when the same session wrote the change).
- Commits follow `<type>: <description>` (feat, fix, refactor, docs, test, chore, perf, ci).
- Files stay focused (about 200–400 lines, 800 max); functions under 50 lines.

## Governance

- This constitution overrides other practice documents for this project. `PRODUCT.md` holds
  product truth; this file holds the rules the implementation must obey.
- Amendments: propose the change with its reason, get the owner's approval, bump the version
  (MAJOR for removing or redefining a principle, MINOR for adding one, PATCH for wording), and
  update dependent templates in the same change.
- Every plan's "Constitution Check" and every review MUST verify compliance with Principles
  I–VI. A violation needs a written justification in the plan's Complexity Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-10-12 | **Last Amended**: 2026-10-12
