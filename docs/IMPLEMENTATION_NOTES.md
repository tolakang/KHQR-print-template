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

## Verification so far

| Check | Result |
| --- | --- |
| Unit tests (`npm test`) | 73 pass: config, wrap/Khmer, outlining, template conformance, page geometry, PDF has no `/Font` or `/Image`, Excel + row range, raster QR (incl. resolution rules, baked-in logo), printed QR size, export without background |
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
