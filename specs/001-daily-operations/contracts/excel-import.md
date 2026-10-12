# Contract: Workbook Import and Parity

**Input**: the user's workbook `شرائح و مسامير.xlsx`, read in the browser with SheetJS CE 0.20.3 (research R6; ExcelJS cannot open this file).
**Output**: `items/*`, `movements/imp-r{row}`, `settings/app.workbookImport`, and a parity report.

## Preconditions (the import aborts with a named message if any fails, and writes nothing)

- The sheets "القائمة الاساسية", "سجل الحركات" and "الأرصدة اللحظية" exist.
- Row 4 of "سجل الحركات" holds the 18 headers below, in order (A4:R4). This is checked by
  header text, because SheetJS CE does not expose Excel table definitions. The data rows are
  5–595, the extent of the workbook's "الحركات" table.
- `settings/app.workbookImport` is null (FR-004). Otherwise the user sees "اتستورد قبل كده بتاريخ …"
  and no write happens.

## Items: sheet "القائمة الاساسية", header row 4, data from row 5 until column D is empty

| Workbook column | Header | Field |
|---|---|---|
| A | م | `page` |
| B | الفئة | `category` |
| C | الكود | `code` (doc ID) |
| D | الصنف | `nameAr` |
| E | الاسم الإنجليزي المعتمد / Item Name (English) | `nameEn` |
| F | الخامة | `material` (`غير محددة` → null) |
| G | المقاس / المواصفة | `size` (`—` → null) |
| H | الوحدة | `unit` |
| I | الرصيد الافتتاحي (ثابت) | **not imported as a movement** (FR-002); kept only in the parity report |
| K | سعر القطعة (ج) | `priceMinor = round(K × 100)` |
| M | الشركة الموردة | `supplier` |
| N | GTIN | `gtins = [String(N)]` when it is 8 or 13 digits, else `[]`. A numeric cell is converted with no loss (13 digits < 2^53). The import asserts the count it found (47 on the current workbook) and lists rejected values. |
| P | حالة الصنف | `active = (P != 'موقوف')` |
| R | حد الطلب (يدوي) | `reorderManual` (empty → null) |

Expected on the current workbook: **97 items**, of which 47 have a GTIN.

## Movements: table "الحركات" (A4:R595), one movement per row where column E (الكود) is non-empty

| Col | Header | Kind | Field |
|---|---|---|---|
| A | م | formula | — |
| B | مسلسل الصنف | formula | — |
| C | التاريخ | input | `businessDate`, computed from the raw Excel date **serial** (read with `cellDates: false`) by integer arithmetic, so no time zone is involved; **2026-01-08 → 2026-08-01**, FR-005 |
| D | نوع الحركة | input | `type` (must be one of the 4 types) |
| E | الكود | input | `itemCode` (must exist in items) |
| F | الصنف | formula | — (cross-checked: must equal the item's `nameAr`; a mismatch is a warning) |
| G | الخامة / المواصفة | formula | — |
| H | الوحدة | formula | — |
| I | الكمية | input | `qty` |
| J | الأثر على الرصيد | formula | — |
| K | الشركة الموردة | input | `supplier` |
| L | رقم الفاتورة / الإذن | input | `docNumber` |
| M | ملاحظات | input | `note` |
| N | الرصيد الجاري بعد الحركة | formula | — |
| O | تحقق | formula | — |
| P | المرجع | input | `reference` |
| Q | رقم التشغيلة | input | `batchNo` |
| R | تاريخ الانتهاء | input | `expiry` |

Other imported fields:
- `id = imp-r{excelRow}`, `source = {kind:'import', row}`.
- `priceMinor` is the item's current price. The workbook has no price per movement, so this is
  documented as a known limitation for imported history.
- `postedAt = request.time`.

Expected on the current workbook: **237 movements** (148 إضافة, 89 صرف). Of these, 94 have the
note "رصيد افتتاحي" and 35 the note "تسوية عجز الجرد" (they stay صرف).

The import writes in batches of at most 450 operations. The items batch commits first.

**Resume**: movements are create-only, so re-sending a batch that holds even one existing
`imp-r{row}` fails as a whole. Before each run the import reads the set of existing `imp-r*`
IDs and items, and **skips** those already written. A partial failure can then be resumed by
pressing import again. `settings/app.workbookImport` is written only after the last batch
succeeds.

## Parity report (FR-003, SC-001)

For each item, compare:
- the app balance with sheet "الأرصدة اللحظية" column L (cached value), matched on column C
  (code);
- the app status with column N.

**Pass**: 97/97 balances equal. Statuses equal once the 6 dates are also corrected in the
workbook. Until then, status differences are listed with "سبب محتمل: تاريخ الحركات الست"
(reason: the six-movement date issue).
