# UI inspiration: count-board world, motion and RTL

Scope: patterns to adopt for the Arabic RTL storekeeper app. Research only, no code. Evidence limits: most product sources were vendor docs or blogs. I found no usable public case studies for InstaPay, valU, Talabat, Careem, Absher or Tawakkalna, so the Arabic craft items rest on general RTL guidance. Cubic-bezier values are "M3-derived" and must be checked against the official tokens before shipping.

## Top 10 adoptable patterns

1. **Tappable full-camera scan, continuous mode while receiving.** Scandit recommends making the whole camera view the start/resume target, and continuous scanning for sequential high-volume work ([Scandit usability](https://docs.scandit.com/data-capture-sdk/web/best-practices-for-usability.html)). Fits: one-handed, boxes in the other hand. Map: big thumb-zone target, no small "scan" button; pause the camera between boxes to avoid stray reads.
2. **Brush highlight on the detected code, plus sound and haptic together.** Same source: highlight the code read, add beep and vibration, keep latency low. Map: outline in match green `#2e7d4f` for a known GTIN, red `#c2362b` for an unknown one. Never colour alone: add a tick or cross glyph.
3. **Manual-entry fallback always visible.** STRICH advises a manual path for damaged codes ([STRICH](https://docs.strich.io/best-practices-for-scanning-apps.html)). Only 47 of 97 items have a GTIN, so typing page number or code is a first-class path. Map: one input under the viewfinder accepting page number, GTIN or code.
4. **Restricted scan area, not a tiny keyhole.** Scandit warns that too small a area frustrates users. Material says non-actionable overlays on the feed should be translucent ([Material barcode scanning](https://m2.material.io/design/machine-learning/barcode-scanning.html)). Map: medium rectangle, dimmed outside, translucent chrome.
5. **Scan increments the expected line.** Odoo-style receiving: scanning selects the line and bumps the received count, then captures lot and expiry ([Cleverence on Odoo](https://www.cleverence.com/amp/articles/business-blogs/mobile-scanning-odoo-4837/); vendor description, not official docs). Map: each scan adds to the "counted" column of the double-count table; batch and expiry typed once per batch.
6. **Four-state per-record sync marker plus one global counter.** Sources agree: queued, syncing, synced, failed; a small marker on changed records, a global "N pending" for the rest; never show an unsynced change as saved ([AppMaster](https://appmaster.io/blog/offline-first-background-sync-conflict-retries-ux), [vp0](https://vp0.com/blogs/local-first-offline-ui-templates-react/)). Map: the dashed-pill header indicator in the mockups, plus a row marker and a "view pending" list.
7. **Treat sync failure as offline whatever the network icon says.** Captive portals report "connected". Map: indicator driven by write acknowledgement, not `navigator.onLine`.
8. **Per-item minimum surfaced on the list.** Sortly-style minimums with low-stock alerts ([Sortly](https://www.sortly.com/?p=200446)); I could not confirm its badge visuals. Map: number-first balance in marker blue, red below minimum, no pill chrome.
9. **Guided next step after each scan or save.** Odoo-style flows suggest the next task rather than asking which screen to open. Map: when every row matches, the primary button becomes "اعتماد" (violet); it stays disabled while any row mismatches.
10. **Mirror only direction; isolate codes.** Material bidirectionality: mirror back/forward and layout order, not numbers, charts, camera or checkmarks ([Material](https://m1.material.io/usability/bidirectionality.html), [Mozilla RTL](https://firefox-source-docs.mozilla.org/code-quality/coding-style/rtl_guidelines.html)). Map: `NAL-04`, GTINs and batch numbers are LTR islands inside RTL rows.

## Motion spec

Rules: animate only `transform` and `opacity` ([Front-End Checklist](https://frontendchecklist.io/rules/css/animation-performance)); set `will-change` only during an animation; under `prefers-reduced-motion: reduce`, replace movement with a short fade or an instant state change ([Flavio Copes](https://flaviocopes.com/css-keyframes-reduced-motion.md)). Durations follow M3-style ranges (third-party table, unverified). Curves, M3-derived from memory: standard `cubic-bezier(.2,0,0,1)`, decelerate `cubic-bezier(0,0,0,1)`, emphasized decelerate `cubic-bezier(.05,.7,.1,1)`.

| Moment | Effect | Duration | Easing | Reduced-motion fallback | Notes |
|---|---|---|---|---|---|
| Posting: seal stamp | Violet seal scales 1.35 to 1.0, fades 0 to 1, 3 deg rotate settle; ring flashes via opacity | 420 ms (+80 ms flash) | emphasized decelerate | 150 ms fade, no scale or rotate | SVG, transform + opacity only. Once per posting. One medium haptic (`navigator.vibrate(30)` where supported). Violet appears nowhere else |
| Scan success | Green outline on the code: opacity 0 to 1, scale 1.04 to 1; hold a 250 ms freeze | 200 ms | decelerate | Instant outline | Beep + `vibrate(40)`. Error: red outline, `vibrate([30,60,30])` |
| Count-match tick | Dot turns green; SVG check draws via stroke-dashoffset | 220 ms | standard | Colour swap, static tick | Mismatch: red dot, number shakes 4 px twice (translateX, 240 ms); fallback static red with explicit "ناقص / زائد" text |
| Row stays highlighted after sync change | Inline-start 3 px marker-blue bar plus faint tint, fades in once | 180 ms in; persists | standard | Same, no fade-in | Persists until the row is opened (state-driven, not timed); 120 ms fade out on open |
| Pending to synced | Dashed pill border turns solid; count cross-fades | 250 ms | standard | Instant swap | Debounce rapid flips. Failed: red dashed, tappable "إعادة المحاولة" |
| Substitute bottom sheet | translateY(100%) to 0 over a 32% scrim; drag handle; swipe down to dismiss | 300 ms in, 200 ms out | decelerate in, accelerate out `cubic-bezier(.3,0,1,1)` | 120 ms fade, no slide | Standard sheet control. Nearest-price row pre-selected |
| Quantity change | Number cross-fade, no roll | 120 ms | standard | Instant | Tabular numerals so width never jumps |
| Pressed target | Scale .97 on press | 80 ms | linear | Colour change only | Confirms touch with busy hands |

## Fits vs does not fit

**Fits** (type, palette, density, one signature move only):
- Almarai with tabular numerals; dense rows, 12 px minimum, strong number column.
- Requested/counted columns split by a hairline, counts in marker blue, deltas in red.
- Solid state dots with a glyph (tick, cross), never colour alone.
- The seal as a flat SVG circle with ring and Arabic text; one stamp animation.
- Dashed-to-solid sync pill (already in the mockups).
- Standard platform back, bottom sheet, text fields, system numeric keyboard.
- Large primary buttons in the bottom thumb zone.

**Does not fit (costume):**
- Whiteboard grain, marker-stroke textures, hand-drawn underlines, tally-mark decoration.
- Paper curl, sticky notes, torn edges, rubber-stamp roughness or ink-bleed filters.
- Surgical or bone illustration, stethoscope icons, medical crosses as ornament.
- The seal reused for anything not posted (badges, buttons, loaders, "new").
- Violet outside posted/approved states.
- Confetti, bounce or spring overshoot, looping shimmer on every list.
- Custom navigation, scroll physics, date or number pickers.
- Gradient headers, glassmorphism, large decorative cards.

## RTL pitfalls checklist

- [ ] Use logical properties (`margin-inline-start`, `inset-inline-end`), not left/right; hard-coded offsets do not flip ([Zomato Arabic prototype note](https://www.codementor.io/@arpitagarwal760/designing-and-prototyping-an-ios-app-for-arabic-users-hpl2k6zg7)).
- [ ] Mirror back/forward, progress direction, swipe-to-dismiss. Do not mirror camera, checkmark, clock, charts, media controls.
- [ ] Wrap codes (`NAL-04`, GTIN, batch) in `<bdi>` or `unicode-bidi: isolate` with `dir="ltr"`, or hyphens and digits reorder.
- [ ] Pick numerals once: Western digits (0-9) match the workbook and barcodes; do not mix with Arabic-Indic digits in a row.
- [ ] Quantity inputs: `dir="ltr"`, `inputmode="numeric"`, consistent alignment.
- [ ] Sizes such as `2.5x30` keep their order (Mozilla rule); wrap as LTR isolates.
- [ ] Excel paste rows follow the "سجل الحركات" column order; screen order is a separate concern.
- [ ] Arabic labels run longer: allow two lines, avoid ellipsis on critical words (صرف، استلام، اعتماد).
- [ ] Almarai needs line-height about 1.5 for diacritics; test muted `#4b5f5c` text in dim light.
- [ ] Anchor toasts and the sync pill to inline-start; test with Android system language set to Arabic and to English.
- [ ] Test printed documents in RTL separately from screens.
- [ ] Do a native-speaker pass on a real device; flipping `dir` in a mockup is not enough.

## Sources

- Scandit usability: https://docs.scandit.com/data-capture-sdk/web/best-practices-for-usability.html
- STRICH: https://docs.strich.io/best-practices-for-scanning-apps.html
- Material barcode scanning (beta): https://m2.material.io/design/machine-learning/barcode-scanning.html
- Material bidirectionality: https://m1.material.io/usability/bidirectionality.html
- Mozilla RTL guidelines: https://firefox-source-docs.mozilla.org/code-quality/coding-style/rtl_guidelines.html
- Odoo scanning (vendor): https://www.cleverence.com/amp/articles/business-blogs/mobile-scanning-odoo-4837/
- Sortly: https://www.sortly.com/?p=200446
- Offline sync UX: https://appmaster.io/blog/offline-first-background-sync-conflict-retries-ux ; https://vp0.com/blogs/local-first-offline-ui-templates-react/
- Animation performance / reduced motion: https://frontendchecklist.io/rules/css/animation-performance ; https://flaviocopes.com/css-keyframes-reduced-motion.md
- Arabic app design: https://uxplanet.org/24-tips-for-designing-an-arabic-app-7f0a8cc9d9ab ; https://www.codementor.io/@arpitagarwal760/designing-and-prototyping-an-ios-app-for-arabic-users-hpl2k6zg7
- M3 duration table (third party, unverified): https://design.kpay-group.com/docs/motion/type/flutter-type/flutter-intro
