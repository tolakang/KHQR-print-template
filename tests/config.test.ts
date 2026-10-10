import { describe, it, expect } from 'vitest'
import { layout, limits, fitScale, mmToPt, scaleToTarget } from '../src/config'

const PT = 72 / 25.4 // pt per mm
const CX = (105 * PT) / 2

describe('layout guide numbers (A6 design)', () => {
  it('artboard is A6 exactly: 105 × 148 mm = 297.6378 × 419.5276 pt', () => {
    expect(layout.artboard.w).toBeCloseTo(105 * PT, 3)
    expect(layout.artboard.h).toBeCloseTo(148 * PT, 3)
  })
  it('sizes and vertical distances are the guide-image values exactly, centred on the A6 width', () => {
    // Guide drawn at 317.5 pt wide (centre 158.75); x values are re-centred on A6.
    const X = (x: number) => x - 158.75 + CX
    expect(layout.qr.size).toBe(134)
    expect(layout.qr.x).toBeCloseTo(X(91.75), 3)
    expect(layout.qr.y).toBe(107.6) // guide: 107.6 from the top
    expect(layout.corner.size).toBe(154.3)
    expect(layout.corner.y).toBe(98) // guide: 98 from the top
    expect(layout.corner.x).toBeCloseTo(X(81.6), 3)
    expect([layout.corner.stroke, layout.corner.arm, layout.corner.radius]).toEqual([2.7, 37.02, 13.25])
    expect(layout.logo.size).toBe(32)
    expect(layout.name.sizePt).toBe(23)
    expect(layout.name.gapFromQr).toBe(38) // guide: 38 from the QR to the name
    expect(layout.mid.sizePt).toBe(10)
    expect(layout.mid.gapFromName).toBe(22) // guide: 22 baseline → MID
    expect(layout.artboard.w - 2 * layout.safeMarginPt).toBeCloseTo(277.5, 3)
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
    expect(cy(layout.corner) - cy(layout.qr)).toBeCloseTo(0.55, 2)
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
