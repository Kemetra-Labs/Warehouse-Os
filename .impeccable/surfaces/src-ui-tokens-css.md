---
version: 1
slug: "src-ui-tokens-css"
primary_target: "src/ui/tokens.css"
related_targets: ["src/app/App.tsx"]
---

## Scope

The whole phase 1 app shell and screens (mobile-first, Arabic RTL). Visitor mode: **Operate**. The task screens are: home, receive, receipt review, issue, substitute sheet, items, item card, adjust, import/parity, exports, unsent, settings, sign-in.

## Direction contract

THESIS: Every receipt and issue closes like an operating-room count: requested against counted, side by side, with nothing posted until they agree or a reason is written. The design refuses the category default of a dashboard of KPI cards.

OWN-WORLD:
- Scrub-green shell `#0f5f58` on a whiteboard-white ground `#f4f7f6`.
- Marker blue `#1f4fa3` for counts, red `#c2362b` for mismatch, green `#2e7d4f` for match. Each state dot carries a glyph, never colour alone.
- Almarai with tabular numerals. Dense hairline tables.
- One violet `#5b2d8e` circular approval seal, used only for the posted state.
- No textures, no costume.

STORY: The storekeeper opens the app and sees the open batch first. He scans or types to fill counts and watches mismatches turn red. He resolves them with a substitute or a reason, posts, and the seal lands.

FIRST VIEWPORT:
- A scrub header holds the hospital and store name, with the sync pill at inline-end.
- Below it, the open document as a count table (صنف | مطلوب | اتسلّم | state dot) with a disabled اعتماد button until it reconciles.
- Two large thumb-zone actions: استلام and صرف.
- A three-cell tally: تحتاج طلب, نافد, تسويات معلّقة.
- A standard bottom navigation.

FORM: count board with seal. Rank 5 of the grounded list, fused with the user-pinned stamp/seal from rank 1. Seed key 173477b0 (re-roll 1).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Approved references

- `docs/design/mockups/issue-flow.html`
- `docs/design/mockups/receiving-flow.html`
- motion: `docs/design/ui-inspiration.md`. Deviation: a row changed by sync gets a tint plus a dot, never a side stripe.
