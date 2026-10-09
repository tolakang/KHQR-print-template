/**
 * Corner frame drawn from numbers instead of the SVG, so its corner radius
 * and color can be changed. At the guide radius it matches corner.svg
 * (four L-shaped brackets, 2.7 pt thick, 37 pt arms, in a 154.3 pt square).
 */
import { layout as defaultLayout, type Layout } from '../../config'
import type { Path } from '../geom/path'
import type { RGB, Scene, SceneItem } from '../scene'

// A "smooth" corner like corner.svg's: the curve starts `radius` from the corner
// but hugs it more than a circular arc. Handles end T × radius from the corner (0.12 fits corner.svg best)
// (a circle would use 1 − 0.5523 = 0.448).
const T = 0.12

/** One bracket at the top-left, as a closed outline (outer edge, then inner edge). */
function bracket(size: number, stroke: number, arm: number, radius: number): number[][] {
  const w = stroke
  const a = Math.min(arm, size / 2)
  const R = Math.max(0, Math.min(radius, a))
  const r = Math.max(0, R - w)
  // Points with optional cubic control points: [x, y] or [c1x, c1y, c2x, c2y, x, y].
  return [
    [0, a], [0, R],
    ...(R > 0 ? [[0, T * R, T * R, 0, R, 0]] : []),
    [a, 0], [a, w], [w + r, w],
    ...(r > 0 ? [[w + T * r, w, w, w + T * r, w, w + r]] : []),
    [w, a],
  ]
}

export interface CornerStyle {
  /** Outer corner radius in pt (0 = square corners). */
  radius: number
  color: RGB
}

/** The frame as a Scene of `size` × `size` pt (place it on the corner square). */
export function cornerFrameScene(style: CornerStyle, L: Layout = defaultLayout): Scene {
  const S = L.corner.size
  const pts = bracket(S, L.corner.stroke, L.corner.arm, style.radius)
  const path: Path = []
  for (const [fx, fy] of [[false, false], [true, false], [false, true], [true, true]]) {
    const X = (x: number) => (fx ? S - x : x)
    const Y = (y: number) => (fy ? S - y : y)
    pts.forEach((p, i) => {
      if (p.length === 6) path.push({ op: 'C', p: [X(p[0]), Y(p[1]), X(p[2]), Y(p[3]), X(p[4]), Y(p[5])] })
      else path.push({ op: i === 0 ? 'M' : 'L', p: [X(p[0]), Y(p[1])] })
    })
    path.push({ op: 'Z' })
  }
  const item: SceneItem = { kind: 'fill', path, rule: 'nonzero', color: style.color, opacity: 1 }
  return { width: S, height: S, items: [item] }
}

/** Repaint every fill and stroke of a scene in one color (for uploaded frames). */
export function recolorScene(scene: Scene, color: RGB): Scene {
  const paint = (items: SceneItem[]): SceneItem[] =>
    items.map((it) =>
      it.kind === 'fill' || it.kind === 'stroke' ? { ...it, color } : it.kind === 'group' ? { ...it, items: paint(it.items) } : it,
    )
  return { ...scene, items: paint(scene.items) }
}
