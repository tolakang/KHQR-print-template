/**
 * Vector color sampling: finds the painted color at a point by testing the
 * scene's fills (with clips and opacity) — no rasterizing needed.
 * Used to pick the bleed/edge fill color for each side of the background.
 */
import type { Path } from '../geom/path'
import type { SceneItem, RGB, FillRule } from '../scene'

type Poly = number[] // flattened x,y pairs, implicitly closed per subpath
type Flat = { subs: Poly[]; x1: number; y1: number; x2: number; y2: number }

const cache = new WeakMap<Path, Flat>()

function flatten(path: Path): Flat {
  const hit = cache.get(path)
  if (hit) return hit
  const subs: Poly[] = []
  let cur: Poly = []
  let x = 0
  let y = 0
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity
  const pt = (px: number, py: number) => {
    cur.push(px, py)
    if (px < x1) x1 = px
    if (px > x2) x2 = px
    if (py < y1) y1 = py
    if (py > y2) y2 = py
  }
  for (const s of path) {
    if (s.op === 'M') {
      if (cur.length >= 6) subs.push(cur)
      cur = []
      x = s.p[0]; y = s.p[1]
      pt(x, y)
    } else if (s.op === 'L') {
      x = s.p[0]; y = s.p[1]
      pt(x, y)
    } else if (s.op === 'C') {
      const [ax, ay, bx, by, cx, cy] = s.p
      const N = 8
      for (let i = 1; i <= N; i++) {
        const t = i / N, u = 1 - t
        pt(
          u * u * u * x + 3 * u * u * t * ax + 3 * u * t * t * bx + t * t * t * cx,
          u * u * u * y + 3 * u * u * t * ay + 3 * u * t * t * by + t * t * t * cy,
        )
      }
      x = cx; y = cy
    } else if (s.op === 'Z') {
      if (cur.length >= 6) subs.push(cur)
      const sx = cur[0], sy = cur[1]
      cur = []
      if (sx !== undefined) { x = sx; y = sy; pt(x, y) }
    }
  }
  if (cur.length >= 6) subs.push(cur)
  const f = { subs, x1, y1, x2, y2 }
  cache.set(path, f)
  return f
}

export function pointInPath(path: Path, rule: FillRule, px: number, py: number): boolean {
  const f = flatten(path)
  if (px < f.x1 || px > f.x2 || py < f.y1 || py > f.y2) return false
  let wn = 0
  for (const p of f.subs) {
    const n = p.length / 2
    for (let i = 0; i < n; i++) {
      const ax = p[2 * i], ay = p[2 * i + 1]
      const j = (i + 1) % n
      const bx = p[2 * j], by = p[2 * j + 1]
      if (ay <= py) {
        if (by > py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) > 0) wn++
      } else if (by <= py && (bx - ax) * (py - ay) - (px - ax) * (by - ay) < 0) wn--
    }
  }
  return rule === 'evenodd' ? wn % 2 !== 0 : wn !== 0
}

/** Painted color at (x, y) composited over `base` (white by default). */
export function colorAt(items: SceneItem[], x: number, y: number, base: RGB = [1, 1, 1]): RGB {
  items = expandGroups(items)
  let c: RGB = [...base]
  const clips: boolean[] = [] // stack of "inside" for each active clip
  let insideAll = true
  for (const it of items) {
    if (it.kind === 'clipPush') {
      const inside: boolean = insideAll && pointInPath(it.path, it.rule, x, y)
      clips.push(insideAll)
      insideAll = inside
    } else if (it.kind === 'clipPop') {
      insideAll = clips.pop() ?? true
    } else if (it.kind === 'fill' && insideAll && pointInPath(it.path, it.rule, x, y)) {
      const a = it.opacity
      c = [0, 1, 2].map((k) => it.color[k] * a + c[k] * (1 - a)) as RGB
    }
  }
  return c
}

const key = (c: RGB) => c.map((v) => Math.round(v * 255)).join(',')

/** Most common color along a line of sample points (ties: first seen). */
export function dominantColor(items: SceneItem[], pts: [number, number][]): RGB {
  const counts = new Map<string, { c: RGB; n: number }>()
  for (const [x, y] of pts) {
    const c = colorAt(items, x, y)
    const k = key(c)
    const e = counts.get(k)
    if (e) e.n++
    else counts.set(k, { c, n: 1 })
  }
  let best: { c: RGB; n: number } = { c: [1, 1, 1], n: 0 }
  for (const e of counts.values()) if (e.n > best.n) best = e
  return best.c
}

export interface EdgeColors { top: RGB; right: RGB; bottom: RGB; left: RGB }

/** Sample each side of a rect, `inset` pt inside its edge. */
export function sampleEdges(
  items: SceneItem[],
  r: { x: number; y: number; w: number; h: number },
  inset = 0.75,
  samples = 15,
): EdgeColors {
  const along = (n: number) => Array.from({ length: n }, (_, i) => (i + 0.5) / n)
  const t = along(samples)
  return {
    top: dominantColor(items, t.map((k) => [r.x + k * r.w, r.y + inset])),
    bottom: dominantColor(items, t.map((k) => [r.x + k * r.w, r.y + r.h - inset])),
    left: dominantColor(items, t.map((k) => [r.x + inset, r.y + k * r.h])),
    right: dominantColor(items, t.map((k) => [r.x + r.w - inset, r.y + k * r.h])),
  }
}

function expandGroups(items: SceneItem[]): SceneItem[] {
  if (!items.some((i) => i.kind === 'group')) return items
  return items.flatMap((i) => (i.kind === 'group' ? expandGroups(i.items) : [i]))
}

export interface Band { from: number; to: number; color: RGB }

const close = (a: RGB, b: RGB, tol = 6 / 255) =>
  Math.abs(a[0] - b[0]) <= tol && Math.abs(a[1] - b[1]) <= tol && Math.abs(a[2] - b[2]) <= tol

/**
 * Color bands along one side of rect `r`, sampled `inset` pt inside the edge.
 * Neighbouring samples within a small tolerance merge into one band; band
 * boundaries are refined by bisection so stripes line up with the artwork.
 */
export function sampleEdgeBands(
  items: SceneItem[],
  r: { x: number; y: number; w: number; h: number },
  side: 'top' | 'right' | 'bottom' | 'left',
  step = 1,
  inset = 0.75,
): Band[] {
  items = expandGroups(items)
  const vertical = side === 'left' || side === 'right'
  const len = vertical ? r.h : r.w
  const start = vertical ? r.y : r.x
  const at = (t: number): RGB => {
    if (side === 'left') return colorAt(items, r.x + inset, t)
    if (side === 'right') return colorAt(items, r.x + r.w - inset, t)
    if (side === 'top') return colorAt(items, t, r.y + inset)
    return colorAt(items, t, r.y + r.h - inset)
  }
  const n = Math.max(2, Math.ceil(len / step))
  const ts = Array.from({ length: n }, (_, i) => start + ((i + 0.5) * len) / n)
  const cs = ts.map(at)
  const bands: Band[] = []
  let bandStart = start
  let ref = cs[0]
  const votes = new Map<string, { c: RGB; n: number }>()
  const vote = (c: RGB) => {
    const k = key(c)
    const e = votes.get(k)
    if (e) e.n++
    else votes.set(k, { c, n: 1 })
  }
  const winner = () => [...votes.values()].sort((a, b) => b.n - a.n)[0].c
  vote(cs[0])
  for (let i = 1; i < n; i++) {
    if (close(cs[i], ref)) {
      vote(cs[i])
      continue
    }
    // Refine the boundary between ts[i-1] and ts[i].
    let lo = ts[i - 1]
    let hi = ts[i]
    for (let k = 0; k < 8 && hi - lo > 0.02; k++) {
      const mid = (lo + hi) / 2
      if (close(at(mid), ref)) lo = mid
      else hi = mid
    }
    const cut = (lo + hi) / 2
    bands.push({ from: bandStart, to: cut, color: winner() })
    bandStart = cut
    ref = cs[i]
    votes.clear()
    vote(cs[i])
  }
  bands.push({ from: bandStart, to: start + len, color: winner() })
  return bands
}

export interface EdgeBands { top: Band[]; right: Band[]; bottom: Band[]; left: Band[] }

export function sampleAllEdgeBands(items: SceneItem[], r: { x: number; y: number; w: number; h: number }): EdgeBands {
  return {
    top: sampleEdgeBands(items, r, 'top'),
    right: sampleEdgeBands(items, r, 'right'),
    bottom: sampleEdgeBands(items, r, 'bottom'),
    left: sampleEdgeBands(items, r, 'left'),
  }
}
