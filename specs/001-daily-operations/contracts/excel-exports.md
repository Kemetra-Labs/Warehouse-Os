# Contract: Excel Outputs

All files are generated in the browser with ExcelJS and work offline (research R7). Every sheet
uses `rightToLeft: true`, A4 portrait, fit to 1 page wide, Arial, and gridlines off when printed.

## 1. إذن استلام: `استلام-{deliveryNo}.xlsx` (FR-060)

| Rows | Content |
|---|---|
| 1–3 | وزارة الصحة والسكان · مديرية الشئون الصحية بالقليوبية · مستشفى القناطر الخيرية (right-aligned, bold) |
| 4 | **إذن استلام — مخزن الشرائح والمسامير** (centered, larger) |
| 6–7 | الشركة · رقم إذن التسليم · رقم الفاتورة · التاريخ · الحالة: معتمد {postedAt} |
| 9 | header: م · ص · الكود · الصنف · التشغيلة · الصلاحية · الكمية بالفاتورة · الكمية المستلمة · سعر الوحدة · القيمة · ملاحظة الفرق |
| 10… | one row per line |
| after | الإجمالي (counted qty, value) |
| after +2 | signature boxes: أمين المخزن / مندوب الشركة / يعتمد (name, signature, date) |

Values use counted quantity × unit price. A cancelled receipt prints a red "ملغي" banner in row 4.

## 2. إذن صرف: `صرف-دفعة-{number}.xlsx` (FR-060)

The same header block. Title **إذن صرف — دفعة {number}**. Then: المندوب, التاريخ, أرقام الأذون
(comma list, wrapped).

Table columns: م · ص · الكود · الصنف · التشغيلة · الكمية · سعر الوحدة · القيمة · بدل عن.
"بدل عن" holds the requested item's name for substitutes.

Totals block: قيمة المطلوب · قيمة المصروف · الفرق.
Signatures: أمين المخزن / المندوب.

## 3. سطور سجل الحركات: `سطور-الحركات-{from}-{to}.xlsx` (FR-061, research R8)

- One sheet with columns **A–R in the exact order of table "الحركات"** ([excel-import.md](./excel-import.md)).
- **Formula columns (A, B, F, G, H, J, N, O) are left empty.**
- Input columns are filled:

| Col | Value |
|---|---|
| C | business date as an Excel date (not text), built from the `YYYY-MM-DD` parts as a UTC-midnight date so no time zone can shift the day |
| D | type, as the workbook expects it (see the note below) |
| E | code |
| I | quantity, as the workbook expects it (see the note below) |
| K | supplier |
| L | docNumber |
| M | note, plus the substitute text `بدل {name}` and the reason |
| P | reference |
| Q | batchNo |
| R | expiry as a date |

Notes on columns D and I:
- Most movements export their type and quantity as they are.
- A **تسوية with negative qty** exports as type تسوية with a negative quantity. The workbook's
  "تسويات" column (K on "الأرصدة اللحظية") is `SUMIFS(الكمية, نوع الحركة, "تسوية", …)` and the
  balance is `H − I + J + K`, so a signed تسوية is summed correctly (formula read on 2026-10-12).
  مرتجع is summed in J and adds. The current workbook has no تسوية or مرتجع rows yet, so the
  spike below must prove both.
- **Reversals** export as their تسوية row.

Rules:
- Rows are ordered by business date, then by posting time.
- The export includes only movements that are **not imported** (`source.kind != 'import'`) and not
  in `lastLedgerExportedIds`. The first export after an import is therefore empty. After the user
  confirms "تم اللصق" (pasted), the exported IDs are added with `arrayUnion`.
- A first-sheet note explains the steps: open this file → select rows (A:R) → copy → in the
  workbook select column A of the first empty row of the table → Paste Special → Skip blanks.
- **Spike acceptance**: on a copy of the real workbook, paste a set that includes at least one
  إضافة, one صرف, one positive تسوية, one negative تسوية, one مرتجع, and one reversal pair. After
  pasting, every touched item's balance in "الأرصدة اللحظية" equals the app. Column D's data
  validation must accept تسوية and مرتجع.
- Capacity: if `usedRows + newRows > 591` (data rows 5–595), show a warning to extend the table
  first.

## 4. Backup: `نسخة-احتياطية-{YYYY-MM-DD}.xlsx` (FR-062)

- Sheet "الأصناف": all item fields.
- Sheet "الحركات": all movement fields, including ID, source, reversal links, `postedAt`.
- Sheet "المستندات": receipts and issue batches with their lines, flattened.
- Saving it sets `settings/app.lastBackupAt`. The app reminds the user when it is older than
  7 days.
