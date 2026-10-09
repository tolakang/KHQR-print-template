/**
 * Page assembly: page size, uniform sticker scaling, background fit,
 * bleed with edge-color fill, TrimBox/BleedBox and optional crop marks.
 */
import { layout as defaultLayout, mmToPt, type Layout } from '../../config'
import { multiply, scale as scaleM, translate } from '../geom/matrix'
import type { Scene, SceneItem, RGB } from '../scene'
import type { PageSpec } from '../pdf/writer'
import { transformItems } from '../svg/toScene'
import { fitMatrix, fillRect, rectPathOf, type Rect } from './place'
import { sampleAllEdgeBands, type EdgeBands, type Band } from './sample'

export type PageSizeName = 'original' | 'A3' | 'A4' | 'A5' | 'A6' | 'A7' | 'custom'

export interface Sides { top: number; right: number; bottom: number; left: number }

export interface ExportOptions {
  pageSize: PageSizeName
  /** Custom trim size in mm (pageSize = 'custom'). */
  customMm?: { w: number; h: number }
  bleed: boolean
  /** Bleed in mm: one value, or per side. */
  bleedMm: number | Sides
  cropMarks: boolean
  /** 'auto' samples the background edge per side; or one fixed color for all sides. */
  edgeFill: 'auto' | RGB
}

export const defaultExportOptions = (): ExportOptions => ({
  pageSize: 'original',
  bleed: false,
  bleedMm: defaultLayout.bleedMm,
  cropMarks: false,
  edgeFill: 'auto',
})

export function trimSizePt(o: ExportOptions, L: Layout = defaultLayout): { w: number; h: number } {
  if (o.pageSize === 'original') return { w: L.artboard.w, h: L.artboard.h }
  if (o.pageSize === 'custom') {
    const c = o.customMm ?? { w: 105, h: 148 }
    return { w: mmToPt(c.w), h: mmToPt(c.h) }
  }
  const [w, h] = L.pageSizesPt[o.pageSize]
  return { w, h }
}

export function bleedSidesPt(o: ExportOptions): Sides {
  if (!o.bleed) return { top: 0, right: 0, bottom: 0, left: 0 }
  const clamp = (mm: number) => mmToPt(Math.min(10, Math.max(0, mm || 0)))
  if (typeof o.bleedMm === 'number') {
    const b = clamp(o.bleedMm)
    return { top: b, right: b, bottom: b, left: b }
  }
  return {
    top: clamp(o.bleedMm.top), right: clamp(o.bleedMm.right),
    bottom: clamp(o.bleedMm.bottom), left: clamp(o.bleedMm.left),
  }
}

/** Crop mark geometry (pt). Marks start `offset` outside the trim and run `length`. */
const MARK_LEN = 12
const MARK_MIN_OFFSET = mmToPt(3)
const MARK_WIDTH = 0.25

export interface PreparedBackground {
  id: string
  scene: Scene
  /** Cached edge bands per placement key. */
  edges: Map<string, EdgeBands>
}

let bgCounter = 0
export const prepareBackground = (scene: Scene): PreparedBackground => ({ id: String(++bgCounter), scene, edges: new Map() })

export interface PageGeometry {
  media: { w: number; h: number }
  trim: Rect
  bleed: Rect
  /** Uniform scale from artboard to trim. */
  stickerScale: number
}

export function pageGeometry(o: ExportOptions, L: Layout = defaultLayout): PageGeometry {
  const t = trimSizePt(o, L)
  const b = bleedSidesPt(o)
  const markOffset = Math.max(MARK_MIN_OFFSET, b.top, b.right, b.bottom, b.left)
  const slug = o.cropMarks ? markOffset + MARK_LEN : 0
  const pad = {
    top: Math.max(b.top, slug), right: Math.max(b.right, slug),
    bottom: Math.max(b.bottom, slug), left: Math.max(b.left, slug),
  }
  const media = { w: t.w + pad.left + pad.right, h: t.h + pad.top + pad.bottom }
  const trim: Rect = { x: pad.left, y: pad.top, w: t.w, h: t.h }
  const bleed: Rect = {
    x: trim.x - b.left, y: trim.y - b.top,
    w: trim.w + b.left + b.right, h: trim.h + b.top + b.bottom,
  }
  const stickerScale = Math.min(t.w / L.artboard.w, t.h / L.artboard.h)
  return { media, trim, bleed, stickerScale }
}

export function buildPage(
  stickerItems: SceneItem[],
  background: PreparedBackground | null,
  o: ExportOptions,
  L: Layout = defaultLayout,
): PageSpec {
  const g = pageGeometry(o, L)
  const items: SceneItem[] = []

  // Background: one uniform scale fitted inside the trim box (never enlarged for bleed).
  if (background) {
    const bg = background.scene
    const { m } = fitMatrix({ x: 0, y: 0, w: bg.width, h: bg.height }, g.trim)
    const placed = transformItems(bg.items, m)
    const bgRect: Rect = {
      x: m[4], y: m[5], w: bg.width * m[0], h: bg.height * m[3],
    }
    // Fill everything between the bleed edge and the background edge.
    const needs = bgRect.x - g.bleed.x > 0.01 || bgRect.y - g.bleed.y > 0.01 ||
      g.bleed.x + g.bleed.w - (bgRect.x + bgRect.w) > 0.01 ||
      g.bleed.y + g.bleed.h - (bgRect.y + bgRect.h) > 0.01
    if (needs) {
      let edges: EdgeBands
      if (o.edgeFill === 'auto') {
        const key = `${bgRect.x.toFixed(2)},${bgRect.y.toFixed(2)},${bgRect.w.toFixed(2)},${bgRect.h.toFixed(2)}`
        edges = background.edges.get(key) ?? sampleAllEdgeBands(placed, bgRect)
        background.edges.set(key, edges)
      } else {
        const c = o.edgeFill
        edges = {
          top: [{ from: bgRect.x, to: bgRect.x + bgRect.w, color: c }],
          bottom: [{ from: bgRect.x, to: bgRect.x + bgRect.w, color: c }],
          left: [{ from: bgRect.y, to: bgRect.y + bgRect.h, color: c }],
          right: [{ from: bgRect.y, to: bgRect.y + bgRect.h, color: c }],
        }
      }
      items.push(...edgeFill(g.bleed, bgRect, edges))
    }
    // Shared across pages as one Form XObject (same size → same key).
    items.push({
      kind: 'group',
      key: `bg:${background.id}:${bgRect.x.toFixed(3)},${bgRect.y.toFixed(3)},${bgRect.w.toFixed(3)},${bgRect.h.toFixed(3)}`,
      items: [
        { kind: 'clipPush', path: rectPathOf(bgRect), rule: 'nonzero' },
        ...placed,
        { kind: 'clipPop' },
      ],
    })
  }

  // Sticker artwork: one uniform scale, centered in the trim box.
  const s = g.stickerScale
  const ox = g.trim.x + (g.trim.w - L.artboard.w * s) / 2
  const oy = g.trim.y + (g.trim.h - L.artboard.h * s) / 2
  items.push(...transformItems(stickerItems, multiply(translate(ox, oy), scaleM(s))))

  if (o.cropMarks) items.push(...cropMarks(g))

  const hasBleed = g.bleed.w > g.trim.w + 0.001 || g.bleed.h > g.trim.h + 0.001
  return {
    width: g.media.w,
    height: g.media.h,
    trimBox: g.trim,
    bleedBox: hasBleed || o.cropMarks ? g.bleed : undefined,
    items,
  }
}

function cropMarks(g: PageGeometry): SceneItem[] {
  const out: SceneItem[] = []
  const T = g.trim
  const offset = Math.max(MARK_MIN_OFFSET, T.x - g.bleed.x, T.y - g.bleed.y,
    g.bleed.x + g.bleed.w - T.x - T.w, g.bleed.y + g.bleed.h - T.y - T.h)
  const black: RGB = [0, 0, 0]
  const line = (x1: number, y1: number, x2: number, y2: number): SceneItem => ({
    kind: 'stroke',
    path: [{ op: 'M', p: [x1, y1] }, { op: 'L', p: [x2, y2] }],
    ctm: [1, 0, 0, 1, 0, 0],
    color: black, opacity: 1, width: MARK_WIDTH, join: 'miter', cap: 'butt', miterLimit: 4, dash: [],
  })
  const xs = [T.x, T.x + T.w]
  const ys = [T.y, T.y + T.h]
  for (const x of xs) {
    out.push(line(x, T.y - offset, x, T.y - offset - MARK_LEN))
    out.push(line(x, T.y + T.h + offset, x, T.y + T.h + offset + MARK_LEN))
  }
  for (const y of ys) {
    out.push(line(T.x - offset, y, T.x - offset - MARK_LEN, y))
    out.push(line(T.x + T.w + offset, y, T.x + T.w + offset + MARK_LEN, y))
  }
  return out
}

/**
 * Extends the background's edge colors out to the bleed edge. Left/right
 * strips are drawn first, top/bottom strips over them, so corners take the
 * color of the top/bottom band at that end. First/last bands stretch to the
 * corners. A tiny overlap avoids hairline gaps.
 */
function edgeFill(B: Rect, bg: Rect, e: EdgeBands): SceneItem[] {
  const out: SceneItem[] = []
  const ov = 0.05
  const left = bg.x - B.x
  const right = B.x + B.w - (bg.x + bg.w)
  const top = bg.y - B.y
  const bottom = B.y + B.h - (bg.y + bg.h)
  const stretch = (bands: Band[], lo: number, hi: number) =>
    bands.map((b, i) => ({
      from: i === 0 ? lo : b.from - ov,
      to: i === bands.length - 1 ? hi : b.to + ov,
      color: b.color,
    }))
  if (left > 0.01) {
    for (const b of stretch(e.left, B.y, B.y + B.h)) {
      out.push(fillRect({ x: B.x, y: b.from, w: left + ov, h: b.to - b.from }, b.color))
    }
  }
  if (right > 0.01) {
    for (const b of stretch(e.right, B.y, B.y + B.h)) {
      out.push(fillRect({ x: bg.x + bg.w - ov, y: b.from, w: right + ov, h: b.to - b.from }, b.color))
    }
  }
  if (top > 0.01) {
    for (const b of stretch(e.top, B.x, B.x + B.w)) {
      out.push(fillRect({ x: b.from, y: B.y, w: b.to - b.from, h: top + ov }, b.color))
    }
  }
  if (bottom > 0.01) {
    for (const b of stretch(e.bottom, B.x, B.x + B.w)) {
      out.push(fillRect({ x: b.from, y: bg.y + bg.h - ov, w: b.to - b.from, h: bottom + ov }, b.color))
    }
  }
  return out
}
