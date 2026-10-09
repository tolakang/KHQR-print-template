# Project handoff: KHQR Roll Sticker Generator

Status as of 2026-10-09 · Owner: Tola Kang (tolakang) · Repo: `tolakang/KHQR-print-template`

## 1. What this is

A static web app that turns **finished KHQR codes + an Excel list of merchants** into
**print-ready, vector-only PDFs** of the "Roll Sticker KHQR Single", designed at A6 (105 × 148 mm = 297.638 × 419.528 pt; the original guide was 317.5 × 427.5 pt),
one sticker per page. Everything runs in the user's browser; no file is uploaded to a server.
It deploys to Dokploy as an nginx container.

Read next: [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) (the agreed spec; also as
[PDF](<KHQR Roll Sticker PDF Generator - Development & Verification Plan.pdf>), exported from the Claude Doc, rev 36) and
[IMPLEMENTATION_NOTES.md](IMPLEMENTATION_NOTES.md) (what changed during the build, and why;
where the two differ, the notes win). The guide image is in
[reference/](reference/guide-roll-sticker-khqr-single.png).

## 2. Status at a glance

| Area | State |
| --- | --- |
| Text engine (EN + KH shaping, outlining, word wrap, limits) | Done, tested |
| SVG → PDF writer (no fonts, no images, page boxes) | Done, tested |
| Layout (QR 134 pt, logo 32 pt, frame, name, MID) | Done, matches vector templates within 1 pt |
| Page sizes, bleed, edge fill, crop marks | Done, tested |
| Raster QR (PNG/JPG) → verified vector | Done, tested |
| Excel/CSV import, column mapping, QR file matching | Done, tested |
| Dashboard (Assets, Data, Typography, Export, Preview, rows table) | Done, checked in Chromium |
| Download (combined / ZIP by MID / split), Print, row range | Tested e2e (combined, ZIP, range, Print up to the browser dialog) |
| Raster QR resolution rules, baked-in logo, QR-too-small warning | Done, tested |
| CI (lint, tests, build, PDF preflight, QR round trip) | Green on GitHub Actions |
| Docker image / Dokploy deploy | **Written, never built** (no Docker in the dev sandbox) |
| Real data, real printer, banking-app scan | **Not done**: needs the business side |

Test suite: 83 unit tests (`npm test`), Playwright end-to-end (`npm run e2e`).

## 3. Run it

Requirements: Node 22+, npm. Optional: `poppler-utils` (pdffonts/pdfinfo/pdftoppm) for the
QA scripts; Playwright Chromium for e2e.

```bash
npm ci
npm run dev          # http://localhost:5173 — dashboard with a sample sticker
npm test             # unit tests
npm run build        # dist/
npm run sample       # out/sample-*.pdf from the bundled assets (5 test merchants, 3 variants)
npm run qa:qr        # builds stickers with a KHQR-length payload and decodes them (needs poppler)
npm run e2e          # builds, serves dist/ with the production CSP, drives the UI in Chromium
npx tsx tools/perf.ts 1000   # performance check, writes out/perf.pdf
```

Using the app: Data panel → drop the Excel file → check the three column dropdowns
(name, MID, QR file name; if there is no QR column, QR files are matched by MID in the file
name) → drop the QR files or a folder → click rows in the table to preview → set the Export
panel → Download or Print.

## 4. Deploy (Dokploy)

1. Dokploy → New Application → Git → this repo, branch `main`.
2. Build type **Dockerfile** (root `Dockerfile`), container port **80**. No env vars,
   volumes or database.
3. Add the domain with HTTPS (Traefik / Let's Encrypt).
4. Health check: `GET /healthz` returns `ok`.
5. Turn on auto-deploy on push to `main` if wanted.

**First deploy is also the first real Docker build**, so check:
- the build log (multi-stage: `node:22-alpine` builds, `nginx:alpine` serves `dist/`);
- `/healthz` → 200;
- in the browser: DevTools shows no CSP errors, `harfbuzz-*.wasm` is served as
  `application/wasm`, fonts load from `/fonts/`, and the sample sticker renders.

The CSP in `nginx.conf` is the one the e2e test runs against (it reads it from that file).
If you change one, the e2e test follows automatically.

## 5. How it works

```
Excel ──read.ts──► rows ─┐
QR files ─► SVG: toScene │                      ┌─► svgOut.ts ─► preview (same geometry)
        └► PNG/JPG: raster.ts (decode→trace→verify)
                         ▼
Engine (Web Worker) ─ composeSticker (layout.json, text outline, wrap)
                    ─ buildPage (page size, bleed, edge fill, crop marks)
                    ─ PdfBuilder (pdf-lib, paths only, background as one Form XObject)
                         ▼
                    PDF / ZIP blob ─► download or hidden-iframe print
```

Key idea: every input is converted to one internal **Scene** (flat list of fills, strokes and
clips in points, y-down). The preview and the PDF are both rendered from the same Scene, so
what you see is what prints.

| Path | Responsibility |
| --- | --- |
| `src/config/layout.json`, `limits.json` | All guide numbers and limits; edit here, not in code |
| `src/core/text/` | `wrap.ts` (graphemes, Khmer word breaks, 25 chars / safe width / 2 lines, MID), `outline.ts` (HarfBuzz shaping → glyph paths), `fonts.ts` |
| `src/core/svg/toScene.ts` | SVG → Scene (transforms, clip paths, opacity, `<use>`, `<style>`, live text outlined) |
| `src/core/layout/` | `sticker.ts` (compose one sticker), `page.ts` (page geometry, bleed, edge bands, crop marks), `place.ts`, `sample.ts` (vector color sampling) |
| `src/core/pdf/writer.ts` | `PdfBuilder`: Scene → PDF operators, TrimBox/BleedBox/ArtBox, ExtGState opacity, Form XObjects |
| `src/core/qr/raster.ts` | Raster QR redraw: jsQR decode, grid sample, verify, rebuild fallback, outline trace |
| `src/core/excel/read.ts` | SheetJS read, MID kept as text, column guessing, QR file matching |
| `src/engine/` | `engine.ts` (holds fonts/assets/QRs; preview; export), `client.ts` (main-thread RPC), `svgOut.ts`, `types.ts` |
| `src/workers/engine.worker.ts` | Worker host; posts `hello` after HarfBuzz's top-level await finishes |
| `src/store/` | Zustand: `settings.ts` (persisted to localStorage), `app.ts` (assets in IndexedDB, workbook, QR status) |
| `src/ui/` | Panels, preview, rows table, export bar; `flow.tsx` = node (React Flow) view of the same panels |
| `tools/` | QA scripts: sample, qr-roundtrip, qr-scan, svg-to-pdf, render-svg, diff-png, e2e, perf |
| `tests/` | Vitest suites + the two Affinity templates as fixtures |

## 6. Decisions you should know before changing anything

0. **The design is A6 (297.638 × 419.528 pt), the default page size.** The guide was drawn at
   317.5 × 427.5 pt, but the background artwork is A-proportioned, so it left ~7 pt side strips.
   Every guide number in `layout.json` was scaled by 419.528 / 427.5 = 0.981351 (x re-centred), so
   QR (now 131.5 pt), frame, logo and text keep their place on the artwork, and the background fills
   the page exactly. The numbers below are the original guide values; `layout.json → _notes` lists
   both. Page sizes are exact (mm × 72 / 25.4).
1. **Vertical positions follow the vector templates, not the guide image's top numbers.**
   The guide's 98 / 107.6 pt measures are ~4 pt off its own 38 pt and 127.6 pt gaps.
   `layout.json` uses QR top 111.6, frame 101.45, logo 162.6. `tests/sticker.test.ts`
   pins this against `qr-en-template.svg`. Details in IMPLEMENTATION_NOTES.
2. **The whole name is at most 25 characters** (all lines together, spaces included; the
   KHQR merchant-name limit; the setting cannot go higher). Extra whole words are dropped and
   flagged ("Name trimmed" in the table). Lines break at the safe width (artboard − 2 × 20 pt),
   max 2 lines; never shrink automatically. This reproduces the guide's "The Pizza Company / Sihanou".
3. **MID follows the last name line** (KH template). "Fixed" is a setting.
4. **Background is fitted inside the trim, never enlarged.** Gaps and bleed are filled with
   **edge bands** sampled from the artwork (vector point-in-path, refined to 0.02 pt), so the
   red header/footer continue to the cut. `a5.svg` is A5-proportioned: it fits A6 exactly and
   leaves ~7 pt side gaps at Original size (filled by the bands).
5. **QR is measured on its dark modules** (quiet zone ignored) and placed at 134 × 134 pt;
   white quiet-zone shapes outside that box are dropped so they don't cover the frame.
6. **Own SVG→PDF converter on pdf-lib** (not svg-to-pdfkit). Gradients become their first
   stop, masks/filters/embedded images are skipped, each with a warning.
7. Uploaded **background/logo/corner must be SVG** (raster rejected), stricter than the plan,
   which allowed raster with a warning. Easy to relax in `store/app.ts → setAssetFile`.
8. Fonts are TTFs from `@expo-google-fonts` (OFL, licences in `public/fonts/` and
   `public/fonts/licenses/`). The merchant name defaults to the guide fonts; other bundled
   fonts and uploaded .ttf/.otf files can be chosen in Typography (`src/config/fonts.ts`).
   Nokora is also loaded as a UI font for Khmer text in tables.

## 7. Known gaps and risks (honest list)

Not built yet, from the plan:
- Before/after view of trimmed names in the table (table flags issues; preview shows the result).
- The QR-too-small check is a size rule (20 mm / 0.4 mm per module), not a real decode of
  each exported page at A7; SVG QRs only get the 20 mm rule (module count unknown).
- Visual regression golden PNGs; settings export/backup; slider controls (numeric inputs only).
- `qpdf` content-stream scan; CI checks `pdffonts`/`pdfimages` and unit tests assert no
  `/Font` or `/Image` objects instead.

Risks:
- **Memory on large batches.** 1,000 A6 stickers: 21.7 s, 20 MB PDF, peak ~1.2 GB RSS in Node
  (plan limit 1.5 GB). For bigger batches use "split by page count", or improve
  `PdfBuilder` to flush pages (pdf-lib keeps the whole document in memory).
- **Browser coverage**: tested in Chromium only. Firefox/Safari untested (module workers,
  `OffscreenCanvas` for raster QRs, print from a blob iframe).
- **Print**: browsers always show a dialog; check "Actual size / 100 %" on the real printer.
- **Khmer**: shaping verified by tests and visually, not yet by a Khmer reader with real names.
- **Excel numbers**: MIDs typed as numbers over 15 digits lose precision in Excel itself; the
  app flags this ("format the MID column as Text").
- Bundle-size warning on build (main chunk ~600 KB, worker ~770 KB); fine for an internal tool.
- Lint: 3 non-blocking warnings (React fast-refresh export, setState in effect, a regex rule).

## 8. Next steps (suggested order)

1. Deploy to Dokploy and run the checks in section 4.
2. Get a real Excel file, real QR SVGs, and the final background/logo; run them through the
   app; fix any column-guessing or matching issues (`core/excel/read.ts`).
3. Print one sheet on the roll-sticker printer at 100 %; measure; scan every QR with a
   Cambodian banking app. Have a Khmer reader check several names.
4. Decide the open product questions: raster logo/background allowed?; confirm the
   QR-too-small thresholds (`layout.json → scan`) with the print-and-scan test.
5. Test Firefox, Safari and Edge; add their projects to the Playwright e2e.
6. If batches > 1,000 are normal: streaming/flushing PDF writer.

## 9. Quality checks before any release

- `npm run lint && npm test && npm run build` (CI does this on every push).
- `npm run sample` then `pdffonts` and `pdfimages -list` → both list nothing (CI does this).
- `npm run qa:qr` → all `"ok": true` (CI does this).
- `npm run e2e` locally (needs Chromium): no console errors, all downloads produced. If
  Playwright's own browser is missing, point it at a local one:
  `CHROMIUM_PATH=/path/to/chrome npm run e2e`.
- Changing layout numbers: update `layout.json`, run `tests/sticker.test.ts`, and add a line to
  IMPLEMENTATION_NOTES.

## 10. Accounts and access

- GitHub: `tolakang/KHQR-print-template` (Claude GitHub App installed for pushes).
- Dokploy: not set up yet; no secrets are needed by the app.
- Fonts: SIL Open Font License; no other third-party assets besides the provided SVGs.
