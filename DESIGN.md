---
name: مخزن الشرائح والمسامير
description: Arabic RTL count-board for a hospital implants store. Scrub green shell, whiteboard ground, marker-blue counts, one violet seal.
colors:
  scrub: "#0f5f58"
  scrub-2: "#13756c"
  board: "#f4f7f6"
  surface: "#ffffff"
  ink: "#122321"
  muted: "#4b5f5c"
  marker: "#1f4fa3"
  miss: "#c2362b"
  match: "#2e7d4f"
  seal: "#5b2d8e"
  amber: "#9a6200"
  line: "#d5dfdc"
  control-line: "#758985"
  hairline: "#eef3f1"
  on-scrub: "#ffffff"
  on-scrub-muted: "#bfe0da"
  scrub-line: "#9fd1c8"
  tint-neutral: "#f7faf9"
  tint-miss: "#fdecea"
  tint-marker: "#f2f6fd"
  tint-amber: "#fff8e6"
  amber-line: "#e9c46a"
  disabled-bg: "#c9d6d3"
  disabled-ink: "#3c4f4b"
typography:
  title:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "22px"
    fontWeight: 800
    lineHeight: 1.5
  headline:
    fontFamily: "Almarai, system-ui, sans-serif"
    fontSize: "18px"
    fontWeight: 800
    lineHeight: 1.5
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
  sm: "10px"
  md: "14px"
  sheet: "20px"
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
    backgroundColor: "{colors.scrub-2}"
    textColor: "{colors.on-scrub}"
    rounded: "{rounded.sm}"
    padding: "0 16px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.scrub}"
    rounded: "{rounded.sm}"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.miss}"
    rounded: "{rounded.sm}"
    height: "44px"
  button-seal:
    backgroundColor: "{colors.seal}"
    textColor: "{colors.on-scrub}"
    rounded: "{rounded.sm}"
    height: "44px"
  button-disabled:
    backgroundColor: "{colors.disabled-bg}"
    textColor: "{colors.disabled-ink}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sm}"
    height: "44px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.md}"
    padding: "12px"
  sync-pill:
    backgroundColor: "transparent"
    textColor: "{colors.on-scrub}"
    rounded: "{rounded.pill}"
---

# Design System: مخزن الشرائح والمسامير

This file was written from the code that shipped (Phase 10, 2026-10-13): `src/ui/tokens.css`, the CSS modules in `src/ui` and `src/scan`, and what the Pixel 7 (412 px) screens render. Where the code and `docs/design/ui-inspiration.md` differ, this file says what the code does.

## Overview

**Creative North Star: "The Count Board With a Seal"**

Every receipt and issue closes like a count at the end of a shift: what was asked against what was counted, side by side, with nothing posted until the two agree or a reason is written. The screen is a whiteboard-white ground under a scrub-green header. Counts are written in marker blue, mismatches in red, matches in green, and the one violet mark in the product, a round approval seal, lands only when a document is posted.

The storekeeper holds a phone in one hand and a box in the other, often in a dim storeroom, often offline. So the system is dense but calm: hairline tables, big thumb-zone buttons, numbers first, every state carried by a glyph as well as a colour, and motion kept to short, quiet moments. There is no dashboard of KPI cards, no texture, no costume.

**Key Characteristics:**

- Arabic first, RTL by default; layout order mirrors, numbers, codes and cameras do not.
- Almarai only, tabular numerals, 12 px floor.
- One accent per meaning: blue counts, red mismatch, green match, amber attention, violet posted. Violet is used nowhere else.
- Flat surfaces separated by hairlines. One sheet shadow, one ambient card shadow.
- Motion is transform and opacity only, with a reduced-motion answer for every moment.

## Colors

A cool green-grey family with four signal colours. Every text pair clears 4.5:1 (WCAG AA); `tests/unit/ui/designRules.test.ts` checks the pairs on each run.

### Primary

- **Scrub Green** (`#0f5f58`): the app header, secondary button text and border, page titles on receipt and status screens, the active bottom-nav item.
- **Scrub Green Bright** (`#13756c`): the primary button fill and the receive action. White on it is 5.5:1.

### Secondary

- **Marker Blue** (`#1f4fa3`): counts, balances, the changed-since-seen dot, focus rings, links, the issue action tile. The colour of "a number somebody wrote".
- **Seal Violet** (`#5b2d8e`): the posted seal and the approve button. Reserved for the posted or approved state only.

### Signal

- **Mismatch Red** (`#c2362b`): counts that disagree, negative balances, cancel actions, the red cancelled seal, the failed sync pill.
- **Match Green** (`#2e7d4f`): matching counts and done notices.
- **Attention Amber** (`#9a6200`) on **Amber Tint** (`#fff8e6`) with **Amber Line** (`#e9c46a`): price changes, short quantities, warnings, the backup reminder.

### Neutral

- **Whiteboard** (`#f4f7f6`): the page ground. **Surface** (`#ffffff`): cards, inputs, sheets, the bottom nav.
- **Board Ink** (`#122321`): body text. **Muted Ink** (`#4b5f5c`): secondary text, 6.3:1 on the ground, tested for dim light.
- **Hairline** (`#eef3f1`) and **Line** (`#d5dfdc`): table row dividers and card edges. Decorative only (1.3:1).
- **Control Line** (`#758985`): the border of any input, select or field box. 3.7:1 on white, 3.4:1 on the ground (WCAG 1.4.11). Added in Phase 10; inputs used `--line` before.
- **Disabled** (`#c9d6d3` fill, `#3c4f4b` text): 5.8:1.
- Tints: `#f7faf9` table header, `#fdecea` red wash, `#f2f6fd` blue wash (changed-since-seen rows).
- On the scrub header: white, **Scrub Mist** `#bfe0da` (5.3:1) for the hospital name, **Scrub Line** `#9fd1c8` for the sync pill border (4.4:1, a non-text edge).

### Named Rules

**The Glyph Rule.** A state is never colour alone. Match is a tick, mismatch a cross, attention an exclamation mark; a changed row has a dot as well as a tint; a mismatch also says "ناقص" or "زيادة" in words.

**The Seal Is Violet Alone Rule.** Violet appears on the posted seal and the approve button and nowhere else. Not on badges, loaders, links or "new".

## Typography

**Font:** Almarai (400, 700, 800), self-hosted through `@fontsource/almarai`, fallback `system-ui, sans-serif`. One family for everything, including numerals and codes.

**Character:** a plain, sturdy Arabic sans that reads at 12 px in dim light. Weight 800 does the work of hierarchy; size stays close.

### Hierarchy

- **Title** (800, 22 px `--text-xl`, 1.5): the screen heading.
- **Large number** (800, 28 px `--text-2xl`): the balance on the item card and the parity counters. The home tally is 22 px (`--text-xl`) and a balance in a list row is 18 px (`--text-lg`).
- **Headline / item name** (800, 18 px or 15 px): the store name, an item name in a row or a count table.
- **Body** (400, 15 px `--text-md`, 1.5): the default. `font-variant-numeric: tabular-nums` on `body`, so numbers never change width.
- **Body small** (400, 13 px `--text-sm`): summaries and table cells.
- **Label / meta** (400 or 700, 12 px `--text-xs`): column headings, codes, field labels, sub-lines. **12 px is the floor**; the seal's 12-unit text is drawn at 104 px so it renders at 12.5 px.

Line height 1.5 everywhere, for Arabic diacritics. Body measure is not an issue on a 412 px column.

### Named Rules

**The Two-Line Rule.** Long Arabic labels wrap to two lines or more. No ellipsis, no `nowrap` on a label, no truncated صرف / استلام / اعتماد. `overflow-wrap: anywhere` on `body` lets an unbreakable code wrap instead of widening the page; as a side effect a very narrow box may split an ordinary word, which was not seen on any screen checked.

**The Numerals Rule.** Western digits (0-9) everywhere, matching the workbook and the barcodes. Never mixed with Arabic-Indic digits in one row.

## Layout

Single column, phone first, designed at 412 px (Pixel 7) and never wider than the viewport. The shell is: scrub header, `12 px` padded content, a fixed bottom navigation (`56 px` plus the safe-area inset) with four destinations (الرئيسية، الأصناف، الحركات، التصدير). Primary actions sit in the thumb zone, above the nav, in a sticky footer on receive and issue.

Screens are CSS grids with `minmax(0, 1fr)` columns, so a long item name cannot widen them. Count tables use four columns: a flexible name and three 52 px columns (requested, counted, state). Chips and fields wrap (`flex-wrap`) rather than scroll. Nothing scrolls sideways; `tests/e2e/layout.spec.ts` checks every route at 412 px with long and unbreakable names.

Spacing scale (4 px base): 4, 8, 12, 16, 24, 32, 48 (`--space-1` to `--space-7`). Tap targets are at least 44 px (`--tap-min`). Forms that must not push the page wider carry `min-inline-size: 0` and `max-inline-size: 100%` globally.

## Elevation & Depth

Flat by default. Depth comes from tonal layering (white cards on the whiteboard ground) and 1 px lines, not shadows. Two shadows give depth (the scanner frame's `box-shadow` is a 2 px outline plus a dimmed surround, not depth):

- **Sheet shadow** (`0 -6px 24px rgba(0,0,0,0.18)`): bottom sheets only, over a 32% scrim (`rgba(18,35,33,0.32)`).
- **Ambient card shadow** (`0 2px 8px rgba(15,60,55,0.08)`): the receive line card only.

### Named Rules

**The Flat-By-Default Rule.** A new surface starts flat with a `1px solid var(--line)` edge. A shadow needs a reason: it is a layer that covers the page.

## Shapes

Soft, small radii. `10 px` for buttons, inputs, chips and inline panels; `14 px` for cards, tally, the camera view; `20 px` on the top corners of a bottom sheet; `99 px` for pills (the sync pill, chips). The seal is a circle (double ring, 3 and 1.5 stroke) tilted -14 degrees. No side stripes: a changed row is a tint plus a dot.

## Components

### Buttons

- **Shape:** 10 px radius, 44 px minimum height, 16 px inline padding, Almarai 800 at 15 px.
- **Primary:** Scrub Green Bright fill, white text. **Secondary:** white fill, scrub text and 1 px scrub border. **Danger:** white fill, red text and border. **Seal (approve):** violet fill, white text.
- **Disabled:** `#c9d6d3` fill, `#3c4f4b` text, no border. The approve button is disabled until counts reconcile.
- **Press:** scale 0.97 over 80 ms linear; under reduced motion, opacity 0.82 instead.

### Chips

Filter chips (`Items`): 44 px high, 10 px radius, 1 px line. Pressed = scrub fill, white text and bold, so the state is not colour alone. Header and document-data chips on receive and issue are pill-shaped.

### Cards / Containers

White surface, 14 px radius, `1px solid var(--line)`, 12 px padding. Home tally is one bordered card split by hairlines into three cells (تحتاج طلب, نافد, تسويات معلّقة); a non-zero cell is washed red.

### Inputs / Fields

White fill, 1 px `--control-line` border, 10 px radius, 44 px high, 15 px text. A field with an inside label (`ParsedField`) puts the border on the wrapper. Focus is a 3 px marker-blue outline with 2 px offset (global `:focus-visible`). Number fields are LTR with a numeric keyboard. Caret is marker blue; checkboxes and radios take `accent-color: --scrub-2`. A select with a long option scrolls inside its own box.

### Navigation

Fixed bottom bar, white, 1 px top line, four equal links in 12 px text; the active one is scrub green and bold. The header holds the hospital name (12 px, mist) over the store name (18 px, 800) at inline-start, and the sync pill at inline-end.

### Count table (signature)

Requested against counted, side by side: صنف | مطلوب (or الفاتورة) | اتسلّم (or اتعدّ) | state dot. Counts are marker-blue 800; a counted value that disagrees is red. The dot is a 20 px circle with a glyph. Sub-lines (batch, expiry, price change, reasons) sit under the name in 12 px, amber when they need attention.

### Seal (signature)

A flat SVG, 104 px: double ring, "معتمد", date (LTR), document number. Posted is violet, cancelled is red with "ملغي". It plays the stamp animation once on mount. The 30 ms haptic is not in the seal: `postedHaptic()` (`src/ui/haptics.ts`) fires when a post succeeds, so opening an old posted document does not buzz. A number longer than 11 characters is squeezed to fit the ring.

### Sync pill

Header pill, 12 px text. Dashed border while changes wait ("N مستنية النت"), solid when synced ("متزامن"), red dashed on a tinted ground and tappable when sending failed ("فشل الإرسال"). Driven by write acknowledgement, not `navigator.onLine`.

### Bottom sheet

White, 20 px top corners, 40 x 4 handle, 32% scrim, Escape or swipe down (80 px) to close, focus trapped and returned. Used for the receipt and batch data, substitutes, reasons, and item pickers.

### Scanner

A 178 px viewfinder is itself the tap target, with a medium rectangle and a dimmed surround. A known GTIN outlines green (`#5fe0a0`) with a tick, an unknown one red (`#ff8a80`) with a cross, plus a beep and a vibration. Manual entry sits directly under it.

## Motion

Only `transform` and `opacity` animate (the tick is the one named exception, below). Every moment has a `prefers-reduced-motion` answer, and `tests/unit/ui/designRules.test.ts` enforces both rules on the CSS. Tokens in `src/ui/tokens.css`; reduced-motion values shown after the arrow.

| Moment | Effect | Duration token | Easing | Reduced motion |
|---|---|---|---|---|
| Posting: seal stamp | scale 1.35 to 1, opacity 0 to 1, 3 deg settle, ring flash; 30 ms haptic on a successful post | `--dur-seal` 420 ms (ring 500 ms) → 150 ms | emphasized-decelerate | fade only |
| Scan success | green or red outline, opacity 0 to 1, scale 1.04 to 1; scanner freezes 250 ms | `--dur-scan` 200 ms → none | decelerate | outline appears at once |
| Count match | check draws with `stroke-dashoffset` | `--dur-tick` 220 ms → none | standard | static tick |
| Count mismatch | counted number shakes 4 px left and right twice (translateX) | `--dur-shake` 240 ms → none | standard | static red number, glyph and "ناقص" text |
| Changed row | tint layer fades in once and persists; fades out on open | `--dur-row-in` 180 ms, `--dur-row-out` 120 ms → none | standard | tint appears and goes at once |
| Pending to synced | dashed border layer cross-fades to a solid one; label fades in from 35% | `--dur-sync` 250 ms → none | standard | instant swap |
| Bottom sheet | translateY 100% to 0 over the scrim; reverse on close | `--dur-sheet-in` 300 ms, `--dur-sheet-out` 200 ms → 120 ms | decelerate in, accelerate out | 120 ms fade, no slide |
| Quantity change | displayed number cross-fades (never an input) | `--dur-number` 120 ms → none | standard | instant |
| Pressed target | scale 0.97 | `--dur-press` 80 ms → none | linear | opacity 0.82 |

Easing tokens were checked on 2026-10-13 against the official Material 3 motion tokens (material-web `_md-sys-motion.scss`) and match exactly: `--ease-standard` `cubic-bezier(0.2, 0, 0, 1)` is `easing-standard`; `--ease-decelerate` `(0, 0, 0, 1)` is `easing-standard-decelerate`; `--ease-accelerate` `(0.3, 0, 1, 1)` is `easing-standard-accelerate`; `--ease-emphasized-decelerate` `(0.05, 0.7, 0.1, 1)` is `easing-emphasized-decelerate`. Of the durations, 200 (short4), 250 (medium1) and 300 (medium2) sit on the Material grid; the others (420, 220, 180, 120, 240, 80) are the spec's own.

**The Tick Exception.** The count-match tick animates `stroke-dashoffset`, as `ui-inspiration.md` prescribes. It is a 16 px SVG stroke, so it costs nothing, and it is the only non-transform, non-opacity animation in the app.

## RTL Rules

- The document is `dir="rtl"`, `lang="ar"`. CSS uses logical properties only (`margin-inline-start`, `inset-inline-end`, `padding-block`, `border-start-start-radius`); a unit test (`designRules.test.ts`) fails on `left`, `right`, `margin-left` and the like.
- Mirror direction and order. Do not mirror numbers, the camera, ticks, clocks or charts.
- Codes, GTINs, batch numbers, dates, sizes (`2.5x30`) and quantities are LTR isolates: wrap them in `<Bdi>` (`dir="ltr"`, `unicode-bidi: isolate`) or use `Num`, which isolates its own value.
- Quantity and code fields are `ParsedField`s: `dir` and `inputMode` (numeric or decimal) are set per field, so numbers type LTR on a numeric keyboard. Free-text fields (search, reasons) use `dir="auto"`.
- The sync pill sits at inline-end of the header, so it follows the language.
- Printed documents are checked separately from screens (RTL sheet view, A4).
- Seal and shake: the shake is symmetric on purpose, so it reads the same either way.

## Do's and Don'ts

### Do:

- **Do** pair every colour state with a glyph or a word (tick, cross, exclamation, "ناقص").
- **Do** keep 44 px minimum tap targets and put primary actions in the thumb zone.
- **Do** use only the type scale (12, 13, 15, 18, 22, 28 px). 12 px is the floor.
- **Do** use `--control-line` for the edge of anything the user types into, and `--line` for decoration.
- **Do** wrap codes and numbers in `<Bdi>` or `<Num>`; wrap long Arabic text instead of cutting it.
- **Do** animate only transform and opacity, from the duration and easing tokens, and add a reduced-motion fallback in the same file.
- **Do** run `E2E_EMULATORS=1 npx playwright test tests/e2e/layout.spec.ts` after any layout change.

### Don't:

- **Don't** use violet for anything but the posted state; the seal is not a badge, a button style or a loader.
- **Don't** add textures, paper curls, hand-drawn lines, gradients, glass, confetti, bounce or looping shimmer.
- **Don't** use a side stripe (`border-inline-start` above 1 px as an accent) on cards or rows.
- **Don't** use `left`, `right`, `margin-left` or `text-align: left` in CSS.
- **Don't** put a keyed or remounting element around an `<input>`; `Num` is for displayed values only.
- **Don't** rely on `navigator.onLine`, hover, or colour alone to tell the user something important.
- **Don't** build a dashboard of KPI cards; the home screen is the open document, two actions, and a three-cell tally.
