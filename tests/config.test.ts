import { describe, it, expect } from 'vitest'
import { layout, limits, fitScale, mmToPt, scaleToTarget } from '../src/config'

const PT = 72 / 25.4 // pt per mm
const K = (148 * PT) / 427.5 // original 317.5 × 427.5 design → A6
const CX = (105 * PT) / 2

describe('layout guide numbers (A6 design)', () => {
  it('artboard is A6 exactly: 105 × 148 mm = 297.6378 × 419.5276 pt', () => {
    expect(layout.artboard.w).toBeCloseTo(105 * PT, 3)
    expect(layout.artboard.h).toBeCloseTo(148 * PT, 3)
    expect(layout.designScale?.factor).toBeCloseTo(K, 5)
  })
  it('every element is the guide-image value × 0.981351, re-centred', () => {
    const X = (x: number) => (x - 158.75) * K + CX
    expect(layout.qr.size).toBeCloseTo(134 * K, 2)
    expect(layout.qr.x).toBeCloseTo(X(91.75), 2)
    expect(layout.qr.y).toBeCloseTo(107.6 * K, 2) // guide: 107.6 from the top
    expect(layout.corner.y).toBeCloseTo(98 * K, 2) // guide: 98 from the top
    expect(layout.corner.x).toBeCloseTo(X(81.6), 2) // guide: 81.6 from the sides
    expect(layout.artboard.h - layout.name.baselineY).toBeCloseTo(130 * K, 2) // guide: 130 to the bottom
    expect(layout.mid.gapFromName).toBeCloseTo(22 * K, 2) // guide: 22 baseline → MID
    expect(layout.corner.size).toBeCloseTo(154.3 * K, 2)
    expect(layout.logo.size).toBeCloseTo(32 * K, 2)
    expect(layout.name.sizePt).toBeCloseTo(23 * K, 2)
    expect(layout.mid.sizePt).toBeCloseTo(10 * K, 2)
    expect(layout.artboard.w - 2 * layout.safeMarginPt).toBeCloseTo(277.5 * K, 2)
  })
  it('QR is centred', () => {
    expect(layout.qr.x * 2 + layout.qr.size).toBeCloseTo(layout.artboard.w, 2)
  })
  it('logo is centered on QR', () => {
    const h = layout.qr.size / 2
    expect(layout.logo.x + layout.logo.size / 2).toBeCloseTo(layout.qr.x + h, 1)
    expect(layout.logo.y + layout.logo.size / 2).toBeCloseTo(layout.qr.y + h, 1)
  })
  it('logo is concentric with the QR; the frame is 0.55 pt lower (guide 98 vs concentric 97.45)', () => {
    const cy = (b: { y: number; size: number }) => b.y + b.size / 2
    expect(cy(layout.logo)).toBeCloseTo(cy(layout.qr), 1)
    expect(cy(layout.corner) - cy(layout.qr)).toBeCloseTo(0.55 * K, 2)
    expect(layout.corner.x + layout.corner.size / 2).toBeCloseTo(CX, 1)
  })
  it('limits', () => {
    expect(limits).toEqual({ nameChars: 25, nameLines: 2, mid: 15 })
  })
})

describe('page sizes (mm × 72 / 25.4)', () => {
  it.each([
    ['A3', 297, 420], ['A4', 210, 297], ['A5', 148, 210], ['A6', 105, 148], ['A7', 74, 105],
  ] as const)('%s = %d × %d mm', (name, w, h) => {
    const [pw, ph] = layout.pageSizesPt[name]
    expect(pw).toBeCloseTo(w * PT, 3)
    expect(ph).toBeCloseTo(h * PT, 3)
  })
  it('A6 is the design size: scale 1', () => {
    const [w, h] = layout.pageSizesPt.A6
    expect(fitScale(w, h)).toBeCloseTo(1, 4)
  })
  it('3mm bleed = 8.504 pt; A6 + 3 mm bleed = 314.65 × 436.54', () => {
    expect(mmToPt(3)).toBeCloseTo(8.504, 3)
    const [w, h] = layout.pageSizesPt.A6
    expect(w + 2 * mmToPt(3)).toBeCloseTo(314.646, 2)
    expect(h + 2 * mmToPt(3)).toBeCloseTo(436.535, 2)
  })
  it('scaleToTarget handles larger and smaller', () => {
    expect(scaleToTarget(268, 268, 134)).toBe(0.5)
    expect(scaleToTarget(67, 67, 134)).toBe(2)
    expect(scaleToTarget(797, 797, 32)).toBeCloseTo(0.04015, 4)
  })
})
