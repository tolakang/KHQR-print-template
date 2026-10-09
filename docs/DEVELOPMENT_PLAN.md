# KHQR Roll Sticker PDF Generator: Development & Verification Plan

2026-10-09 · @Tola Kang

> Snapshot of the agreed plan (Claude Doc, rev 36). Changes made during development and the verification results are tracked in [IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md); where the two differ, the notes win.

## 1. Overview and locked decisions

We build a browser-based tool that merges uploaded KHQR files with Excel rows and exports one vector-only PDF page per merchant sticker, about 3 weeks of work for one developer, deployed on Dokploy.

**Inputs:** many finished QR files (SVG), one Excel file, a background SVG, and a Bakong logo SVG.

**Output:** a PDF with one sticker per page, all fonts outlined, no raster images, in the page size chosen at export (Original, A3 to A7, custom), with or without bleed.

| Topic | Decision |
| --- | --- |
| Template | Roll Sticker KHQR Single, artboard 317.5 × 427.5 pt, built exactly from the guide |
| QR | Uploaded QR is already correct. An SVG QR is embedded as provided. A raster QR (PNG or JPG) is redrawn as vector after a decode check. Placed at 134 × 134 pt |
| Bakong logo | Taken from the Logo upload slot and always scaled to 32 × 32 pt (a larger upload is scaled down, a smaller one up, uniformly), centered on the QR |
| Background | Uploaded SVG with no bleed. Fitted to the trim box only and never enlarged for the bleed. The bleed area is filled with a solid edge color |
| Merchant name | One Excel column, English and Khmer mixed. Max 25 characters per line, max 2 lines, wrapped and dropped by whole word. Nunito Sans ExtraBold for English, Nokora SemiBold for Khmer, 23 pt default, adjustable |
| MID | Line `MID: <value>`, Nunito Sans Regular, 10 pt default, adjustable. Max 15 characters, configurable for later growth |
| Export size | Page equals the chosen size exactly (A6 = 297.64 × 419.53 pt). Artwork scales uniformly, never stretched |
| Bleed | Choose bleed or no bleed at export. Default 3 mm, custom value editable, optional per-side values |
| Privacy | All processing in the browser. No files are uploaded to a server |
| Print | Download saves the PDF to your local computer through the browser, and Print opens the browser print dialog with the same generated PDF. Silent printing is not possible in a browser |

## 2. Sticker layout specification (from the guide)

The artboard is 317.5 × 427.5 pt and every value below comes from your guide. Coordinates are measured from the top-left corner and stored in `layout.json`, so a spec change is a data edit.

| Element | Spec | Position (pt) |
| --- | --- | --- |
| Corner frame | 154.3 × 154.3 pt, 81.6 from left and right | x 81.6 to 235.9, y 98 to 252.3 |
| QR | 134 × 134 pt, 91.7 from left and right, 107.6 from top | x 91.7 to 225.7, y 107.6 to 241.6 |
| Bakong logo | 32 × 32 pt, centered on the QR | x 142.75 to 174.75, y 158.6 to 190.6 |
| Name line 1 | Nunito Sans ExtraBold (EN) or Nokora SemiBold (KH), 23 pt, centered, 25 characters max | Baseline at 299.9 pt (127.6 pt above the artboard bottom) |
| Name line 2 | Same style, 11.8 pt gap below line 1 | Only when the name wraps |
| MID | Nunito Sans Regular, 10 pt, centered, `MID: <value>`, 15 characters max | 17 pt below the last name line |

Rules for applying it:

- Gaps are measured between cap-height boxes (the blue lines in the guide), so text is positioned by cap height and baseline, not by font box.
- The background and bleed never change these positions, which are always relative to the trim box.
- The Affinity templates `qr-en-template.svg` and `qr-kh-template.svg` (same 0.743 ratio) are used as an overlay reference only. The 38 pt gap and the 127.6 pt bottom measure disagree by about 4 pt in the guide. We anchor on the measured baseline (299.9 pt), derive the other lines from the 11.8 pt and 17 pt gaps (about 327.9 pt for line 2 and 351.9 pt for MID in a two-line name), check the result against the vector templates, and record the final numbers in `layout.json`.

**Fixed target sizes.** The QR is always placed at 134 × 134 pt and the Bakong logo at 32 × 32 pt, whatever size the uploaded file has. Larger files are scaled down and smaller files are scaled up, using one uniform factor, so nothing is stretched.

## 3. Features and dashboard

The dashboard has five panels, and every setting is saved in the browser so a refresh keeps your work.

| Panel | Controls |
| --- | --- |
| Assets | Upload slots for background SVG, Bakong logo SVG and multiple QR SVG files. Each slot shows a thumbnail, replace and reset. Built-in `a5.svg`, `bkb.svg` and `bkc.svg` are the defaults, and the black Bakong logo (bkb) is used unless you upload another |
| Data | Excel upload, sheet picker, header detection, column mapping (QR file name, Merchant name, MID), row range, table with warnings |
| Typography | Merchant name size (default 23 pt) and MID size (default 10 pt), each with a numeric field, slider and reset to guide value |
| Export | Page size (Original, A3, A4, A5, A6, A7, custom mm), Bleed or No bleed, bleed amount (default 3 mm, custom 0 to 10 mm, optional per side), bleed fill color (sampled by default), crop marks toggle, Download, Print |
| Preview | Live preview of the selected row with next and previous, plus an overlay of the guide's measurement lines |

Behavior details:

- **QR matching:** each row finds its file by the mapped QR name. The list shows matched, missing and duplicate names, and a missing QR blocks that row with a clear message.
- **Upload validation:** QR files may be SVG, PNG or JPG: an SVG QR is embedded as is, and a raster QR is redrawn as vector (see section 5). Logo and background should be SVG, and a raster one is allowed only with a warning that it stays a raster image and fails the vector-only check.
- **Trimming:** over-limit cells are highlighted with a before and after view. Names drop whole words after line 2. MID is cut at 15 characters.
- **Mixed scripts:** English and Khmer in one cell are split into runs, each shaped with its own font and joined on one baseline.
- **Safe width:** a name line wider than the safe width (default: artboard width minus 20 pt each side) triggers a warning instead of a silent shrink, so the spec stays exact.
- **Persistence:** settings in localStorage, uploaded assets in IndexedDB.

**Download to your computer.** The Download button saves the file straight to your local machine, with no upload to a server.

- Default: one combined PDF with one sticker per page, named like `khqr-stickers-A6-bleed3mm.pdf` (size and bleed in the name).
- Option: a ZIP of single-sticker PDFs, one per row, each named by MID.
- Option: split a large batch into several PDFs of a chosen page count, for example 500 pages each.
- A progress bar shows while the file is built, and Cancel leaves no partial download.
- The file is created in the browser as a blob and saved through a normal download, so it lands in the browser's download folder. Chrome and Edge can also ask where to save it.

## 4. Architecture and tech stack

The app is a static single-page site that does all work in the browser, which keeps merchant data private and the server trivial.

| Concern | Choice |
| --- | --- |
| App | Vite, React, TypeScript, Tailwind CSS (React is the recommended choice; Vue only if your team prefers it, decided before Phase 1) |
| Excel | SheetJS (`xlsx`) |
| Text shaping | `harfbuzzjs` (correct Khmer clusters, stacked subscripts, vowel reordering) |
| Segmentation | `Intl.Segmenter` for words and grapheme clusters (`km` and `en`) |
| Fonts | Nunito Sans ExtraBold and Regular, Nokora SemiBold, all OFL, bundled as TTF |
| SVG handling | `svgo` for cleanup, a path parser for glyph outlines and QR validation, and a QR reader (zxing-wasm or jsQR, chosen in the Phase 3 spike) to decode raster QR codes and rebuild them as vector |
| PDF | `pdf-lib` plus a custom SVG-to-PDF converter (or svg-to-pdfkit, decided in the Phase 2 spike), with TrimBox and BleedBox set explicitly. No fonts or images embedded |
| Batching | Web Worker builds pages and streams them to the PDF, target 1,000+ stickers without freezing the tab |
| State | Zustand store, localStorage for settings, IndexedDB for assets |
| Tests | Vitest, Playwright, poppler-utils (`pdffonts`, `pdfimages`, `pdftoppm`), `pixelmatch`, `zbar` for QR decoding |
| Hosting | Docker (Node build, nginx serve) on Dokploy |

Data flow for one export:

1. Read settings, assets and the Excel rows.
2. For each row, match the QR file and normalize the name and MID (trim, wrap, limit).
3. Shape each text run with HarfBuzz and turn glyphs into path outlines.
4. Compose the sticker group at guide coordinates: background, frame, QR, logo, name lines, MID.
5. Apply the page transform: uniform scale, centered on the trim box, background cover scaled to the bleed box.
6. Write the page into the PDF with its page boxes, then stream the next row.
7. Offer the file for download, or load it into a hidden iframe and call `print()`.

## 5. Core algorithms

**Text outlining.** The name is split into script runs (Latin, Khmer). Each run is shaped by HarfBuzz with its font, and each glyph outline becomes an SVG path with the shaped offsets applied. The runs are joined on one baseline and centered as a single line. No `<text>` element and no embedded font reaches the PDF.

**Name wrapping (max 2 lines, 25 characters, by word).**

1. Split into words with `Intl.Segmenter` (spaces for Latin, dictionary segmentation for Khmer).
2. A line fits when it has 25 or fewer grapheme clusters and its outlined width is within the safe width.
3. Fill line 1 with whole words, then line 2 the same way.
4. Words that do not fit on line 2 are dropped. No word is cut and no ellipsis is added.
5. Only a single word longer than 25 clusters is cut, on a grapheme boundary, so Khmer glyphs never break.
6. Every changed row is flagged in the table with original and result.

**MID.** Format `MID: <value>`, trimmed to the configured limit (15 by default, `limits.mid`), no wrapping.

**Vertical flow.** Line 1 starts at the guide offset below the QR. Line 2 follows with the 11.8 pt gap and MID sits 17 pt below the last name line. A one-line name therefore moves MID up by one line pitch. If you prefer MID at a fixed position instead, it is one config switch (`mid.anchor`).

**Background ****and bleed****.** The background is fitted to the trim box with one uniform scale and centered, so it covers the trim area and is never enlarged for the bleed. In bleed mode, the extra area around it is filled with a solid color, sampled per side from the background's edge by default or chosen in the export panel. In no-bleed mode only the trim area is exported. The trim area looks identical in both modes. A flat edge color works best, and a pattern or gradient at the edge triggers a warning because the fill will not match it.

**Page size and bleed.**

| Mode | A6 page | Page boxes |
| --- | --- | --- |
| No bleed | 297.64 × 419.53 pt | MediaBox equals TrimBox |
| Bleed, default 3 mm (8.50 pt) | 314.65 × 436.54 pt | TrimBox is exact A6, BleedBox equals MediaBox |

The sticker artboard (317.5 × 427.5 pt) is scaled uniformly with `s = min(trimW / 317.5, trimH / 427.5)` and centered in the trim box. A6 scales it to about 93.7%, and nothing is stretched. Optional crop marks add margin outside the bleed.

**Logo and QR.** The logo SVG is placed at 32 × 32 pt over the QR center with no extra ring, because the supplied logo already includes the white ring. This is confirmed against the template overlay in Phase 2. An SVG QR is embedded as given, and a raster QR is redrawn as vector as described next.

**Scaling uploaded QR and logo.** The app reads the file's size from the SVG viewBox (falling back to width and height in any unit, converted to pt) or from the pixel size of a raster file. It then applies one scale factor, `s = target / max(width, height)`, equally in X and Y, and centers the artwork in its target box: 134 × 134 pt for the QR and 32 × 32 pt for the logo.

- A square file fills its box exactly, whether the upload is larger or smaller than the target.
- A non-square file is fitted inside the box without cropping or stretching, and gets a warning because a QR must be square.
- Empty padding around the logo is ignored, so the visible logo measures 32 pt. The QR is measured on its dark module area, with the quiet zone excluded, because the 134 pt in the guide is the visible code. This is confirmed against the template overlay in Phase 2.
- Transforms and clip paths inside the upload are applied before measuring.
- The preview and table show the original size and the scale applied, for example "scaled from 512 × 512 to 134 × 134 pt".

**Raster QR redraw (PNG or JPG).** If an uploaded QR is a raster image, it is rebuilt as clean vector before it is placed, so the exported PDF still contains no images.

1. Decode the image with a QR reader and keep the payload, version and error-correction level.
2. Find the code's corners, correct rotation and perspective, and detect the module grid (for example 29 × 29 modules for version 3, plus the quiet zone).
3. Sample the center of every module and threshold it, which gives the exact black and white matrix of the uploaded image.
4. Draw the dark modules as one merged path of rectangles, so no hairline seams show between modules, on a square grid scaled to 134 × 134 pt.
5. Verify: render the new vector, decode it, and require the same payload as the original, also with the Bakong logo in place. If the check fails, rebuild from the decoded payload with the same version and error-correction level, which scans the same but may use a different mask pattern. If that also fails, refuse the file and say why (blurry, cropped, too low resolution or damaged).

Rules for raster QR files:

- Resolution: warn below about 4 px per module and refuse below 2 px per module.
- The image must be square, and the quiet zone is kept.
- A QR with a logo already baked in is warned about, because the modules under it are lost.
- Rows using a redrawn QR carry a "redrawn" badge in the data table and the preview.
- The export panel has a setting "Redraw raster QR as vector", on by default. Switched off, a raster QR is refused.
- An SVG QR is always preferred when you have one, because a redraw is a reconstruction of the image.

## 6. Repository structure and config model

```
khqr-sticker/
  Dockerfile  nginx.conf  docker-compose.yml  .dockerignore
  public/fonts/        NunitoSans-ExtraBold.ttf  NunitoSans-Regular.ttf  Nokora-SemiBold.ttf
  public/assets/       a5.svg  bkb.svg  bkc.svg  (defaults)
  src/
    config/layout.json     all guide numbers
    config/limits.json     name 25, lines 2, mid 15, safeMargin 20
    core/text/             shape.ts  outline.ts  runs.ts  wrap.ts  trim.ts
    core/layout/           sticker.ts  page.ts  background.ts
    core/pdf/              writer.ts  boxes.ts
    core/svg/              parse.ts  validate.ts  embed.ts
    core/excel/            read.ts  mapColumns.ts
    workers/export.worker.ts
    ui/                    AssetsPanel  DataPanel  TypographyPanel  ExportPanel  Preview
    store/                 settings.ts  assets.ts
  tests/                   unit  integration  e2e  fixtures  golden
  tools/                   preflight.sh  overlay-diff.ts  qr-scan.sh
```

Settings stored per browser:

| Key | Default | Notes |
| --- | --- | --- |
| `nameSizePt` | 23 | Merchant name font size |
| `midSizePt` | 10 | MID font size |
| `limits.nameChars` | 25 | Per line |
| `limits.nameLines` | 2 | Fixed by the guide decision |
| `limits.mid` | 15 | Raise for longer MIDs later |
| `safeMarginPt` | 20 | Warn when a line exceeds artboard width minus 2 × margin |
| `bleedMm` | 3 | Custom 0 to 10, optional per side |
| `bleedEnabled` | false | Chosen at export |
| `pageSize` | original | Original, A3 to A7, custom |
| `cropMarks` | false | Adds margin outside the bleed |

## 7. Phased development plan

Seven phases take about 3 weeks. A phase is finished only when its exit criteria pass, and the highest-risk work (Khmer outlining and exact layout) comes first.

| Phase | Tasks | Deliverable | Exit criteria | Est. |
| --- | --- | --- | --- | --- |
| 1. Foundation | Scaffold Vite + React + TS, lint and test setup, Dockerfile, nginx, first Dokploy deploy | Empty app live on a Dokploy URL | Deploy from `main` works and the health check passes | 1 day |
| 2. Outline and layout core | HarfBuzz integration, glyph-to-path, script runs, mixed EN and KH line, `layout.json`, sticker composer, overlay against the two Affinity templates | A script that renders a sample sticker to SVG and PDF | Overlay diff under 0.1 pt on all guide elements. Khmer samples shape correctly | 3 to 4 days |
| 3. Dashboard and assets | Panel shell, upload slots for background, logo and QR, SVG validation, raster QR vectorizer with decode check, IndexedDB and localStorage persistence | Working asset management | Refresh keeps assets. Bad files refused with clear messages | 2 days |
| 4. Data and typography | Excel read, sheet and column mapping, QR matching, wrap and trim engine, font size controls, table warnings, live preview | End-to-end preview of any row | Wrap and trim tests pass. Preview equals export geometry | 3 days |
| 5. Export | PDF writer with TrimBox and BleedBox, size presets, bleed options, background fit and bleed edge fill, crop marks, download and print flow | Exact-size PDF for each preset | A6 page equals 297.64 × 419.53 pt. Bleed boxes correct. Preflight passes | 3 days |
| 6. Hardening | Worker batching, progress bar and cancel, memory checks, preflight suite in CI, QR scan tests, visual regression | Green test suite and performance report | 1,000 rows export without freezing. All checks in section 8 pass | 2 days |
| 7. Release | UX polish, error messages, user guide, production deploy, backup of the settings export | Production site | Acceptance checklist in section 8 signed off | 1 day |

Working rules for the build in Claude Code:

- Phase 2 starts as a spike with a single sample sticker before any UI is built.
- Each phase ends with a commit tagged `phase-N`, and its tests run in CI before the next phase starts.
- Anything that changes a number in the guide goes through `layout.json` and a note in the repo changelog.

## 8. Verification plan

Every requirement has an automated check that fails the build, plus a short manual acceptance pass before release.

### 8.1 PDF preflight (runs on every exported PDF in CI)

| Check | Tool | Pass condition |
| --- | --- | --- |
| No fonts | `pdffonts` | Lists zero fonts |
| No raster images | `pdfimages -list` | Lists zero images |
| Vector only | Content stream scan with `qpdf --qdf` | Only path, fill, stroke, clip, transform and graphics-state (opacity) operators. No text operators (`BT`, `Tj`) and no image `Do` |
| Page size | `pdfinfo -box` | A6 no bleed: 297.64 × 419.53 pt within 0.01 pt. A6 with 3 mm bleed: 314.65 × 436.54 pt |
| Boxes | `pdfinfo -box` | TrimBox equals the requested size. BleedBox equals MediaBox in bleed mode, and MediaBox equals TrimBox in no-bleed mode |
| Page count | `pdfinfo` | Equals the number of exported rows |
| Scaling | Geometry test | One uniform scale factor in X and Y, within 1e-6 |

### 8.2 Layout accuracy

| Check | Method | Pass condition |
| --- | --- | --- |
| Guide positions | Unit test on `layout.json` against the guide table | QR 134 pt, logo 32 pt, offsets 91.7, 107.6, 81.6, 98 match exactly |
| Template overlay | Render at 600 DPI, diff against `qr-en-template.svg` and `qr-kh-template.svg` with `pixelmatch` | Edge deviation under 0.1 pt, and the two documented guide inconsistencies recorded |
| Gaps | Measure cap-height boxes in the output | 11.8 pt between name lines, 17 pt to MID |
| Font sizes | Compare outline height to font metrics | 23 pt and 10 pt by default, and changes follow the dashboard values |
| Visual regression | Golden PNGs at 300 DPI for 8 reference stickers | Pixel difference under 0.1% |

### 8.3 Text engine tests

| Case | Expectation |
| --- | --- |
| Name of exactly 25 characters | One line, no change |
| Name of 26 characters with several words | Wraps to line 2 by word |
| Name long enough to exceed 2 lines | Extra words dropped, none cut, flagged in the table |
| Single word over 25 clusters | Cut on a grapheme boundary |
| Khmer name with stacked subscripts and vowel signs | Shapes correctly, never splits a cluster, matches a HarfBuzz reference render |
| Mixed English and Khmer in one cell | Two fonts on one baseline, centered as one line |
| Wide letters (`WWWW`, `MMMM`) at 25 characters | Safe-width warning shown, no silent shrink |
| MID of 15, 16 and 20 characters | 15 kept, others cut and flagged, limit changeable through config |
| Empty, whitespace-only and emoji cells | No crash, row flagged |

### 8.4 Data and upload tests

- Excel: `.xlsx` and `.xls`, a sheet with a header offset, empty rows, duplicate QR names, a missing QR file, 5,000 rows.
- Uploads: a PNG or JPG QR is redrawn as vector and verified, a blurry, cropped or low-resolution raster QR is refused with a reason, a non-square QR is warned, an SVG with embedded `<image>` is rejected for QR and warned for background and logo.
- Persistence: reload keeps settings and assets, reset restores the guide defaults.

**Scaling tests.** Upload QR files at 50, 134, 500 and 2,000 pt and logo files at 16, 32 and 200 pt, using viewBox only, mm units and px units. The placed QR must measure 134 pt and the logo 32 pt within 0.01 pt, with the aspect ratio unchanged and both centered within 0.01 pt. A non-square upload must show the warning.

### 8.5 QR integrity

Decode every sample QR with `zbar` before and after export, rasterized at A6 and A7 from the PDF, with the logo in place. The payload must be identical. A failure at A7 produces a warning in the export panel.

**Raster QR test set.** Use PNG and JPG versions of the sample QR files at 4, 6 and 10 px per module, rotated, slightly skewed and with JPEG compression. Each rebuilt vector must decode to the same payload, with the logo in place, at A6 and A7. Blurry, cropped and 2 px per module images must be refused with a reason and never exported.

### 8.6 Performance and stability

| Test | Pass condition |
| --- | --- |
| 1,000 stickers exported | Under 60 seconds on a mid-range laptop, UI stays responsive |
| Memory | Peak below 1.5 GB, and the PDF streams page by page |
| Cancel | Cancel stops the worker within 1 second and leaves no partial download |
| Browsers | Latest Chrome, Edge and Firefox, plus Safari for the preview and download |

### 8.7 Manual acceptance checklist

- [ ] Upload background, logo, QR files and Excel, map columns, preview matches the guide image
- [ ] Change merchant name size and MID size, preview and PDF both follow
- [ ] Export A6 without bleed, open in Illustrator or Acrobat, confirm 297.64 × 419.53 pt and that text is outlines
- [ ] Export A6 with 3 mm bleed and with a custom bleed, confirm Trim and Bleed boxes
- [ ] Export A7, A5, A4 and A3, confirm uniform scaling with no stretching
- [ ] Print through the browser dialog to a real printer, confirm size at 100% scale
- [ ] Print one test sheet on the actual roll sticker printer and scan the QR with a Cambodian banking app
- [ ] Khmer names reviewed by a Khmer reader for correct shaping

- [ ] Click Download, confirm the file lands on the computer, opens in a PDF viewer, and the ZIP and split options produce the right files and names

## 9. Dokploy deployment

The site is a static build served by nginx, so Dokploy needs no database, volume or environment secrets.

1. **Image:** a multi-stage `Dockerfile`. Stage one is `node:20-alpine` and runs `npm ci` and `npm run build`. Stage two is `nginx:alpine` serving `dist/` with a custom `nginx.conf`.
2. **nginx settings:** single-page fallback to `index.html`, gzip, long cache for hashed assets, no cache for `index.html`, correct MIME types for `.wasm` (HarfBuzz) and `.ttf`, and security headers (`X-Content-Type-Options`, `Referrer-Policy`, a CSP that allows `blob:` plus workers and WebAssembly).
3. **Dokploy app:** create an Application from the Git repository, build type Dockerfile, container port 80.
4. **Domain:** add the domain in Dokploy with HTTPS through Traefik and Let's Encrypt.
5. **Pipeline:** auto-deploy on push to `main`. A `develop` branch deploys to a staging app for review before production.
6. **Health check:** an HTTP check on `/` in Dokploy, plus a `/healthz` location in nginx returning 200.
7. **CI before deploy:** lint, unit tests, build, then the preflight suite from section 8, so a broken export never reaches production.
8. **Rollback:** Dokploy keeps previous deployments, and each release is tagged in Git (`v1.0.0`) so any version can be redeployed.

No user data is stored on the server. If you later add features that need storage, such as saved templates shared between users, that would be a separate backend phase.

## 10. Risks, assumptions and handoff

The biggest risk is Khmer text shaping, so it is built and tested first in Phase 2. The second risk is SVG-to-PDF fidelity: the Affinity files use clip paths, nested transforms and 80% opacity, so Phase 2 also includes a conversion spike that compares the PDF with the SVG render before any UI is built. The third risk is the raster QR redraw: a blurry or low-resolution image cannot be rebuilt reliably, so every redrawn QR must decode to the same payload as the original or it is refused.

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Khmer shaping errors (subscripts, vowel order) | Broken names on stickers | HarfBuzz shaping, reference renders, review by a Khmer reader |
| Bleed fill does not match a patterned background edge | Slight color difference in the bleed area if the print shop cuts off-trim | Edge color sampled per side, color picker in the export panel, warning for patterned edges |
| Guide inconsistency (38 pt vs 127.6 pt, about 4 pt) | Slight vertical offset | Follow the Affinity vector templates, record final values in `layout.json` |
| QR too small at A7 | Scan failure | Automatic scan test and a warning in the export panel |
| Very large batches | Slow or frozen tab | Worker, streaming PDF writer, progress and cancel |
| Uploaded SVG with hidden raster images | Breaks the vector-only rule | Validation rejects or warns, preflight confirms |
| Silent printing expected | Browser always shows a print dialog | Documented. A CUPS or IPP service is an optional later phase |

Assumptions to confirm:

- The background SVG supplied (`a5.svg` or your own) has no bleed and a proportion close to the sticker.
- Excel has one name column (English and Khmer mixed), a QR file name column and an MID column.
- A name wider than the safe width is warned about, not shrunk.
- When the name is one line, MID moves up by one line pitch instead of staying at a fixed position.

Before development starts in Claude Code, please confirm this plan and send:

- [ ] Approval of this plan, or the changes you want
- [ ] The three font files, or permission to download the OFL versions
- [ ] A sample Excel file with real column names and a few Khmer names
- [ ] A few sample QR SVG files, and your final background and Bakong logo files
