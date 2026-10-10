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

// The guide image is drawn at 317.5 × 427.5 pt; the A6 design is that design × K,
// re-centred. Guide numbers below go through the same mapping.
const K = 1 // guide sizes are used exactly
const X = (x: number) => x - 158.75 + (105 * 72) / 25.4 / 2
const Y = (y: number) => y

/** Index of items by role: compose then slice by known order. */
function compose(name: string, mid = '124092620291906') {
  return composeSticker({ name, mid, qr, logo, corner }, sf, defaultStickerOptions())
}

describe('sticker matches the guide image (KH guide, 317.5 × 427.5 pt terms)', () => {
  it('QR dark modules are 134 × 134 at (91.75, 107.6)', () => {
    const r = compose('The Pizza Company Sihanou')
    const b = inkBBox(r.items.filter((_, k) => r.roles[k] === 'qr'), true)!
    expect(b.x1).toBeCloseTo(X(91.75), 1)
    expect(b.y1).toBeCloseTo(Y(107.6), 1)
    expect(b.x2 - b.x1).toBeCloseTo(134 * K, 1)
    expect(b.y2 - b.y1).toBeCloseTo(134 * K, 1)
  })
  it('frame is 154.3 square, 81.6 from the sides and 98 from the top', () => {
    const b = inkBBox([compose('X').items[0]])!
    expect(b.x1).toBeCloseTo(X(81.6), 1)
    expect(b.y1).toBeCloseTo(Y(98), 1)
    expect(b.x2 - b.x1).toBeCloseTo(154.3 * K, 1)
  })
  it('logo is 32 × 32 centred on the QR', () => {
    const r = compose('X')
    const ring = r.items.find((i) => i.kind === 'fill' && i.color[0] > 0.99 && Math.abs((inkBBox([i])!.x2 - inkBBox([i])!.x1) - 32 * K) < 0.5)
    expect(ring).toBeTruthy()
    const b = inkBBox([ring!])!
    expect(b.x1).toBeCloseTo(X(142.75), 1)
    expect(b.y1).toBeCloseTo(Y(107.6 + 67 - 16), 1)
  })
  it('name cap top is 38 below the QR; MID cap top 22 below the name baseline; both centred', () => {
    // "HELLO" has a flat baseline and cap-height letters; MID digits are cap height.
    const r = compose('HELLO')
    const name = inkBBox(r.items.filter((_, k) => r.roles[k] === 'name'))!
    const mid = inkBBox(r.items.filter((_, k) => r.roles[k] === 'mid'))!
    expect(name.y1 - (107.6 + 134)).toBeCloseTo(38, 0)
    expect(mid.y1 - name.y2).toBeCloseTo(22 * K, 0)
    expect((name.x1 + name.x2) / 2).toBeCloseTo(X(158.75), 0)
    expect((mid.x1 + mid.x2) / 2).toBeCloseTo(X(158.75), 0)
  })
  it('a Khmer name sits on the same baseline', () => {
    const r = compose('អានីតា មួបខ្មែរ', '125090512311628')
    const name = inkBBox(r.items.filter((_, k) => r.roles[k] === 'name'))!
    const latinBaseline = inkBBox(compose('HELLO').items.filter((_, k, a) => a && compose('HELLO').roles[k] === 'name'))!.y2
    expect(name.y1).toBeLessThan(latinBaseline) // letters above the baseline …
    expect(name.y2).toBeGreaterThan(latinBaseline) // … subscripts below it
  })
  it('MID moves up under a one-line name', () => {
    const one = inkBBox([compose('Lucky').items.at(-1)!])!
    const two = inkBBox([compose('The Pizza Company Sihanou').items.at(-1)!])!
    expect(two.y1 - one.y1).toBeGreaterThan(25)
  })
})

describe('position offsets', () => {
  const box = (r: ReturnType<typeof compose>, role: string, dark = false) => inkBBox(r.items.filter((_, k) => r.roles[k] === role), dark)!
  const shifted = (offsets: Parameters<typeof composeSticker>[2]['offsets']) =>
    composeSticker({ name: 'HELLO', mid: '124092620291906', qr, logo, corner }, sf, { ...defaultStickerOptions(), offsets })
  const zero = { x: 0, y: 0 }
  it('moves each element by its own offset only', () => {
    const base = compose('HELLO')
    const r = shifted({ corner: { x: 5, y: -3 }, qr: { x: -7, y: 4 }, name: { x: 2, y: 6 }, mid: { x: -4, y: 1.5 } })
    for (const [role, d, dark] of [['corner', { x: 5, y: -3 }, false], ['qr', { x: -7, y: 4 }, true], ['logo', { x: -7, y: 4 }, false], ['name', { x: 2, y: 6 }, false]] as const) {
      expect(box(r, role, dark).x1 - box(base, role, dark).x1).toBeCloseTo(d.x, 3)
      expect(box(r, role, dark).y1 - box(base, role, dark).y1).toBeCloseTo(d.y, 3)
    }
    // MID follows the name (default "follow"), plus its own offset.
    expect(box(r, 'mid').x1 - box(base, 'mid').x1).toBeCloseTo(-4, 3)
    expect(box(r, 'mid').y1 - box(base, 'mid').y1).toBeCloseTo(6 + 1.5, 3)
    expect(r.warnings.find((w) => w.code === 'off-page')).toBeUndefined()
  })
  it('warns when an element is moved past the sticker edge', () => {
    const r = shifted({ corner: zero, qr: { x: 200, y: 0 }, name: zero, mid: zero })
    expect(r.warnings.find((w) => w.code === 'off-page')?.message).toContain('QR')
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
  it('A6 is the design size (scale 1); other A sizes scale uniformly', () => {
    expect(pageGeometry({ ...defaultExportOptions(), pageSize: 'A6' }).stickerScale).toBeCloseTo(1, 4)
    expect(pageGeometry({ ...defaultExportOptions(), pageSize: 'A5' }).stickerScale).toBeCloseTo(148 / 105, 4) // A5 width ÷ A6 width
  })
  it('the A-proportioned background fills A6 exactly: no edge bands', () => {
    const page = buildPage([], prepareBackground(bg), { ...defaultExportOptions(), pageSize: 'A6' })
    const fills = page.items.filter((i) => i.kind === 'fill')
    expect(fills).toEqual([])
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
