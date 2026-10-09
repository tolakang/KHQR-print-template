# KHQR Roll Sticker Generator

Browser-only tool that merges KHQR codes with Excel data into **vector-only PDF** roll
stickers (Roll Sticker KHQR Single, 317.5 × 427.5 pt). Text is shaped with HarfBuzz
(English + Khmer) and outlined; PDFs contain no fonts and no images. Nothing is uploaded
to a server.

## Features
- Upload background, Bakong logo and corner frame (SVG); defaults included.
- Excel/CSV import with column mapping (merchant name, MID, QR file name).
- QR files as SVG, or PNG/JPG redrawn as verified vector.
- Name wrap by whole word: 25 chars and the safe width, max 2 lines; MID max 15 (configurable).
- Page sizes Original, A3–A7, custom; bleed (default 3 mm, per side), banded edge fill, crop marks.
- Download one PDF, a ZIP of single PDFs named by MID, or split PDFs; print via the browser dialog.

## Develop
```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run build      # production build to dist/
npm run sample     # sample PDFs into out/ (needs nothing but Node)
npm run qa:qr      # QR round trip (needs poppler-utils)
npm run e2e        # browser end-to-end (Playwright Chromium)
```

## Deploy (Dokploy)
Create an Application from this repo, build type **Dockerfile**, container port **80**.
Health check: `GET /healthz` → `ok`. No database, volumes or secrets.

## Docs
- **[Project handoff](docs/HANDOFF.md)** (start here)
- [Development & verification plan](docs/DEVELOPMENT_PLAN.md) · [PDF](<docs/KHQR Roll Sticker PDF Generator - Development & Verification Plan.pdf>)
- [Implementation notes, decisions and verification results](docs/IMPLEMENTATION_NOTES.md)
- Guide: [docs/reference/guide-roll-sticker-khqr-single.png](docs/reference/guide-roll-sticker-khqr-single.png)

## Layout
- `src/config/layout.json` – guide measurements (pt), `limits.json` – character limits
- `src/core/` – text shaping/wrapping, SVG → scene, layout, PDF writer, raster QR, Excel
- `src/engine/` + `src/workers/` – engine running in a Web Worker
- `src/ui/`, `src/store/` – React dashboard
- `public/assets` – default background (a5.svg), Bakong logos (bkb/bkc), corner frame
- `public/fonts` – Nunito Sans ExtraBold/Regular, Nokora SemiBold (SIL OFL)
