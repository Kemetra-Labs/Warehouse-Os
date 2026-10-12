# Quickstart: Daily Operations (Phase 1)

How to run, test, and verify phase 1 locally. Windows 11 with Git Bash. Toolchain present on
2026-10-12: Node 22.14, npm 10.9, Firebase CLI 15 (pinned as a dev dependency), and **Java 21** for the Firestore emulator. firebase-tools 15.33 refuses Java 17; this machine has Java 17, so local rules tests need JDK 21 installed. CI uses Java 21.

## 1. Install and configure

```bash
npm ci
cp .env.example .env.local   # fill VITE_FIREBASE_* and OWNER_UID; never commit .env.local
```

## 2. Run against the emulators (no cloud, no cost)

```bash
npm run emulators            # Firestore + Auth emulators, rules rendered with a test OWNER_UID
npm run dev                  # Vite dev server; the app talks to the emulators when VITE_USE_EMULATORS=1
```

To try it on the Android phone over Wi-Fi, run `npm run dev -- --host` and open the printed LAN
URL. The camera needs HTTPS or localhost, so use `npm run dev:https`, which uses a local
self-signed certificate.

## 3. Tests

```bash
npm run test:unit            # Vitest: ledger math, status, reorder, substitutes, search, import/export mapping
npm run test:rules           # rules contract tests (contracts/firestore-rules.md) against the emulator
npm run test:e2e             # Playwright: receive and issue flows, online and offline (context.setOffline)
npm run test:parity          # real-workbook parity; needs WORKBOOK_PATH (see below)
```

Run the parity gate against the real workbook. This is mandatory before every release
(constitution III):

```bash
WORKBOOK_PATH="E:/شرائح ومسامير/شرائح و مسامير.xlsx" npm run test:parity
```

Expected result: 97 items and 237 movements imported, 97/97 balances equal to "الأرصدة اللحظية"
column L, and statuses equal after the 6 dates are corrected in the workbook. The workbook is
government custody data: it stays on `E:` and is never copied into the repo. CI runs the same
suite on `tests/fixtures/mini-workbook.xlsx`, a synthetic fixture.

## 4. Manual acceptance walk-through (on the phone)

1. Sign in with the owner's Google account. Import the workbook, then check the parity screen
   shows 97/97.
2. Turn on airplane mode. Create a receipt with 4 lines: one scanned, one typed by page number,
   one unknown GTIN, and one with counted ≠ invoiced. Post it. The seal appears and the header
   shows "4 مستنية النت".
3. Still offline, create an issue batch with one short item. Choose the nearest-price substitute
   and post it.
4. Turn airplane mode off. The header becomes "متزامن". Open the laptop: both documents and all
   balances are there.
5. Export "سطور لسجل الحركات". On a **copy** of the workbook, paste with Skip blanks. The
   touched items' balances in Excel equal the app's.
6. Print the receipt and the issue batch to A4.
7. Cancel the issue batch. The red "ملغي" seal appears and the balances return. Try to cancel it
   again: it is refused.

## 5. Deploy

```bash
npm run build
npm run deploy               # renders firestore.rules with OWNER_UID from .env.local, deploys hosting + rules together
```
