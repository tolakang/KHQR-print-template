import { describe, it, expect } from 'vitest'
import { layout, limits, fitScale, mmToPt, scaleToTarget } from '../src/config'

describe('layout guide numbers', () => {
  it('artboard is 317.5 x 427.5', () => {
    expect(layout.artboard).toEqual({ w: 317.5, h: 427.5 })
  })
  it('QR is centered at 91.7 from each side', () => {
    expect(layout.qr.x * 2 + layout.qr.size).toBeCloseTo(317.5, 6)
    expect(layout.qr.x + layout.qr.size / 2).toBeCloseTo(158.75, 0)
  })
  it('logo is centered on QR', () => {
    const qc = [layout.qr.x + 67, layout.qr.y + 67]
    const lc = [layout.logo.x + 16, layout.logo.y + 16]
    expect(lc[0]).toBeCloseTo(qc[0], 1)
    expect(lc[1]).toBeCloseTo(qc[1], 1)
  })
  it('corner, QR and logo are concentric', () => {
    const cy = (b: { y: number; size: number }) => b.y + b.size / 2
    expect(cy(layout.corner)).toBeCloseTo(cy(layout.qr), 1)
    expect(cy(layout.logo)).toBeCloseTo(cy(layout.qr), 1)
    expect(layout.corner.x + layout.corner.size / 2).toBeCloseTo(158.75, 1)
  })
  it('guide gaps hold: 38pt QR-to-cap and 127.6pt baseline-to-bottom', () => {
    const capH = 16.3 // Nunito Sans ExtraBold cap height at 23pt
    expect(layout.name.baselineY - capH - (layout.qr.y + layout.qr.size)).toBeCloseTo(38, 0)
    expect(layout.artboard.h - layout.name.baselineY).toBeCloseTo(127.6, 1)
  })
  it('limits', () => {
    expect(limits).toEqual({ nameChars: 25, nameLines: 2, mid: 15 })
  })
})

describe('scaling', () => {
  it('A6 trim equals exact 297.64 x 419.53', () => {
    expect(layout.pageSizesPt.A6).toEqual([297.64, 419.53])
  })
  it('A6 fit scale about 93.75%', () => {
    const [w, h] = layout.pageSizesPt.A6
    expect(fitScale(w, h)).toBeCloseTo(0.9375, 3)
  })
  it('3mm bleed = 8.50pt', () => {
    expect(mmToPt(3)).toBeCloseTo(8.504, 3)
  })
  it('A6 + 3mm bleed = 314.65 x 436.54', () => {
    const [w, h] = layout.pageSizesPt.A6
    expect(w + 2 * mmToPt(3)).toBeCloseTo(314.65, 1)
    expect(h + 2 * mmToPt(3)).toBeCloseTo(436.54, 1)
  })
  it('scaleToTarget handles larger and smaller', () => {
    expect(scaleToTarget(268, 268, 134)).toBe(0.5)
    expect(scaleToTarget(67, 67, 134)).toBe(2)
    expect(scaleToTarget(797, 797, 32)).toBeCloseTo(0.04015, 4)
  })
})
