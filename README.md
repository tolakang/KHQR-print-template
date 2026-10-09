# KHQR Roll Sticker Generator

Browser-only tool that merges KHQR codes with Excel data into vector PDF roll stickers
(317.5 × 427.5 pt artboard, outlined fonts, no raster).

## Develop
```bash
npm ci
npm run dev        # http://localhost:5173
npm test           # unit tests
npm run build      # production build to dist/
```

## Deploy (Dokploy)
Create an Application from this Git repo, build type **Dockerfile**, port **80**.
Health check: `GET /healthz` → `ok`.

## Layout
- `src/config/layout.json` – guide measurements (pt)
- `src/config/limits.json` – name/MID character limits
- `public/assets` – default background (a5.svg), Bakong logos (bkb/bkc), corner frame
- `public/fonts` – Nunito Sans ExtraBold/Regular, Nokora SemiBold (OFL)
