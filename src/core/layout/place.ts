import { multiply, scale, translate, type Matrix } from '../geom/matrix'
import { pathBBox, type BBox, type Path } from '../geom/path'
import type { Scene, SceneItem, RGB } from '../scene'
import { transformItems } from '../svg/toScene'

export interface Rect { x: number; y: number; w: number; h: number }

/** Matrix that maps `src` into `dst` with one uniform scale, centered (contain). */
export function fitMatrix(src: Rect, dst: Rect): { m: Matrix; s: number } {
  const s = Math.min(dst.w / src.w, dst.h / src.h)
  const ox = dst.x + (dst.w - src.w * s) / 2
  const oy = dst.y + (dst.h - src.h * s) / 2
  return { m: multiply(translate(ox, oy), multiply(scale(s), translate(-src.x, -src.y))), s }
}

const isNearWhite = (c: RGB) => c[0] > 0.94 && c[1] > 0.94 && c[2] > 0.94

/**
 * Bounding box of painted ink. With `darkOnly`, white/near-white fills
 * (QR quiet zone, background squares) are ignored.
 */
export function inkBBox(items: SceneItem[], darkOnly = false): BBox | null {
  let box: BBox | null = null
  const add = (b: BBox | null) => {
    if (!b) return
    box = box
      ? { x1: Math.min(box.x1, b.x1), y1: Math.min(box.y1, b.y1), x2: Math.max(box.x2, b.x2), y2: Math.max(box.y2, b.y2) }
      : { ...b }
  }
  for (const it of items) {
    if (it.kind === 'fill') {
      if (darkOnly && isNearWhite(it.color)) continue
      add(pathBBox(it.path))
    } else if (it.kind === 'stroke') {
      if (darkOnly && isNearWhite(it.color)) continue
      add(strokeBBox(it))
    }
  }
  return box
}

export const bboxToRect = (b: BBox): Rect => ({ x: b.x1, y: b.y1, w: b.x2 - b.x1, h: b.y2 - b.y1 })

export interface Placed { items: SceneItem[]; scale: number; aspect: number }

/**
 * Place a scene so that its reference rect (ink box or viewBox) fits `dst`,
 * uniformly scaled and centered.
 */
export function placeScene(scene: Scene, ref: Rect, dst: Rect): Placed {
  const { m, s } = fitMatrix(ref, dst)
  return { items: transformItems(scene.items, m), scale: s, aspect: ref.w / ref.h }
}

export function rectPathOf(r: Rect): Path {
  return [
    { op: 'M', p: [r.x, r.y] },
    { op: 'L', p: [r.x + r.w, r.y] },
    { op: 'L', p: [r.x + r.w, r.y + r.h] },
    { op: 'L', p: [r.x, r.y + r.h] },
    { op: 'Z' },
  ]
}

export function fillRect(r: Rect, color: RGB): SceneItem {
  return { kind: 'fill', path: rectPathOf(r), rule: 'nonzero', color, opacity: 1 }
}

/**
 * Stroke bounds in scene space. Straight segments are offset perpendicular to
 * their direction (exact for butt caps); curves and non-butt caps pad all round.
 */
function strokeBBox(it: Extract<SceneItem, { kind: 'stroke' }>): BBox | null {
  const m = it.ctm
  const T = (x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]]
  const hw = it.width / 2
  let box: BBox | null = null
  const addPt = (x: number, y: number) => {
    const [px, py] = T(x, y)
    box = box
      ? { x1: Math.min(box.x1, px), y1: Math.min(box.y1, py), x2: Math.max(box.x2, px), y2: Math.max(box.y2, py) }
      : { x1: px, y1: py, x2: px, y2: py }
  }
  const capPad = it.cap === 'butt' ? 0 : hw
  let cx = 0, cy = 0, sx = 0, sy = 0
  const seg = (x1: number, y1: number, x2: number, y2: number) => {
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const nx = (-(y2 - y1) / len) * hw, ny = ((x2 - x1) / len) * hw
    const tx = ((x2 - x1) / len) * capPad, ty = ((y2 - y1) / len) * capPad
    addPt(x1 + nx - tx, y1 + ny - ty); addPt(x1 - nx - tx, y1 - ny - ty)
    addPt(x2 + nx + tx, y2 + ny + ty); addPt(x2 - nx + tx, y2 - ny + ty)
  }
  for (const s of it.path) {
    if (s.op === 'M') { cx = sx = s.p[0]; cy = sy = s.p[1] }
    else if (s.op === 'L') { seg(cx, cy, s.p[0], s.p[1]); cx = s.p[0]; cy = s.p[1] }
    else if (s.op === 'C') {
      for (let i = 0; i < 6; i += 2) {
        addPt(s.p[i] - hw, s.p[i + 1] - hw); addPt(s.p[i] + hw, s.p[i + 1] + hw)
      }
      addPt(cx - hw, cy - hw); addPt(cx + hw, cy + hw)
      cx = s.p[4]; cy = s.p[5]
    } else if (s.op === 'Z') { if (cx !== sx || cy !== sy) seg(cx, cy, sx, sy); cx = sx; cy = sy }
  }
  return box
}
