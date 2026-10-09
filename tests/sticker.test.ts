import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import QRCode from 'qrcode'
import { parseSvg, svgToScene } from '../src/core/svg/toScene'
import { loadBundle, bundleOutliner, type FontBundle } from '../src/core/text/fonts'
import { composeSticker, defaultStickerOptions, type StickerFonts } from '../src/core/layout/sticker'
import { inkBBox } from '../src/core/layout/place'
import { buildPage, prepareBackground, defaultExportOptions, pageGeometry } from '../src/core/layout/page'
import { writePdf } from '../src/core/pdf/writer'
import type { Scene } from '../src/core/scene'

let fonts: FontBundle, sf: StickerFonts, logo: Scene, corner: Scene, bg: Scene, qr: Scene
const load = (p: string) => svgToScene(parseSvg(readFileSync(p, 'utf8')), { outlineText: bundleOutliner(fonts) }).scene

beforeAll(async () => {
  fonts = loadBundle({
    extraBold: readFileSync('public/fonts/NunitoSans-ExtraBold.ttf'),
    regular: readFileSync('public/fonts/NunitoSans-Regular.ttf'),
    khmer: readFileSync('public/fonts/Nokora-SemiBold.ttf'),
  })
  sf = { nameLatin: fonts.extraBold, nameKhmer: fonts.khmer, midLatin: fonts.regular }
  logo = load('public/artwork/bkb.svg')
  corner = load('public/artwork/corner.svg')
  bg = load('public/artwork/a5.svg')
  qr = svgToScene(parseSvg(await QRCode.toString('TEST', { type: 'svg', margin: 4 }))).scene
})

/** Index of items by role: compose then slice by known order. */
function compose(name: string, mid = '124092620291906') {
  return composeSticker({ name, mid, qr, logo, corner }, sf, defaultStickerOptions())
}

describe('sticker matches the vector template (qr-en-template.svg)', () => {
  // Reference values measured from the template in pt (see layout.json notes).
  it('QR dark modules are exactly 134 × 134 at (91.75, 111.6)', () => {
    const r = compose('The Pizza Company Sihanou')
    const qrItems = r.items.filter((_, k) => r.roles[k] === 'qr')
    const b = inkBBox(qrItems, true)!
    expect(b.x1).toBeCloseTo(91.75, 1)
    expect(b.y1).toBeCloseTo(111.6, 1)
    expect(b.x2 - b.x1).toBeCloseTo(134, 1)
    expect(b.y2 - b.y1).toBeCloseTo(134, 1)
  })
  it('text rows land within 1pt of the template', () => {
    const r = compose('The Pizza Company Sihanou')
    const text = r.items.filter((_, k) => r.roles[k] === 'name' || r.roles[k] === 'mid')
    const [l1, l2, mid] = text.map((i) => inkBBox([i])!)
    // Template: name ink top 282.65, name ink bottom (line 2) 327.84, MID 344.33–351.49
    expect(Math.abs(l1.y1 - 282.65)).toBeLessThan(1)
    expect(Math.abs(l2.y2 - 327.84)).toBeLessThan(1)
    expect(Math.abs(mid.y1 - 344.33)).toBeLessThan(1)
    expect(Math.abs(mid.y2 - 351.49)).toBeLessThan(1)
    // Centered horizontally.
    expect((l1.x1 + l1.x2) / 2).toBeCloseTo(158.75, 0)
    expect((mid.x1 + mid.x2) / 2).toBeCloseTo(158.75, 0)
  })
  it('logo is 32 × 32 centered on the QR', () => {
    const r = compose('X')
    // logo items are the 6 items after corner (1) + QR items; find white ring by size
    const ring = r.items.find((i) => i.kind === 'fill' && i.color[0] > 0.99 && Math.abs((inkBBox([i])!.x2 - inkBBox([i])!.x1) - 32) < 0.5)
    expect(ring).toBeTruthy()
    const b = inkBBox([ring!])!
    expect(b.x1).toBeCloseTo(142.75, 1)
    expect(b.y1).toBeCloseTo(162.6, 1)
  })
  it('corner frame is 154.3 square at x 81.6', () => {
    const r = compose('X')
    const b = inkBBox([r.items[0]])!
    expect(b.x1).toBeCloseTo(81.6, 1)
    expect(b.x2 - b.x1).toBeCloseTo(154.3, 1)
    expect(b.y2 - b.y1).toBeCloseTo(154.3, 1)
  })
  it('MID moves up under a one-line name', () => {
    const one = inkBBox([compose('Lucky').items.at(-1)!])!
    const two = inkBBox([compose('The Pizza Company Sihanou').items.at(-1)!])!
    expect(two.y1 - one.y1).toBeGreaterThan(25)
  })
})

describe('export geometry', () => {
  it('A6 no bleed = 297.64 × 419.53', () => {
    const g = pageGeometry({ ...defaultExportOptions(), pageSize: 'A6' })
    expect(g.media.w).toBeCloseTo(297.64, 2)
    expect(g.media.h).toBeCloseTo(419.53, 2)
  })
  it('A6 + 3mm bleed = 314.65 × 436.54 with exact trim', () => {
    const g = pageGeometry({ ...defaultExportOptions(), pageSize: 'A6', bleed: true, bleedMm: 3 })
    expect(g.media.w).toBeCloseTo(314.65, 1)
    expect(g.media.h).toBeCloseTo(436.54, 1)
    expect(g.trim.w).toBeCloseTo(297.64, 2)
    expect(g.trim.x).toBeCloseTo(8.504, 2)
    expect(g.bleed).toEqual({ x: 0, y: 0, w: g.media.w, h: g.media.h })
  })
  it('per-side bleed and 10mm clamp', () => {
    const g = pageGeometry({ ...defaultExportOptions(), bleed: true, bleedMm: { top: 0, right: 5, bottom: 20, left: 1 } })
    expect(g.trim.y).toBe(0)
    expect(g.media.h - g.trim.h).toBeCloseTo(28.35, 1) // 10mm max
  })
  it('scales uniformly (A6 ≈ 93.75%)', () => {
    expect(pageGeometry({ ...defaultExportOptions(), pageSize: 'A6' }).stickerScale).toBeCloseTo(0.9375, 3)
  })
})

describe('PDF output', () => {
  it('writes vector-only pages; background stored once', async () => {
    const prepared = prepareBackground(bg)
    const pages = ['A', 'B', 'C'].map((n) => buildPage(compose(n).items, prepared, defaultExportOptions()))
    const pdf = await writePdf(pages)
    const text = new TextDecoder('latin1').decode(pdf)
    expect(text).not.toMatch(/\/Font\b/)
    expect(text).not.toMatch(/\/Subtype\s*\/Image/)
    expect((text.match(/\/Subtype\s*\/Form/g) ?? []).length).toBe(1)
    expect(pdf.length).toBeLessThan(400_000)
  })
})
