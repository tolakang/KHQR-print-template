import { describe, it, expect } from 'vitest'
import { qrPrintSize } from '../src/core/qr/printSize'
import { pageGeometry, defaultExportOptions, type PageSizeName } from '../src/core/layout/page'

const scaleOf = (pageSize: PageSizeName, customMm?: { w: number; h: number }) =>
  pageGeometry({ ...defaultExportOptions(), pageSize, customMm }).stickerScale

describe('printed QR size', () => {
  it('is 131.5 pt (46.4 mm) at A6, the design size', () => {
    const r = qrPrintSize(scaleOf('A6'))
    expect(r.qrMm).toBeCloseTo(46.39, 1)
    expect(r.tooSmall).toBe(false)
  })
  it('accepts A7 for a typical KHQR (version 8, 49 modules)', () => {
    const r = qrPrintSize(scaleOf('A7'), 49)
    expect(r.qrMm).toBeGreaterThan(30)
    expect(r.moduleMm).toBeGreaterThan(0.6)
    expect(r.tooSmall).toBe(false)
  })
  it('warns when the code prints under 20 mm', () => {
    const r = qrPrintSize(scaleOf('custom', { w: 40, h: 55 }))
    expect(r.tooSmall).toBe(true)
    expect(r.message).toMatch(/may not scan/)
  })
  it('warns when modules print under 0.4 mm', () => {
    const scale = scaleOf('custom', { w: 50, h: 68 })
    expect(qrPrintSize(scale).tooSmall).toBe(false)
    const r = qrPrintSize(scale, 77)
    expect(r.tooSmall).toBe(true)
    expect(r.message).toMatch(/77 × 77/)
  })
})
