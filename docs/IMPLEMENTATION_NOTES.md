# Implementation notes and decisions log

Running log of what was decided or changed while building, and why. Where this file and
[DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) differ, this file wins.

## Layout: vertical positions follow the vector templates

The guide image's top measures (frame 98 pt, QR 107.6 pt) disagree with its own 38 pt
(QR → name cap top) and 127.6 pt (name baseline → bottom) measures by about 4 pt.
Measuring the outlined vector templates (`tests/fixtures/qr-en-template.svg`,
`qr-kh-template.svg`) settles it:

| Element | Guide image | Vector template | Used (`src/config/layout.json`) |
| --- | --- | --- | --- |
| Corner frame top | 98 | 101.7 | 101.45 (concentric with QR) |
| QR top | 107.6 | 111.7 | 111.6 |
| QR left | 91.7 | 91.84 | 91.75 (exactly centered: (317.5 − 134) / 2) |
| Logo top | 158.6 | 162.7 | 162.6 (centered on QR) |
| Name line 1 baseline | 299.9 | ≈ 298.9 | 299.9 |

With QR top 111.6, the 38 pt gap and the 127.6 pt bottom measure both hold exactly
(Nunito Sans ExtraBold cap height at 23 pt = 16.3 pt). Sizes are unchanged: QR 134, logo 32,
frame 154.3.

Test `tests/sticker.test.ts` checks the composed sticker against the template: name ink top,
line-2 bottom and MID top/bottom all land within 1 pt.

## Text

- **25 characters for the whole name, lines by width.** (Changed after the first handoff:
  it was 25 per line.) The name, all lines together with the spaces between words, is
  limited to 25 grapheme clusters, the KHQR merchant-name limit; "Name chars (max)" can be
  lowered but not raised above 25. Extra whole words are dropped and flagged; a first word
  over the limit is cut. The kept words then wrap at the safe width (artboard − 2 × 20 pt),
  max 2 lines: "The Pizza Company Sihanou" (exactly 25) wraps to two lines as in the guide.
  A single word wider than the safe width is flagged, never shrunk.
- **Khmer word breaks** use `Intl.Segmenter('km')`, so Khmer written without spaces wraps at
  dictionary word boundaries. Zero-width spaces are removed.
- **MID follows the last name line** (moves up for one-line names). Confirmed by
  `qr-kh-template.svg`, which has a one-line name with MID directly below. A "Fixed" option
  is in the Typography panel.
- Line pitch = cap height + 11.8 pt; MID cap top = last baseline + 17 pt. Cap heights come
  from the fonts, so changing sizes keeps the guide's gaps.
- Fonts: Nunito Sans ExtraBold / Regular and Nokora SemiBold (OFL), TTF from
  `@expo-google-fonts`, licenses in `public/fonts/`.

## SVG → PDF

- **Own converter on pdf-lib** instead of svg-to-pdfkit (Phase 2 spike). SVG → flat vector
  `Scene` (fills, strokes, clips) → PDF operators. Supports transforms, nested clip paths,
  fill/stroke opacity, fill-rule, `<use>`, basic `<style>` rules; live `<text>` is outlined
  with the bundled fonts. Gradients fall back to their first stop, masks/filters/images are
  skipped, each with a warning.
- Spike result (PDF via poppler vs SVG via Chromium, pixel diff): `bkb.svg` 0 px,
  `corner.svg` 0 px, `a5.svg` 0.07 % (only the live "Member of" text: Chromium had no Nunito
  and fell back to a serif; the PDF uses real Nunito outlines), templates ≤ 0.19 % (edge
  anti-aliasing).
- The preview renders from the same `Scene`, so preview geometry equals the PDF.
- **Background is written once per file** as a PDF Form XObject and referenced from every
  page: 5 pages went from 1.2 MB to 305 KB.

## Background and bleed

- Background is fitted inside the trim box with one uniform scale (never enlarged for bleed).
- `a5.svg` has A5 proportions (0.7096), which matches A6 exactly but not the Original
  artboard (0.7427), leaving ~7 pt each side at Original size.
- **Edge fill is banded**, not one color per side: each side is sampled along its length
  (vector point-in-path, no rasterizing), bands of the same color are merged and their
  boundaries refined to 0.02 pt. This carries the red header/footer bands out to the page
  edge in gaps and bleed. "One color" mode is available in the Export panel.

## Raster QR redraw

`src/core/qr/raster.ts`: jsQR decode → sample module grid from the four corners → threshold
→ verify by decoding a clean render of the matrix (must equal the original payload) →
fallback: rebuild from payload with the same version and EC level (read from the format
bits) → else refuse. The matrix is traced into closed outlines (one path, no seams between
modules). Tests cover clean, resized (3.37 px/module), transparent/colored, tight crop,
non-QR images, all EC levels, and module-exact coverage.

## Export

- Page boxes: TrimBox exact; BleedBox = MediaBox with bleed; crop marks add a slug outside
  the bleed (MediaBox grows, BleedBox stays trim + bleed).
- Output: one combined PDF, ZIP of single PDFs named by MID, or ZIP of PDFs split by page
  count. Rows without a usable QR are skipped and listed.

## Added after the first handoff

- **Export without background.** Export panel → "Include background" (on by default). Off
  leaves out the background artwork and its edge/bleed fill; QR, logo, corner frame and text
  stay in place, for printing on pre-printed sticker stock. Preview follows the setting; file
  names get `_no-bg`. Still vector only (checked with pdffonts / pdfimages).
- **Show / Hide per asset.** Each Assets card (Background, Bakong logo, Corner frame) has a
  Show/Hide button; a hidden asset is left out of the preview and the export. Background
  uses the same setting as the Export panel's "Include background"; the corner frame uses
  the former "Show corner frame" switch (removed); the logo has a new `showLogo` setting.

- **Row range export.** Data panel → "Export rows": first / last **Excel row number**
  (inclusive; empty = first / last). Rows outside the range are dimmed in the table; the
  Download button shows "N of M stickers". The range is not persisted and resets when a
  workbook or sheet is loaded. Logic: `rowsInRange` in `core/excel/read.ts`.
- **Raster QR resolution rules** (plan §5): refused under 2 px per module, warned under 4
  (`MIN_MODULE_PX` / `WARN_MODULE_PX` in `core/qr/raster.ts`), measured from the decoded corners.
- **Logo baked into a raster QR.** Timing, alignment and version modules depend only on the
  version, so `detectBakedLogo` compares them with a reference symbol; ≥ 3 wrong ones, mostly in
  the central half, means something was drawn over the code. The file gets a warning and the
  code is **rebuilt from its payload** (clean modules under the Bakong logo) when that verifies,
  otherwise the traced matrix is kept. Version 1 codes have no alignment pattern near the centre
  and cannot be checked (KHQR payloads are far larger).
- **QR too small to scan** (plan §8 "warning in the export panel"). `core/qr/printSize.ts`;
  thresholds in `layout.json → scan`: printed QR under **20 mm**, or modules under **0.4 mm**
  when the module count is known (redrawn raster QRs). The Export panel shows the printed QR
  size (A7 ≈ 31 mm, a typical 49-module KHQR ≈ 0.64 mm/module → no warning); a too-small size
  shows a notice and a per-sticker `qr-small` warning. Thresholds are a conservative guess:
  confirm with the print-and-scan test.

## Import from a generated KHQR PDF

Data panel → Source → **Generated PDF** (`src/core/import/`). pdf.js (legacy build, which
polyfills `Map#getOrInsertComputed` that the modern build needs and current browsers lack; loaded
only when a PDF is opened) renders each page at ~2400 px. jsQR finds every code on the page: it
scans the whole page, then overlapping windows (halves, thirds, quarters) because several codes
side by side confuse its finder search; each code found is cropped with a 4-module quiet zone
into a PNG, blanked, and the scan repeats. The PNGs go through the raster redraw pipeline (always
on for `pdf-p…` files). Name and MID come from the KHQR payload (`src/core/qr/khqr.ts`: tag 59,
tag 64-01 for the local-language name, tag 30-01 for the MID, CRC-16 check); the page text
(MID line and the line above it) is the fallback. The result is a table (`pdfToSheet`) with one
row per code, so column choice, export range ("PDF page numbers"), preview and export work as for
Excel. pdf.js runs with no font faces, no WebAssembly and bundled standard fonts
(`public/pdfjs/standard_fonts`, Foxit/Liberation licences included), inside the CSP; nginx serves
`.mjs` (the pdf.js worker) as JavaScript, which its mime.types does not do by default.

**Stroke weight:** every border, outline, focus ring, Flow wire and handle is 1 px; icons are
drawn at 1 px (stroke 1.5 on a 24-unit grid shown at 16 px). **Flow:** output points of the
collapsible cards sit on the card header, so wires stay attached when a card is collapsed.

## A6 design size

**Vertical positions now follow the guide image** (owner's decision after comparing): frame
98 and QR 107.6 from the top, name baseline 130 above the bottom, MID cap top 22 below the
baseline (guide terms). The earlier layout followed the Affinity templates (101.45 / 111.6 /
127.6 / 17), 2–4 pt off from the guide image. Verified by rendering: every guide line lands on
the output within 0.1 pt (MID digits 21.9 below the baseline).

The sticker is now designed at A6 exactly: 105 × 148 mm = 297.6378 × 419.5276 pt
(1 pt = 25.4 / 72 mm; every page size is computed that way). The original guide was
317.5 × 427.5 pt, wider than the A-proportioned background (a5.svg), which left ~7.1 pt (2.5 mm)
side strips filled with edge bands at the old "Original" size. All guide numbers were scaled by
419.5276 / 427.5 = 0.981351 with x re-centred: QR 131.5 pt, frame 151.42 pt, logo 31.4 pt, name
22.57 pt, MID 9.81 pt, safe margin 12.66 pt, corner radius 13.0 pt. Text wraps exactly as before
(sizes and safe width scale together). A6 is the default page size; "Original" is gone from the
page list (it equals A6); saved old defaults (23 / 10 pt, margin 20, radius 13.25, Original) are
migrated. Artwork within 0.5 % of the trim's shape fills it exactly (a5.svg is 1241 × 1749, 0.03 %
off), so A3–A7 have no edge bands. Template-conformance tests map the template's measurements
through the same factor.

## UI refresh and fixes (after the first deploy)

- **Blank Bakong logo** (`public/artwork/bkw.svg`): the logo shape filled all white (a plain
  white disc over the QR centre), made from `bkb.svg`. The logo card has a Black / Red / Blank
  color picker.
- **Merchant-name fonts.** Typography has an English and a Khmer font picker (catalog in
  `src/config/fonts.ts`): Nunito Sans ExtraBold (guide), Inter, Montserrat, Poppins, Roboto;
  Nokora SemiBold (guide), Kantumruy Pro, Noto Sans Khmer, Battambang, Hanuman, Moul. All SIL
  OFL, from Google Fonts via `@expo-google-fonts` (licences in `public/fonts/licenses/`); the
  worker loads a font only when it is chosen (`Engine.ensureFonts`). A user font (.ttf/.otf)
  can be uploaded or dropped per script; it must contain the script's letters (A / ក), is kept
  in IndexedDB and re-registered on load. A missing font falls back to the guide font with a
  `font-missing` warning. The MID stays Nunito Sans Regular.
- **Corner frame radius and color.** The built-in frame is now drawn from numbers
  (`src/core/layout/corner.ts`, values in `layout.json → corner`: 2.7 pt stroke, 37.02 pt arms,
  guide radius 13.25 pt, #939598) so the radius (0 = square, up to the arm length) and color can
  change. Corners are true quarter circles, so the number is the curve's radius; 13.25 pt is the
  circle that best matches corner.svg's own (tighter "smooth") corner, within 1 %
  (`tests/corner.test.ts`). A saved radius of 20.6 (the earlier smooth-corner guide) is migrated.
  "Reset to default" restores the built-in frame, radius and color.
  An uploaded frame keeps its shape; the color setting repaints all its fills and strokes.
- **Layout:** settings are separate cards (soft shadow, 28 px apart) on a #f0f0f0 canvas
  (`--color-canvas`); the preview, its warnings and the rows table share that canvas with no
  dividers. Header shows the KHQR wordmark (`public/artwork/khqr-logo.svg`, taken from a5.svg).
  Typography has a Reset button in its header. Preview zoom never goes below 50 % (Fit included).
- **Settings tabs** (`src/ui/settingsTabs.tsx`): in Cards view the four sections share one
  panel with a tab bar (Assets · Data · Typography · Export; Data shows the row count). The
  open tab is remembered (`settingsTab` in the `khqr-ui` store). Panels render without their
  own card inside the tabs (`PlainSection` context); the Typography Reset sits at the top.
- **Position** (tab / Flow node, `PositionPanel`): X/Y shifts from the guide position for the
  corner frame, QR (the Bakong logo moves with it), merchant name and MID, shown in mm or pt and
  stored in pt (`settings.offsets`, x right / y down). With MID "Follow name" the MID also moves
  with the name. Shifts are clamped to ±1 artboard width; anything pushed past the sticker edge
  gets an `off-page` warning. Reset per element and Reset all.
- **Flow view** (`src/ui/flow.tsx`, React Flow `@xyflow/react` 12): a Cards / Flow switch in
  the header (desktop and phones; phones open zoomed to the Preview node, no minimap). The same
  Assets, Data, Typography and Export panels, the Preview, a Download node and the rows table
  become nodes on a dotted #f0f0f0 canvas. Assets, Data, Typography and Export (page size, bleed)
  each wire into the Preview, the Preview into Download (Download PDF / Print, progress, result),
  and Data into the rows table; every wire has its own output and input point. Nodes are dragged by their title
  strip so every control inside stays usable; positions are kept in localStorage (`khqr-ui`),
  with a "Reset layout" button, zoom controls and a minimap. The engine and settings are shared,
  so switching views changes nothing in the output.
- **Caching.** Default artwork moved from `public/assets/` to `public/artwork/`: `/assets/` is
  Vite's content-hashed output and is cached for a year as immutable, so a changed default
  SVG with the same name (the blank logo) stayed stale in browsers. `/artwork/`, `/fonts/` and
  the page itself are now served with `Cache-Control: no-cache` (revalidated, 304 when
  unchanged). Built-in logo choices are stored in IndexedDB by URL and fetched fresh on load;
  entries saved by older versions (SVG text) are mapped back to the file by name.
- **Drag and drop** onto each asset card and font card (`src/ui/useFileDrop.ts`), as well as
  the Excel and QR drop zones.
- **Preview zoom.** The page fits the preview area and follows window resizes ("Fit"); − / +
  buttons, Ctrl/⌘ + scroll or a trackpad pinch zoom from 10 % to 800 % of actual size, and the
  % button jumps to 100 % (actual size at 96 dpi). A zoomed preview can be dragged with the
  mouse to move around (touch keeps native scrolling).
- **No hairline around the artboard.** Where the background is narrower than the page (side
  gaps at Original size, bleed), viewers showed a light seam between the edge bands and the
  background's clipped edge (the artwork's white base layer anti-aliases over the band). Sampled
  bands are now drawn on top of the background and overlap its edge by 0.3 pt; a single chosen
  bleed color still goes underneath. Preview guides (trim / bleed / safe width) are now off by
  default.
- **Brand color #D22026** for every button, switch, selected tab and focus ring (`--color-brand`
  in `src/index.css`); refreshed layout, switches instead of checkboxes, status pills, icons.
- **Phones:** preview first, then the settings, then the rows table (CSS grid on desktop).

## Verification so far

| Check | Result |
| --- | --- |
| Unit tests (`npm test`) | 83 pass: config, wrap/Khmer, outlining, template conformance, page geometry, PDF has no `/Font` or `/Image`, Excel + row range, raster QR (incl. resolution rules, baked-in logo), printed QR size, export without background, hiding logo / corner frame |
| `pdffonts` / `pdfimages` on samples | 0 fonts, 0 images |
| `pdfinfo -box` A6 + 3 mm bleed | Media 314.65 × 436.54, Trim 297.64 × 419.53 at 8.50 |
| QR round trip (`npm run qa:qr`) | 160-char KHQR-style payload decodes with the logo on, EC L/M/Q, at 150 and 72 dpi |
| Browser e2e (`npm run e2e`, Chromium, production CSP) | Loads in ~1.5 s; Excel + 3 SVG + 2 PNG QRs → 5/6 rows matched (1 has no QR file); A6 + bleed + crop marks downloaded as one PDF and as a ZIP named by MID; rows 2–4 range gives a 3-page PDF; Print loads the PDF into the print frame; no console errors |
| Downloaded PDF | 0 fonts, 0 images, 5 pages, boxes correct; all 5 QRs decode at 150 dpi (2 were PNG uploads redrawn as vector) |
| 1,000 stickers (`tools/perf.ts`, Node) | A6 + bleed: export 21.7 s, PDF 20.1 MB, 1,000 pages, 0 fonts, peak RSS ~1.2 GB |
| Docker image build | Not run yet (no Docker daemon in the build sandbox); verify on Dokploy |

## Browser notes

- The engine (HarfBuzz wasm, fonts, SVG parsing, raster redraw, PDF writing) runs in one
  module Web Worker. The worker posts a `hello` once its top-level await (HarfBuzz init) has
  finished; the client queues calls until then. Without this the first message was lost.
- The UI loads Nokora for Khmer glyphs (`unicode-range` limited), so names display correctly
  even where the OS has no Khmer font.
- First preview at a new page size takes ~0.5–1 s while edge bands are sampled; cached after.

## Open items

- Real sample Excel, real QR SVGs and final background/logo from the business side.
- Khmer names reviewed by a Khmer reader.
- Print test on the actual roll-sticker printer and scan with a Cambodian banking app.
