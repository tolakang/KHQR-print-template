import { describe, it, expect } from 'vitest'
import QRCode from 'qrcode'
import { redrawRasterQr, readEcLevel, traceMatrix, type RGBAImage, type Matrix01 } from '../src/core/qr/raster'
import { pointInPath } from '../src/core/layout/sample'

const PAYLOAD =
  '00020101021230510016abaakhppxxx@abaa01151240926202919060208ABA Bank5204599953031165802KH5925The Pizza Company Sihanou6010Phnom Penh99170013176000000000063041A2B'

function matrixOf(payload: string, ec: 'L' | 'M' | 'Q' | 'H' = 'M'): Matrix01 {
  const q = QRCode.create(payload, { errorCorrectionLevel: ec })
  const n = q.modules.size
  return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => !!q.modules.data[i * n + j]))
}

/** Render a matrix at a (possibly fractional) module size with area sampling (like a resized image). */
function rasterize(m: Matrix01, px: number, opts: { quiet?: number; transparent?: boolean; color?: [number, number, number] } = {}): RGBAImage {
  const q = opts.quiet ?? 4
  const n = m.length
  const size = Math.round((n + 2 * q) * px)
  const data = new Uint8ClampedArray(size * size * 4)
  const ss = 3
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let dark = 0
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const mx = Math.floor((x + (sx + 0.5) / ss) / px) - q
          const my = Math.floor((y + (sy + 0.5) / ss) / px) - q
          if (mx >= 0 && my >= 0 && mx < n && my < n && m[my][mx]) dark++
        }
      }
      const f = dark / (ss * ss)
      const o = (y * size + x) * 4
      const c = opts.color ?? [0, 0, 0]
      if (opts.transparent) {
        data[o] = c[0]; data[o + 1] = c[1]; data[o + 2] = c[2]
        data[o + 3] = Math.round(255 * f)
      } else {
        for (let k = 0; k < 3; k++) data[o + k] = Math.round(255 * (1 - f) + c[k] * f)
        data[o + 3] = 255
      }
    }
  }
  return { data, width: size, height: size }
}

describe('raster QR redraw', () => {
  it('traces a clean PNG exactly', () => {
    const m = matrixOf(PAYLOAD)
    const r = redrawRasterQr(rasterize(m, 10))
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload).toBe(PAYLOAD)
    expect(r.method).toBe('traced')
    expect(r.matrix).toEqual(m)
    expect(r.ecLevel).toBe('M')
  })
  it('handles a resized image (fractional module size)', () => {
    const r = redrawRasterQr(rasterize(matrixOf(PAYLOAD), 3.37))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload).toBe(PAYLOAD)
  })
  it('handles a transparent background and colored modules', () => {
    const r = redrawRasterQr(rasterize(matrixOf(PAYLOAD), 6, { transparent: true, color: [20, 30, 120] }))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.payload).toBe(PAYLOAD)
  })
  it('handles a tight crop with no quiet zone', () => {
    const r = redrawRasterQr(rasterize(matrixOf(PAYLOAD), 8, { quiet: 1 }))
    expect(r.ok).toBe(true)
  })
  it('warns below 4 px per module and refuses below 2', () => {
    const m = matrixOf(PAYLOAD)
    const clean = redrawRasterQr(rasterize(m, 10))
    expect(clean.ok && clean.lowResolution).toBe(false)
    const low = redrawRasterQr(rasterize(m, 3))
    expect(low.ok).toBe(true)
    if (low.ok) {
      expect(low.lowResolution).toBe(true)
      expect(low.modulePx).toBeCloseTo(3, 0)
    }
    const tiny = redrawRasterQr(rasterize(m, 1.5))
    expect(tiny.ok).toBe(false)
  })
  it('detects a logo baked into the image and rebuilds the code', () => {
    const m = matrixOf(PAYLOAD, 'H')
    const px = 8
    const img = rasterize(m, px)
    // White pad with a red square in the middle, ~22% of the code width.
    const c = img.width / 2
    const half = (m.length * px * 0.22) / 2
    for (let y = Math.round(c - half); y < c + half; y++) {
      for (let x = Math.round(c - half); x < c + half; x++) {
        const o = (y * img.width + x) * 4
        const inner = Math.abs(x - c) < half * 0.7 && Math.abs(y - c) < half * 0.7
        img.data[o] = inner ? 200 : 255
        img.data[o + 1] = img.data[o + 2] = inner ? 20 : 255
      }
    }
    const r = redrawRasterQr(img)
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.payload).toBe(PAYLOAD)
    expect(r.bakedLogo).toBe(true)
    expect(r.method).toBe('rebuilt')
    expect(redrawRasterQr(rasterize(m, px)).ok && redrawRasterQr(rasterize(m, px))).toMatchObject({ bakedLogo: false })
  })
  it('refuses an image without a QR code', () => {
    const size = 200
    const data = new Uint8ClampedArray(size * size * 4)
    for (let i = 0; i < data.length; i++) data[i] = (i * 7919) % 256
    expect(redrawRasterQr({ data, width: size, height: size }).ok).toBe(false)
  })
  it('reads every EC level from format info', () => {
    for (const ec of ['L', 'M', 'Q', 'H'] as const) expect(readEcLevel(matrixOf('HELLO', ec))).toBe(ec)
  })
  it('traced outline covers exactly the dark modules', () => {
    const m = matrixOf(PAYLOAD)
    const path = traceMatrix(m)
    for (let i = 0; i < m.length; i++) {
      for (let j = 0; j < m.length; j++) {
        expect(pointInPath(path, 'nonzero', j + 0.5, i + 0.5)).toBe(m[i][j])
      }
    }
  })
})
