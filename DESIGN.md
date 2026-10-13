---
name: مخزن الشرائح والمسامير
description: Arabic RTL nursing-station status board for a hospital implants store. Dark station-teal ground, state tiles filled by form and hue, one reversed next step, one violet seal.
colors:
  ground: "#0e2a30"
  panel: "#16404a"
  panel-2: "#1c4c57"
  bone: "#f4f8f8"
  muted: "#a9c4c6"
  hair: "rgba(244, 248, 248, 0.14)"
  control-line: "#6f9ba1"
  ok: "#22b07d"
  short: "#ef4f4f"
  attn: "#f5a524"
  count: "#5aa8ff"
  ink-on-fill: "#0b2126"
  ok-ink: "#6fe3b3"
  short-ink: "#ff9090"
  count-ink: "#7dbaff"
  seal: "#6d3fd8"
  tint-miss: "#3b2d35"
  tint-amber: "#3a3a26"
  tint-marker: "#1b4a63"
  tint-neutral: "#1c4c57"
  amber-line: "#a8741c"
  disabled-bg: "#27505a"
  disabled-ink: "#b4cdd0"
  scrim: "rgba(4, 16, 19, 0.62)"
typography:
  numeral:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "46px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tabular-nums"
  stepper:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "40px"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "tabular-nums"
  display:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 800
    lineHeight: 1.3
  headline:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.5
  title:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.5
  station:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 800
    lineHeight: 1.3
  body:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
    fontFeature: "tabular-nums"
  body-small:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 700
    lineHeight: 1.5
rounded:
  mark: "3px"
  check: "6px"
  badge: "8px"
  sm: "10px"
  md: "12px"
  sheet: "16px"
  pill: "99px"
spacing:
  "1": "4px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "24px"
  "6": "32px"
  "7": "48px"
components:
  button-primary:
    backgroundColor: "{colors.bone}"
    textColor: "{colors.ground}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-main:
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    height: "64px"
  button-square:
    rounded: "{rounded.md}"
    width: "44px"
    height: "44px"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.bone}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "44px"
  button-danger:
    backgroundColor: "transparent"
    textColor: "{colors.short-ink}"
    rounded: "{rounded.md}"
    height: "44px"
  button-seal:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.bone}"
    rounded: "{rounded.md}"
    height: "44px"
  button-disabled:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
  search-input:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bone}"
    typography: "{typography.station}"
    rounded: "{rounded.md}"
    padding: "0 16px"
    height: "52px"
  state-tile-short:
    backgroundColor: "{colors.short}"
    textColor: "{colors.ink-on-fill}"
    typography: "{typography.numeral}"
    rounded: "{rounded.md}"
    padding: "12px 12px 10px"
    height: "118px"
  state-tile-attn:
    backgroundColor: "{colors.attn}"
    textColor: "{colors.ink-on-fill}"
    rounded: "{rounded.md}"
    height: "118px"
  state-tile-count:
    backgroundColor: "{colors.count}"
    textColor: "{colors.ink-on-fill}"
    rounded: "{rounded.md}"
    height: "118px"
  state-tile-hollow:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    rounded: "{rounded.md}"
    height: "118px"
  item-row:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bone}"
    rounded: "{rounded.md}"
    padding: "12px 14px"
    height: "44px"
  status-badge:
    textColor: "{colors.ink-on-fill}"
    rounded: "{rounded.badge}"
    size: "28px"
  item-mark:
    rounded: "{rounded.mark}"
    size: "14px"
  checkbox:
    rounded: "{rounded.check}"
    size: "22px"
  chip:
    backgroundColor: "{colors.panel-2}"
    textColor: "{colors.bone}"
    typography: "{typography.label}"
    rounded: "{rounded.pill}"
    height: "44px"
  bottom-sheet:
    backgroundColor: "{colors.panel}"
    textColor: "{colors.bone}"
    rounded: "{rounded.sheet}"
    padding: "0 16px 16px"
  nav:
    backgroundColor: "{colors.ground}"
    textColor: "{colors.muted}"
    typography: "{typography.label}"
    height: "68px"
---

# Design System: مخزن الشرائح والمسامير

Written from the code that shipped on branch `claude/redesign-finish` (2026-10-13). The sources were `src/ui/tokens.css`, `src/app/Shell.*`, the CSS modules in `src/ui` and `src/scan`, the enforced rules in `tests/unit/ui/designRules.test.ts`, and the captures in `.impeccable/review/` (412 x 915, plus `desktop.png` at 1440 x 900). The approved comp is `.impeccable/mocks/status-board/index.html`. Where the comp or the direction contract (`.impeccable/surfaces/src-ui-tokens-css.md`) and the code differ, this file records what the code does. This file replaces the earlier whiteboard and count-board system.

## Overview

**Creative North Star: "The Nursing-Station Status Board"**

The store reads like the board at a nursing station. Every count that matters is a tile filled with its state colour, readable at arm's length in a dim storeroom. Each screen offers exactly one next step, and that step is the only reversed (bone-filled) element on the screen. The ground is a deep station teal, panels are a step lighter, and text is bone. The four state colours (ok green, short red, attention amber, count blue) are bright fills with dark ink on them. Violet appears in one place only: posting.

The storekeeper holds a phone in one hand and a box in the other, often offline. The board is dense but loud where it counts. Numerals are huge and tabular, labels are small, and targets are big. State is always shown by form (solid, hollow, struck, ringed, glyph) as well as hue. There is no glass, no gradient, no texture, and no SaaS dashboard of soft white cards. The old light whiteboard and scrub-green header are gone, and the theme is dark only.

**Key Characteristics:**

- Dark only. `color-scheme: dark`, with no `prefers-color-scheme` branch (enforced by test).
- Arabic first and RTL. Logical properties only (enforced by test).
- Almarai 400/700/800 only. Numerals are tabular, the 12 px floor is enforced by test, and the numerals are the loud part.
- One reversed primary per screen, 64 px, fixed in the thumb zone above the bottom navigation.
- State by form and hue: filled tile, hollow tile at zero, struck square, solid square, hollow ring, glyph badge.
- Violet means posting: the seal, and the one button that makes it.
- Flat panels. The bottom sheet is the only shadowed layer.

## Colors

A deep teal ground with bone text and four saturated state fills. Each state has a lighter "ink" variant for use as text on dark. Every text pair in use clears 4.5:1, and every meaningful edge or fill clears 3:1 against the ground. `designRules.test.ts` checks the pairs on each run.

### Primary

- **Bone** (`bone`): body text, and the fill of the one reversed primary button (ground-coloured text on it). Reversal is the primary's whole identity.
- **Station Teal** (`ground`): the page, the station bar, the bottom nav, and the fixed action bar. It is also the text colour on the reversed primary.

### Secondary

- **Seal Violet** (`seal`): the posted seal's disc and the `seal` button variant that posts (اعتماد). It is always a solid form with bone on it.

### Tertiary (state)

- **Count Blue** (`count`) / **Count Ink** (`count-ink`): fills the pending-settlement tile, the focus ring, the checked checkbox or radio, selection, the active nav icon, the changed-since-seen dot, and the 40 px stepper numeral. Its ink is used for links, the caret and blue text.
- **Short Red** (`short`) / **Short Ink** (`short-ink`): fills the out-of-stock tile, the struck item mark, the miss badge, the cancelled seal and the mismatch row outline. Its ink is used for negative balances, danger buttons, invalid quantities and the failed sync label.
- **Attention Amber** (`attn`): fills the needs-reorder tile and the reorder mark. The same hex is used as text on dark (it passes 4.5:1), for missing header fields, the pending sync label and warnings.
- **OK Green** (`ok`) / **OK Ink** (`ok-ink`): fills the match badge and the known-scan chip. Its ink is used for the synced label and zero-difference totals.
- **Ink on Fill** (`ink-on-fill`): the only text or glyph colour that sits on a state fill.

### Neutral

- **Panel** (`panel`): rows, count-table rows, search, sheets and summary cells. **Raised Panel** (`panel-2`): stepper buttons, chips, a pressed plain filter, and the reduced-motion press. Only bone, muted or ok-ink text may sit on it.
- **Muted** (`muted`): secondary text, labels, placeholders, inactive nav and hollow tile text.
- **Hair** (`hair`): decorative dividers and hollow edges (tiles at zero, disabled buttons, secondary rows). It does not meet 3:1 and never carries meaning alone.
- **Control Line** (`control-line`): the edge of anything typed into or checked: inputs, the checkbox and radio, the secondary button and the sheet handle.
- **Tints** (`tint-miss`, `tint-amber`, `tint-marker`, `tint-neutral`) with **Amber Line** (`amber-line`): notice washes such as the backup reminder, the error list and the changed-row layer. `tint-neutral` currently equals `panel-2`.
- **Disabled** (`disabled-bg` / `disabled-ink`): disabled checked controls. **Scrim** (`scrim`): behind bottom sheets.

### Named Rules

**The Form-and-Hue Rule.** A state is never colour alone. Tiles carry a drawn glyph (cross, exclamation, ring) and go hollow at zero. Item marks are a struck red square (out), a solid amber square (reorder) or a hollow ring (fine). Badges carry a tick, cross or exclamation. A mismatch row is outlined red and badged with a cross. A missing field is amber with a dashed underline.

**The Seal Rule.** Violet belongs to posting. It appears on the posted seal and on the one `seal` button that posts (اعتماد), and nowhere else: not on badges, loaders, links, chips or "new".

**The Ink-on-Fill Rule.** Text on a state fill is always `ink-on-fill`. Text on the ground or a panel uses the state's ink, never the raw fill (amber is the one fill that doubles as its own ink).

## Typography

**Font:** Almarai (400, 700, 800), self-hosted through `@fontsource/almarai`, with `system-ui, sans-serif` as the fallback. One family for everything, including numerals and codes.

**Character:** a sturdy Arabic sans. Weight 800 carries hierarchy (107 declarations, against 21 at 700 and 6 at 400). Size jumps hard from small labels to huge numerals.

### Hierarchy

- **Numeral** (800, 46 px `--text-num`, line-height 1): the three home state tiles.
- **Stepper** (800, 40 px, line-height 1): the quantity being counted, in count blue. It is large text, so 3:1 suffices (tested).
- **Display** (800, 28 px `--text-2xl`): the balance on the item card and parity counters.
- **Headline** (800, 22 px `--text-xl`): screen titles, the balance in an item row, count-table counts and item filter numerals.
- **Title** (800, 18 px `--text-lg`): main buttons, sums and square-button glyph size.
- **Station** (800, 17 px, line-height 1.3): the store name in the station bar and typed text in the search box and item picker. It is a literal value, matching the approved comp, and has no token yet.
- **Body** (400, 15 px `--text-md`, 1.5): the default, with `tabular-nums` set on `body`.
- **Body small** (13 px `--text-sm`, the most used size): header summaries, tile labels, the sync label, count-table cells.
- **Label** (700, 12 px `--text-xs`): column heads, meta lines, nav labels, chips, hints. **12 px is the floor** (tested). The seal draws its 12-unit text at 104 px, so it renders at 12.5 px.

Line height is 1.5 for running text (Arabic diacritics) and 1 for the big numerals.

### Named Rules

**The Loud Numeral Rule.** The number is the content. A count, balance or tally is set larger and heavier than its label, and the label sits small and muted beside or under it.

**The Two-Line Rule.** Long Arabic labels wrap and are never truncated. `overflow-wrap: anywhere` on `body` lets an unbreakable code (`DHS_LCP_4.5_2.5x30`) wrap instead of widening the page.

**The Numerals Rule.** Western digits (0-9) everywhere, matching the workbook and the barcodes.

## Layout

Single column, phone first, designed at 412 px. On wider screens the working column caps at `--column` (560 px) and centres. Fixed bars (the bottom nav, the action bar and bottom sheets) start and end at `--bar-inset`, the column edge, so on `desktop.png` the bars line up with the content rather than spanning the window.

The shell has three parts:
- A thin station bar on the ground, with one hairline under it. The store name and hospital sit at inline-start and the sync state at inline-end.
- Content padded at 16 px.
- A fixed four-tab bottom nav, `--nav-height` 68 px plus the safe area, holding الرئيسية، الأصناف، الحركات، التصدير.

Home shows the three state tiles in a 3-column grid with a 10 px gap. Under them are notices and the open document, then the two thumb-zone actions.

The spacing scale is 4, 8, 12, 16, 24, 32, 48 (`--space-1` to `--space-7`). The 10 px gap between tiles and actions is a literal from the comp. Tap targets are at least 44 px (`--tap-min`), and the main action is 64 px (`--tap-main`). Grids use `minmax(0, 1fr)`, and form controls carry `min-inline-size: 0; max-inline-size: 100%`, so nothing scrolls sideways (`tests/e2e/layout.spec.ts`).

### The thumb zone

Every task screen puts its one main action in a fixed footer above the bottom nav: `inset-block-end: calc(var(--nav-height) + safe-area)`, on the ground, padded 12/16. The content reserves `--tap-main + --space-5` beneath it. Screens with this footer: Home, Receive, Issue, ReceiptReview, Adjust, ItemEdit, ItemCard, Items, ImportParity and Settings.

### RTL rules

- The document is `dir="rtl"` and `lang="ar"`. CSS uses logical properties only, and the test fails on `left`, `right`, `margin-left`, `text-align: left` and similar.
- Direction and order mirror. Numbers, the camera, ticks and the symmetric mismatch shake do not.
- Codes, GTINs, batches, dates, sizes and quantities are LTR isolates, using `<Bdi>` or `<Num>` (`direction: ltr; unicode-bidi: isolate`).
- Quantity and code fields set `dir` and `inputMode` per field. Free text uses `dir="auto"`.
- The sync state sits at inline-end of the station bar.

## Elevation & Depth

Flat. Depth comes from tonal steps (ground, panel, raised panel), not shadows. There is one shadow:

- **Sheet shadow** (`--shadow-sheet`): bottom sheets only, over the scrim. It is the one layer that covers the page.

The 2 px inset ring (`box-shadow: inset 0 0 0 2px`) used on hollow and pressed things is an edge, not elevation (see Shapes). The scanner's frame uses a spread shadow as a dimmed surround, not depth.

### Named Rules

**The Flat Board Rule.** A new surface is a panel on the ground with no shadow. Only a layer that covers the page (a sheet) casts one.

## Shapes

Square-ish. The radius ramp is proportional to the element:

- **Mark** (`rounded.mark`): the 14 px item mark and the 12 px line-card mark. A square that still reads as a square.
- **Check** (`rounded.check`): the 22 px drawn checkbox. The radio is a circle.
- **Badge** (`rounded.badge`): the 28 px status badge and the scanner result chip and glyph.
- **Small** (`rounded.sm`): stepper buttons, the scanner frame, count-table row ends and summary cells.
- **Medium** (`rounded.md`): buttons, tiles, rows, panels and the search box. This is the board's default corner.
- **Sheet** (`rounded.sheet`): the top corners of a bottom sheet.
- **Pill** (`rounded.pill`): chips and the header "edit details" pill.
- **Circle** (50%): the hollow ok ring, the changed dot and the radio.

Edges carry state:
- solid fill = has a value or state;
- 2 px hair ring or `hair` border = hollow, zero or plain;
- 2 px dashed `hair` = disabled, or not yet built;
- 2 px state-colour edge = this one is in question (the red miss row, the amber differing count, the count-blue open line);
- 2 px bone ring = pressed or selected.

There are no side stripes and no gradients (gradients are banned by test).

### Named Rules

**The Hollow-at-Zero Rule.** A tile or filter with nothing in it drops its fill and keeps only a 2 px hair edge, with muted text. A board shows its empty states at a glance.

## Components

### Buttons

- **Shape:** 12 px radius, 2 px border, Almarai 800 at 15 px, minimum 44 px high, 16 px inline padding. `main` is 64 px at 18 px and is the thumb-zone action. `square` is 44 x 44 for a drawn `Glyph` (minus, plus, cross).
- **Primary:** reversed. Bone fill and border with ground-coloured text. This is the one next step.
- **Secondary (default):** hollow, with a `control-line` edge and bone text.
- **Danger:** hollow, with a `short-ink` edge and text.
- **Seal:** violet fill and border with bone text. It is used only for the button that posts.
- **Disabled:** dashed 2 px hair edge, transparent fill, muted text. It never reads as available (see `review.png`, where اعتماد stays dashed until every reason is written).
- **Press:** scale 0.97 over `--dur-press` (80 ms) linear. Under reduced motion it changes opacity to 0.82 instead.

### The one primary

- **Exactly one primary per screen.** It is `size="main"` and fixed in the thumb zone above the bottom nav. Home's pair is استلام طلبية جديدة (reversed) and صرف لمندوب (hollow).
- **Receive:** the primary reads "راجع واعتمد · N سطور" (bone).
- **Issue:** while a line is open, the primary reads "راجع واعتمد" (bone). With no open line it becomes the violet "اعتماد" and posts.
- **ReceiptReview:** the primary is the violet "اعتماد", disabled and dashed until the review has no problems.
- **Exports and Unsent:** one card's button is promoted to primary. Exports promotes the backup when it is due and the ledger otherwise. Unsent promotes the first failed item. Every other card's button is secondary.
- **Inside a bottom sheet:** the sheet is its own layer and may hold its own primary (the reason, substitute and header sheets).

### The open line (receive and issue)

- The line being counted is a panel with a 2 px count-blue edge, chips for what the barcode gave, and the stepper.
- **A ready open line joins on its own** at four moments:
  - when the next item is picked;
  - at راجع واعتمد;
  - when the user leaves the screen (a nav tab, back);
  - when the page is backgrounded (`visibilitychange` to hidden).

  Until then the card says so: "جاهز: بيتضاف مع الصنف اللي بعده أو مع راجع واعتمد" on Issue, "… أو مع المراجعة" on Receive.
- **A line that is not ready never joins.** It stays out and names what it still needs (a batch, an expiry, a count) in place of the ready note.

### State tile (signature)

Home's three tiles are نافد (short red), تحتاج طلب (attention amber) and تسويات معلّقة (count blue).
- **Shape:** 118 px minimum height, 12 px radius, padded 12/12/10.
- **Content:** a 46 px numeral at the top, and a 13 px 800 label with a 16 px drawn glyph at the foot.
- **Filled when non-zero:** `ink-on-fill` text.
- **Hollow at zero:** a 2 px hair edge with muted text.

### Status badge (`StatusDot`)

- **Shape:** a 28 px square-ish badge (`rounded.badge`) in the state fill, with an 18 px `ink-on-fill` stroke glyph: tick (match), cross (miss) or exclamation (warn).
- **Tick motion:** the tick draws itself (`stroke-dashoffset` over `--dur-tick`) only when a row changes into a match while on screen. A screen that opens on a finished count shows whole ticks. This is the one named non-transform animation the tests allow.

### Item row and item marks

- **Row:** a panel row (12 px radius, padded 12/14, at least 44 px). In order it shows:
  - the state mark;
  - the name (700) over a 12 px muted meta line (page · code · status);
  - a 22 px 800 balance at inline-end, short-ink when negative with "تسوية معلّقة" under the name.
- **Marks (14 px):**
  - **out:** a red square with an `ink-on-fill` cross struck through it;
  - **reorder:** a solid amber square;
  - **ok:** a hollow 2 px muted ring.
- **Changed since seen:** a count-blue 10 px dot plus a `tint-marker` layer that fades in once (`--dur-row-in`) and out when opened (`--dur-row-out`). It never uses a side stripe.

### Count table

- **Rows:** raised panel rows separated by an 8 px gap, with 10 px ends, under small muted column heads. The columns are صنف | مطلوب or الفاتورة | اتسلّم or اتعدّ | badge.
- **Counts:** 22 px 800 bone. A count that disagrees turns short-ink, and its row is outlined 2 px red and badged with a cross.
- **Sub-lines:** 12 px muted. A short count says "ناقص N" in amber.

### Stepper (`QtyStepper` / `InlineQty`)

- **Stepper:** 56 px raised-panel steps either side of a 40 px count-blue numeral that is still an input. A disabled step goes hollow (2 px hair ring).
- **InlineQty:** the invoiced quantity inside a caption. It is an underline field (2 px `control-line` under, no radius) with an amber placeholder, and turns red when invalid.

### Inputs / Fields

- **Search box:** a 52 px panel field with a 1 px `control-line` edge, 12 px radius and 17 px text, with a 12 px muted hint under it.
- **ParsedField:** a labelled field with the edge on the wrapper.
- **Focus:** the global 3 px count-blue outline with a 2 px offset.
- **Caret:** count-ink. Placeholders are muted.
- **Checkbox and radio:** drawn, not native. They are 22 px with a 2 px `control-line` edge. When checked they fill count blue with an ink tick or dot. When disabled the edge goes dashed.

### Chips and filters

- **Chips:** pills on `panel-2`, 12 px 700, at least 44 px high.
- **Item filters:** small tiles with a 22 px numeral. They follow the tile language: a short or amber fill when they carry a tone, and hollow (hair ring, muted numeral) at zero. The pressed filter adds a 2 px bone inset ring, so selection is never hue alone.

### Navigation

- **Bar:** a fixed four-tab bottom bar on the ground with a hairline above.
- **Tabs:** 22 px stroke icons over 12 px 700 labels, muted. The active tab turns its label bone and its icon count blue.

### Sync state (`SyncPill`)

A borderless label with a 16 px drawn glyph at inline-end of the station bar:
- **synced:** ok-ink with a tick ring ("متزامن");
- **pending:** amber with a dashed ring ("N مستنية النت");
- **failed:** short-ink with an exclamation ring, and it becomes a 44 px tappable button ("فشل الإرسال").

The label cross-fades in from 35% over `--dur-sync`. The state is driven by write acknowledgement, not `navigator.onLine`.

### Seal (signature)

- **Form:** a 104 px flat SVG disc tilted -14 degrees, with double bone rings, "معتمد", the date (LTR) and the document number. Posted is the solid violet disc. Cancelled is the solid red disc with ink-on-fill rings and text.
- **Stamp:** on mount it plays the stamp: scale 1.35 to 1, a fade in and a 3 degree settle over `--dur-seal`, with emphasized-decelerate easing and a ring flash. The 30 ms haptic fires from `postedHaptic()` when a post succeeds, not from the seal.

### Bottom sheet (and `ReasonSheet`)

- **Form:** a panel with 16 px top corners and the sheet shadow over the scrim. It has a 40 x 4 `control-line` handle in a 44 px drag zone and a 15 px 800 title.
- **Behaviour:** Escape or a swipe down closes it. Focus is trapped and returned.
- **Motion:** it slides in over `--dur-sheet-in` (decelerate) and out over `--dur-sheet-out` (accelerate). Under reduced motion it is a 120 ms fade.

### Motion

Only `transform` and `opacity` animate, with the StatusDot tick as the one exception. Every file that moves answers `prefers-reduced-motion` (enforced by test). The token values change under reduced motion in `tokens.css` itself.

| Moment | Effect | Token | Easing | Reduced motion |
|---|---|---|---|---|
| Seal stamp | scale 1.35 to 1, fade, 3 deg settle, ring flash | `--dur-seal` | emphasized-decelerate | 150 ms fade |
| Scan result | outline and chip fade and scale in | `--dur-scan` | decelerate | instant |
| Count-match tick | stroke draws once, on change only | `--dur-tick` | standard | static tick |
| Count mismatch | numeral shakes 4 px twice (translateX, symmetric) | `--dur-shake` | standard | still red numeral, cross, "ناقص" |
| Changed row | tint layer fades in, fades out on open | `--dur-row-in` / `--dur-row-out` | standard | appears and goes at once |
| Sync label | cross-fade from 35% | `--dur-sync` | standard | instant |
| Bottom sheet | translateY 100% to 0 and back | `--dur-sheet-in` / `--dur-sheet-out` | decelerate in, accelerate out | 120 ms fade |
| Quantity change | displayed number cross-fades | `--dur-number` | standard | instant |
| Press | scale 0.97 (steps 0.94) | `--dur-press` | linear | opacity 0.82, or raised panel on rows |

The easings are the Material 3 standard, standard-decelerate, standard-accelerate and emphasized-decelerate curves, checked exactly on 2026-10-13.

## Do's and Don'ts

### Do:

- **Do** give each screen exactly one reversed (bone) primary, `size="main"`, fixed in the thumb zone above the bottom nav. Sheets may carry their own.
- **Do** show every state by form as well as hue: filled, hollow, struck, ringed, or a drawn glyph.
- **Do** take a tile or filter hollow at zero (2 px hair edge, muted text).
- **Do** put `ink-on-fill` on state fills and the state's ink on the ground or a panel.
- **Do** use `control-line` for the edge of anything typed into or checked, and `hair` only for decoration and hollow edges.
- **Do** set counts and balances large and 800, with their labels small and muted.
- **Do** join a ready open line by itself (next item, review, leaving, backgrounding), and keep an unready one out with a note saying what it needs.
- **Do** draw symbols as SVG (`Glyph`, badge glyphs, nav icons), never as font characters.
- **Do** animate only transform and opacity from the motion tokens, with a reduced-motion answer in the same file.
- **Do** wrap codes and numbers in `<Bdi>` or `<Num>`, and wrap long Arabic labels rather than cutting them.

### Don't:

- **Don't** use violet for anything but the posted seal and the one button that posts.
- **Don't** add a light theme, `prefers-color-scheme`, gradients, glass, textures or soft white cards.
- **Don't** reverse a second button on a screen, or let a disabled button read as available (it is dashed and muted).
- **Don't** shadow anything but a bottom sheet.
- **Don't** use a side stripe on rows or cards. A changed row is a tint plus a dot.
- **Don't** use `left`, `right`, `margin-left` or `text-align: left` in CSS.
- **Don't** set text below 12 px, or use the old whiteboard token names (`--board`, `--surface`, `--ink`, `--line`, `--marker`, `--miss`, `--match`, `--scrub` and similar; banned by test).
- **Don't** rely on `navigator.onLine`, hover, or colour alone to tell the user something important.
