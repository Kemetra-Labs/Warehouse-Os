# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

React + TypeScript installable PWA (Arabic, RTL), Firebase (Firestore with offline persistence, Google sign-in restricted to the owner's account, Firebase Hosting). Chosen with the user during brainstorming (approach "أ").

## Users

One storekeeper (أمين المخزن), currently the only user, running the government plates-and-screws (شرائح ومسامير) implants store at مستشفى القناطر الخيرية (Ministry of Health and Population, Qalyubia health directorate). He uses an Android phone while standing in the store, receiving deliveries from suppliers or settling issues with a supplier representative. He uses a laptop for review, reports and Excel export.

## Product Purpose

Replace a 24-sheet Excel workbook and the paperwork around it with a tool he holds while working. It keeps an append-only custody ledger (العهدة): a posted movement is never edited or deleted, and corrections are reversing movements. Success means balances match the Excel workbook throughout the parallel-run period, and every official document prints in its existing government layout without manual fixes. After that he retires the Excel file.

## Positioning

Built around this store's real rituals, not generic inventory: permit-batch issuing to the representative with same-category, nearest-price substitution recorded at the moment of issue; barcode (GTIN, EAN-13) receiving with batch and expiry; latest-purchase-price valuation with a price snapshot on every movement; and exports into the store's own Excel templates.

## Operating Context

- **Receiving (استلام):** a supplier (e.g. المركز الدولي، إيجي فيكس) delivers with a delivery note (إذن تسليم) and invoice. Boxes carry linear GTIN barcodes. Batch (تشغيلة) and expiry are typed once per batch.
- **Issuing (صرف):** a representative (مندوب) brings a bundle of patient permits (أذون المرضى). Required quantities are aggregated. Missing items are substituted with an in-stock item from the same category at the same or nearest price. Records show what physically left; the requested item is kept as a note. Only permit numbers are stored, never patient names.
- **Connectivity:** mobile internet in the store is intermittent, so every action must work offline and sync later.
- **Parallel run:** the app outputs rows in the column order of the Excel "سجل الحركات" sheet for pasting into the workbook.
- **Documents:** إذن استلام، إذن صرف، كشف الحركة الشهري، كارت تعريف الصنف، كشف الجرد والعجوزات والزيادات.

## Capabilities and Constraints

- 97 items (verified from the workbook on 2026-10-12) in 7 categories: شرائح تشريحية 30، مسامير تثبيت 20، شرائح عامة ومقاسات 20، مسامير نخاعية وديناميكية 13، مثبتات خارجية 6، أسلاك ودبابيس 6، أصناف أخرى 2. Only 47 items have a GTIN recorded. The item's page number (رقم الصفحة) is its serial 1–97. Item codes look like `NAL-04`, `SCR-01`, `PLA-28`, `PLG-04`, `FIX-01`, `WIR-01`.
- Movement types: إضافة، صرف، مرتجع، تسوية.
- Draft, then post (اعتماد). Issuing beyond the balance is allowed with a confirmation and a reason; the item then appears under pending settlements (تسويات معلّقة).
- Phases: (1) daily operations (import, items, receiving, issuing, returns and adjustments, receipt and issue documents, Excel paste rows, offline, backup); (2) official prints (monthly movement report, item ID cards, dashboard, expiry alerts); (3) stock count (shortages, surpluses, remaining).
- Out of scope: multiple users or roles, patient data, app-store distribution.

## Brand Commitments

Carries the hospital's identity, not a separate product name: "مخزن الشرائح والمسامير — مستشفى القناطر الخيرية". The official header (وزارة الصحة والسكان / مديرية الشئون الصحية بالقليوبية / مستشفى القناطر الخيرية) appears on printed documents.

## Evidence on Hand

- `E:\شرائح ومسامير\شرائح و مسامير.xlsx`: the current workbook (item master, 237 movements Aug–Sep 2026, balances, count, shortages, substitutions, monthly report layout, batch numbers).
- `E:\شرائح ومسامير\كروت تعريف--شرائح ومسامير.docx`: the official item ID card layout.
- No official template exists yet for the receipt or issue documents.

## Product Principles

1. Faster than paper in the hand: the phone flow must beat writing the permit by hand.
2. The ledger is sacred: nothing posted is ever edited or deleted, and every substitution leaves a trace.
3. Offline is normal, not an error state, and sync status is always visible.
4. The paper output must look like the paper he already hands in.
5. Plain Egyptian-Arabic working vocabulary, the words already used in the workbook.

## Accessibility & Inclusion

Arabic RTL throughout. Large one-hand touch targets for use while holding boxes. Readable in a dim storeroom.
