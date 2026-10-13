---
version: 1
slug: "src-ui-tokens-css"
primary_target: "src/ui/tokens.css"
related_targets: ["src/app/App.tsx"]
---

## Scope

The whole phase 1 app shell and screens (mobile-first, Arabic RTL). Visitor mode: **Operate**. Task screens: home, receive, receipt review, issue, substitute sheet, items, item card, adjust, import/parity, exports, unsent, settings, sign-in.

Redesign (2026-10-13). After his first hands-on run, the owner said the colours are weak, the look is old and plain, and there are too many steps on every screen. He chose the "nursing-station status board" direction. Product truth, behaviour, copy and the posted-seal rule stay. The whiteboard-and-scrub look is replaced.

## Direction contract

THESIS: The store reads like a nursing-station status board. Every item and document is a status tile filled with its state colour, readable from arm's length in a dim room, and each screen offers exactly one next step. It refuses both the old whiteboard count-board and a SaaS dashboard of soft white cards.

OWN-WORLD:
- Deep station-teal ground `#0e2a30`, with raised panels `#16404a`.
- Bone text `#f4f8f8`.
- State fills, each with a glyph and a solid, hollow or struck form, never hue alone:
  - ok green `#22b07d`,
  - short red `#ef4f4f`,
  - attention amber `#f5a524`,
  - count blue `#5aa8ff`.
- The violet seal survives as the only posted mark.
- Almarai, numerals huge and tabular. Square-ish 12 px corners. No glass, no gradients.

STORY: He opens the app and reads the board: what is short, what needs ordering, what is waiting to sync. One reversed, full-width button names the next step. Receive and issue run as a short sequence of large tiles, scan or tap, never forms of small fields.

FIRST VIEWPORT:
- A thin station bar holds the store name and the sync state.
- Three large filled state tiles (نافد, تحتاج طلب, تسويات معلّقة), each with a huge numeral; a tile at zero goes hollow.
- The open document, if any, as one wide tile.
- Two thumb-zone actions, استلام and صرف, with exactly one reversed as the primary.
- A standard bottom navigation.

FORM:
- The nursing-station status board, rank 7 of the grounded list. Seed key 0b85f3d0 (assigned).
- Raises:
  - from the timetable rack: one reversed element per screen, the next step;
  - from the design annual: one confident type scale, huge numerals and small labels;
  - from the emission rail: state shown by form (solid, hollow, struck) as well as hue.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Approved references

- `docs/design/ui-inspiration.md`, motion moments only.
- The old mockups in `docs/design/mockups/` are kept as product-truth references (fields and flows), not as visual authority.
