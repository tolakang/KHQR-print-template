import { SVGPathData } from 'svg-pathdata'
import { apply, type Matrix } from './matrix'

/** Absolute path segment. M/L carry 2 numbers, C carries 6, Z none. */
export type Seg =
  | { op: 'M'; p: [number, number] }
  | { op: 'L'; p: [number, number] }
  | { op: 'C'; p: [number, number, number, number, number, number] }
  | { op: 'Z' }

export type Path = Seg[]

/** Parse SVG path data into absolute M/L/C/Z segments (arcs and quads become cubics). */
export function parsePathData(d: string): Path {
  if (!d || !d.trim()) return []
  let data: SVGPathData
  try {
    data = new SVGPathData(d).toAbs().normalizeHVZ(false).normalizeST().qtToC().aToC()
  } catch {
    return []
  }
  const out: Path = []
  for (const c of data.commands) {
    switch (c.type) {
      case SVGPathData.MOVE_TO:
        out.push({ op: 'M', p: [c.x, c.y] })
        break
      case SVGPathData.LINE_TO:
        out.push({ op: 'L', p: [c.x, c.y] })
        break
      case SVGPathData.CURVE_TO:
        out.push({ op: 'C', p: [c.x1, c.y1, c.x2, c.y2, c.x, c.y] })
        break
      case SVGPathData.CLOSE_PATH:
        out.push({ op: 'Z' })
        break
      default:
        // H/V/S/Q/T/A were normalized away above.
        break
    }
  }
  return out
}

export function rectPath(x: number, y: number, w: number, h: number, rx = 0, ry = rx): Path {
  if (w <= 0 || h <= 0) return []
  rx = Math.min(Math.max(rx, 0), w / 2)
  ry = Math.min(Math.max(ry, 0), h / 2)
  if (!rx || !ry) {
    return [
      { op: 'M', p: [x, y] },
      { op: 'L', p: [x + w, y] },
      { op: 'L', p: [x + w, y + h] },
      { op: 'L', p: [x, y + h] },
      { op: 'Z' },
    ]
  }
  const k = 0.5522847498
  const kx = rx * k
  const ky = ry * k
  return [
    { op: 'M', p: [x + rx, y] },
    { op: 'L', p: [x + w - rx, y] },
    { op: 'C', p: [x + w - rx + kx, y, x + w, y + ry - ky, x + w, y + ry] },
    { op: 'L', p: [x + w, y + h - ry] },
    { op: 'C', p: [x + w, y + h - ry + ky, x + w - rx + kx, y + h, x + w - rx, y + h] },
    { op: 'L', p: [x + rx, y + h] },
    { op: 'C', p: [x + rx - kx, y + h, x, y + h - ry + ky, x, y + h - ry] },
    { op: 'L', p: [x, y + ry] },
    { op: 'C', p: [x, y + ry - ky, x + rx - kx, y, x + rx, y] },
    { op: 'Z' },
  ]
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): Path {
  if (rx <= 0 || ry <= 0) return []
  const k = 0.5522847498
  const ox = rx * k
  const oy = ry * k
  return [
    { op: 'M', p: [cx + rx, cy] },
    { op: 'C', p: [cx + rx, cy + oy, cx + ox, cy + ry, cx, cy + ry] },
    { op: 'C', p: [cx - ox, cy + ry, cx - rx, cy + oy, cx - rx, cy] },
    { op: 'C', p: [cx - rx, cy - oy, cx - ox, cy - ry, cx, cy - ry] },
    { op: 'C', p: [cx + ox, cy - ry, cx + rx, cy - oy, cx + rx, cy] },
    { op: 'Z' },
  ]
}

export function polyPath(points: string, close: boolean): Path {
  const n = points.trim().split(/[\s,]+/).filter(Boolean).map(Number)
  const out: Path = []
  for (let i = 0; i + 1 < n.length; i += 2) out.push({ op: i ? 'L' : 'M', p: [n[i], n[i + 1]] })
  if (close && out.length) out.push({ op: 'Z' })
  return out
}

export function transformPath(path: Path, m: Matrix): Path {
  return path.map((s): Seg => {
    switch (s.op) {
      case 'M':
      case 'L':
        return { op: s.op, p: apply(m, s.p[0], s.p[1]) }
      case 'C': {
        const [a, b] = apply(m, s.p[0], s.p[1])
        const [c, d] = apply(m, s.p[2], s.p[3])
        const [e, f] = apply(m, s.p[4], s.p[5])
        return { op: 'C', p: [a, b, c, d, e, f] }
      }
      default:
        return s
    }
  })
}

export interface BBox {
  x1: number
  y1: number
  x2: number
  y2: number
}

/** Control-point bounding box (a safe superset of the true bounds). */
export function pathBBox(path: Path): BBox | null {
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity
  for (const s of path) {
    if (s.op === 'Z') continue
    for (let i = 0; i < s.p.length; i += 2) {
      const x = s.p[i]
      const y = s.p[i + 1]
      if (x < x1) x1 = x
      if (x > x2) x2 = x
      if (y < y1) y1 = y
      if (y > y2) y2 = y
    }
  }
  return isFinite(x1) ? { x1, y1, x2, y2 } : null
}

const f = (n: number) => {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

export function pathToSvgD(path: Path): string {
  return path
    .map((s) => (s.op === 'Z' ? 'Z' : s.op + s.p.map(f).join(' ')))
    .join('')
}

/** PDF path construction operators (m/l/c/h). */
export function pathToPdfOps(path: Path): string {
  const out: string[] = []
  for (const s of path) {
    switch (s.op) {
      case 'M':
        out.push(`${f(s.p[0])} ${f(s.p[1])} m`)
        break
      case 'L':
        out.push(`${f(s.p[0])} ${f(s.p[1])} l`)
        break
      case 'C':
        out.push(`${s.p.map(f).join(' ')} c`)
        break
      case 'Z':
        out.push('h')
        break
    }
  }
  return out.join('\n')
}
