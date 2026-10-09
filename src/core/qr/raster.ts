/**
 * Raster QR (PNG/JPG) → vector redraw.
 *
 * 1. Decode the image (jsQR) to get the payload, version and corner points.
 * 2. Sample every module centre on the grid and threshold it.
 * 3. Verify: decode a clean render of the sampled matrix; it must give the
 *    same payload ("traced").
 * 4. Otherwise rebuild the matrix from the payload with the same version and
 *    error-correction level ("rebuilt"), and verify that too.
 * 5. Otherwise refuse.
 * The final matrix is traced into one outline path (no seams between modules).
 */
import jsQR from 'jsqr'
import QRCode from 'qrcode'
import type { Path } from '../geom/path'
import type { Scene } from '../scene'

export interface RGBAImage { data: Uint8ClampedArray; width: number; height: number }

export type Matrix01 = boolean[][]

export type EcLevel = 'L' | 'M' | 'Q' | 'H'

export type RedrawResult =
  | {
      ok: true
      scene: Scene
      payload: string
      version: number
      ecLevel: EcLevel | null
      method: 'traced' | 'rebuilt'
      matrix: Matrix01
    }
  | { ok: false; reason: string }

const lum = (d: Uint8ClampedArray, i: number) => {
  // Composite over white so transparent PNGs read correctly.
  const a = d[i + 3] / 255
  const l = 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  return l * a + 255 * (1 - a)
}

/** Flatten transparency onto white (jsQR ignores alpha). */
function onWhite(img: RGBAImage): RGBAImage {
  const d = new Uint8ClampedArray(img.data.length)
  for (let i = 0; i < d.length; i += 4) {
    const a = img.data[i + 3] / 255
    d[i] = img.data[i] * a + 255 * (1 - a)
    d[i + 1] = img.data[i + 1] * a + 255 * (1 - a)
    d[i + 2] = img.data[i + 2] * a + 255 * (1 - a)
    d[i + 3] = 255
  }
  return { data: d, width: img.width, height: img.height }
}

export function decodeImage(img: RGBAImage) {
  return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })
}

/** Sample the module grid using the four corners jsQR reports. */
export function sampleGrid(img: RGBAImage, loc: NonNullable<ReturnType<typeof jsQR>>['location'], n: number): Matrix01 {
  const { topLeftCorner: tl, topRightCorner: tr, bottomLeftCorner: bl, bottomRightCorner: br } = loc
  const vals: number[][] = []
  const modulePx = Math.hypot(tr.x - tl.x, tr.y - tl.y) / n
  const r = Math.max(0, Math.floor(modulePx / 5))
  let min = 255
  let max = 0
  for (let i = 0; i < n; i++) {
    const row: number[] = []
    for (let j = 0; j < n; j++) {
      const u = (j + 0.5) / n
      const v = (i + 0.5) / n
      // Bilinear interpolation of the four corners (fine for flat digital files).
      const x = tl.x * (1 - u) * (1 - v) + tr.x * u * (1 - v) + bl.x * (1 - u) * v + br.x * u * v
      const y = tl.y * (1 - u) * (1 - v) + tr.y * u * (1 - v) + bl.y * (1 - u) * v + br.y * u * v
      let sum = 0
      let cnt = 0
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          const px = Math.min(img.width - 1, Math.max(0, Math.round(x + dx)))
          const py = Math.min(img.height - 1, Math.max(0, Math.round(y + dy)))
          sum += lum(img.data, (py * img.width + px) * 4)
          cnt++
        }
      }
      const l = sum / cnt
      row.push(l)
      if (l < min) min = l
      if (l > max) max = l
    }
    vals.push(row)
  }
  const t = (min + max) / 2
  return vals.map((row) => row.map((l) => l < t))
}

/** Clean bitmap of a matrix with a 4-module quiet zone, for verification. */
export function renderMatrix(m: Matrix01, px = 4): RGBAImage {
  const n = m.length
  const q = 4
  const size = (n + 2 * q) * px
  const data = new Uint8ClampedArray(size * size * 4).fill(255)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!m[i][j]) continue
      for (let y = 0; y < px; y++) {
        for (let x = 0; x < px; x++) {
          const o = (((i + q) * px + y) * size + (j + q) * px + x) * 4
          data[o] = data[o + 1] = data[o + 2] = 0
        }
      }
    }
  }
  return { data, width: size, height: size }
}

const FORMAT_MASK = 0x5412
const EC_BITS: Record<number, EcLevel> = { 1: 'L', 0: 'M', 3: 'Q', 2: 'H' }

function bchFormat(data5: number): number {
  let v = data5 << 10
  for (let i = 14; i >= 10; i--) if (v & (1 << i)) v ^= 0x537 << (i - 10)
  return ((data5 << 10) | v) ^ FORMAT_MASK
}
const VALID_FORMATS = Array.from({ length: 32 }, (_, d) => ({ d, code: bchFormat(d) }))

/** Read the error-correction level from the format information (nearest valid code). */
export function readEcLevel(m: Matrix01): EcLevel | null {
  const n = m.length
  const bit = (r: number, c: number) => (m[r][c] ? 1 : 0)
  // Copy 1 around the top-left finder.
  let a = 0
  const seq1: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8],
  ]
  for (const [r, c] of seq1) a = (a << 1) | bit(r, c)
  // Copy 2 split between bottom-left and top-right.
  let b = 0
  const seq2: [number, number][] = [
    ...Array.from({ length: 7 }, (_, k) => [n - 1 - k, 8] as [number, number]),
    ...Array.from({ length: 8 }, (_, k) => [8, n - 8 + k] as [number, number]),
  ]
  for (const [r, c] of seq2) b = (b << 1) | bit(r, c)
  let best = { d: -1, dist: 99 }
  for (const v of VALID_FORMATS) {
    for (const x of [a, b]) {
      let diff = v.code ^ x
      let dist = 0
      while (diff) {
        dist += diff & 1
        diff >>= 1
      }
      if (dist < best.dist) best = { d: v.d, dist }
    }
  }
  if (best.dist > 3) return null
  return EC_BITS[best.d >> 3] ?? null
}

/** Trace dark modules into closed outlines (module units, y down). */
export function traceMatrix(m: Matrix01): Path {
  const n = m.length
  const dark = (i: number, j: number) => i >= 0 && j >= 0 && i < n && j < n && m[i][j]
  // Directed boundary edges with dark on the right (clockwise around dark areas in y-down space).
  type E = { x1: number; y1: number; x2: number; y2: number; used: boolean }
  const out = new Map<string, E[]>()
  const addE = (x1: number, y1: number, x2: number, y2: number) => {
    const e = { x1, y1, x2, y2, used: false }
    const k = `${x1},${y1}`
    const list = out.get(k)
    if (list) list.push(e)
    else out.set(k, [e])
  }
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (!m[i][j]) continue
      if (!dark(i - 1, j)) addE(j, i, j + 1, i) // top edge, left→right
      if (!dark(i, j + 1)) addE(j + 1, i, j + 1, i + 1) // right edge, down
      if (!dark(i + 1, j)) addE(j + 1, i + 1, j, i + 1) // bottom edge, right→left
      if (!dark(i, j - 1)) addE(j, i + 1, j, i) // left edge, up
    }
  }
  const path: Path = []
  for (const list of out.values()) {
    for (const start of list) {
      if (start.used) continue
      const pts: [number, number][] = []
      let e: E | undefined = start
      while (e && !e.used) {
        e.used = true
        pts.push([e.x1, e.y1])
        const dx: number = e.x2 - e.x1
        const dy: number = e.y2 - e.y1
        const next: E[] = (out.get(`${e.x2},${e.y2}`) ?? []).filter((c) => !c.used)
        // At a diagonal touch point, turn right (keeps each dark region separate).
        e = next.find((c: E) => c.x2 - c.x1 === -dy && c.y2 - c.y1 === dx) ?? next.find((c) => c.x2 - c.x1 === dx && c.y2 - c.y1 === dy) ?? next[0]
      }
      // Drop collinear points.
      const simple = pts.filter((p, k) => {
        const a = pts[(k - 1 + pts.length) % pts.length]
        const b = pts[(k + 1) % pts.length]
        return (p[0] - a[0]) * (b[1] - p[1]) - (p[1] - a[1]) * (b[0] - p[0]) !== 0
      })
      if (simple.length < 3) continue
      path.push({ op: 'M', p: simple[0] })
      for (let k = 1; k < simple.length; k++) path.push({ op: 'L', p: simple[k] })
      path.push({ op: 'Z' })
    }
  }
  return path
}

export function matrixScene(m: Matrix01): Scene {
  return {
    width: m.length,
    height: m.length,
    items: [{ kind: 'fill', path: traceMatrix(m), rule: 'nonzero', color: [0, 0, 0], opacity: 1 }],
  }
}

function rebuild(payload: string, version: number, ec: EcLevel): Matrix01 | null {
  try {
    const q = QRCode.create(payload, { version, errorCorrectionLevel: ec })
    const n = q.modules.size
    const d = q.modules.data
    return Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => !!d[i * n + j]))
  } catch {
    return null
  }
}

export function redrawRasterQr(input: RGBAImage): RedrawResult {
  const img = onWhite(input)
  const code = decodeImage(img)
  if (!code) return { ok: false, reason: 'No readable QR code found in the image.' }
  const n = 17 + 4 * code.version
  const payload = code.data
  const traced = sampleGrid(img, code.location, n)
  const ec = readEcLevel(traced)
  const verify = (m: Matrix01) => decodeImage(renderMatrix(m))?.data === payload

  if (verify(traced)) {
    return { ok: true, scene: matrixScene(traced), payload, version: code.version, ecLevel: ec, method: 'traced', matrix: traced }
  }
  const levels: EcLevel[] = ec ? [ec] : ['M', 'Q', 'H', 'L']
  for (const level of levels) {
    const m = rebuild(payload, code.version, level)
    if (m && verify(m)) {
      return { ok: true, scene: matrixScene(m), payload, version: code.version, ecLevel: level, method: 'rebuilt', matrix: m }
    }
  }
  return { ok: false, reason: 'The QR could be read but not redrawn reliably. Upload an SVG or a sharper image.' }
}
