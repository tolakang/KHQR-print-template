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

- **Wrapping is width-aware as well as character-aware.** The guide sample
  "The Pizza Company Sihanou" is exactly 25 characters but wraps to two lines in the guide,
  because at 23 pt it is wider than the artboard safe area. A line breaks when it exceeds
  25 grapheme clusters **or** the safe width (artboard − 2 × 20 pt). Words past line 2 are
  dropped and flagged; a single word wider than the safe width is flagged, never shrunk.
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

## Verification so far

| Check | Result |
| --- | --- |
| Unit tests (`npm test`) | 59 pass: config, wrap/Khmer, outlining, template conformance, page geometry, PDF has no `/Font` or `/Image`, Excel, raster QR |
| `pdffonts` / `pdfimages` on samples | 0 fonts, 0 images |
| `pdfinfo -box` A6 + 3 mm bleed | Media 314.65 × 436.54, Trim 297.64 × 419.53 at 8.50 |
| QR round trip (`npm run qa:qr`) | 160-char KHQR-style payload decodes with the logo on, EC L/M/Q, at 150 and 72 dpi |
| Browser e2e (`npm run e2e`, Chromium, production CSP) | Loads in ~1.5 s; Excel + 3 SVG + 2 PNG QRs → 5/6 rows matched (1 has no QR file); A6 + bleed + crop marks downloaded as one PDF and as a ZIP named by MID; no console errors |
| Downloaded PDF | 0 fonts, 0 images, 5 pages, boxes correct; all 5 QRs decode at 150 dpi (2 were PNG uploads redrawn as vector) |
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
