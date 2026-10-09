/**
 * Converts an SVG document into a vector Scene.
 * Supported: g/svg/a/switch, path, rect, circle, ellipse, line, polyline,
 * polygon, use, text/tspan (outlined), transforms, clip-path, fill/stroke,
 * opacity, fill-opacity, stroke-opacity, fill-rule, simple <style> rules.
 * Unsupported features are approximated or skipped and reported as warnings.
 */
import { DOMParser } from '@xmldom/xmldom'
import { IDENTITY, multiply, parseTransform, translate, type Matrix } from '../geom/matrix'
import {
  parsePathData, rectPath, ellipsePath, polyPath, transformPath, type Path,
} from '../geom/path'
import type { Scene, SceneItem, Warning, FillRule, RGB } from '../scene'
import { parseColor } from './color'

type El = Element

export interface ViewBox { x: number; y: number; w: number; h: number }

export interface SvgDoc {
  root: El
  viewBox: ViewBox
  byId: Map<string, El>
  css: CssRule[]
}

interface CssRule { sel: string; decls: Record<string, string> }

export interface TextStyle { family: string; weight: number; size: number }
export type TextOutliner = (text: string, style: TextStyle) => { path: Path; width: number } | null

const num = (v: string | null | undefined, def = 0): number => {
  if (v == null || v === '') return def
  const n = parseFloat(v)
  return Number.isFinite(n) ? n : def
}

function walk(el: El, fn: (e: El) => void) {
  fn(el)
  for (let c = el.firstChild; c; c = c.nextSibling) if (c.nodeType === 1) walk(c as El, fn)
}

function parseCss(text: string): CssRule[] {
  const rules: CssRule[] = []
  const clean = text.replace(/\/\*[\s\S]*?\*\//g, '')
  const re = /([^{}]+)\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(clean))) {
    const decls = parseDecls(m[2])
    for (const sel of m[1].split(',')) rules.push({ sel: sel.trim(), decls })
  }
  return rules
}

function parseDecls(s: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of s.split(';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).replace(/!important/, '').trim()
  }
  return out
}

export function parseSvg(src: string): SvgDoc {
  const errors: string[] = []
  const dom = new DOMParser({
    onError: (level: string, msg: string) => {
      if (level !== 'warning') errors.push(msg)
    },
  }).parseFromString(src, 'image/svg+xml')
  const root = dom.documentElement as unknown as El | null
  if (!root || root.nodeName.replace(/^.*:/, '') !== 'svg') {
    throw new Error('Not an SVG file' + (errors.length ? `: ${errors[0]}` : ''))
  }
  const byId = new Map<string, El>()
  const css: CssRule[] = []
  walk(root, (e) => {
    const id = e.getAttribute('id')
    if (id) byId.set(id, e)
    if (localName(e) === 'style') css.push(...parseCss(e.textContent ?? ''))
  })
  let viewBox: ViewBox
  const vb = root.getAttribute('viewBox')?.trim().split(/[\s,]+/).map(Number)
  if (vb && vb.length === 4 && vb.every(Number.isFinite) && vb[2] > 0 && vb[3] > 0) {
    viewBox = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] }
  } else {
    const w = lengthToPx(root.getAttribute('width'))
    const h = lengthToPx(root.getAttribute('height'))
    if (!w || !h) throw new Error('SVG has no viewBox or absolute width/height')
    viewBox = { x: 0, y: 0, w, h }
  }
  return { root, viewBox, byId, css }
}

/** Absolute SVG length to px (1px = 1 user unit). Percentages return 0. */
export function lengthToPx(v: string | null): number {
  if (!v) return 0
  const m = /^\s*([\d.eE+-]+)\s*(px|pt|mm|cm|in|pc)?\s*$/.exec(v)
  if (!m) return 0
  const n = parseFloat(m[1])
  const k = { px: 1, pt: 4 / 3, mm: 96 / 25.4, cm: 96 / 2.54, in: 96, pc: 16 }[m[2] ?? 'px'] ?? 1
  return n * k
}

const localName = (e: El) => (e.localName || e.nodeName).replace(/^.*:/, '')

const INHERITED = [
  'fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity',
  'stroke-linejoin', 'stroke-linecap', 'stroke-miterlimit', 'stroke-dasharray',
  'clip-rule', 'font-family', 'font-size', 'font-weight', 'color', 'visibility', 'text-anchor',
] as const
type Props = Record<string, string>

const DEFAULTS: Props = {
  fill: 'black', 'fill-opacity': '1', 'fill-rule': 'nonzero', stroke: 'none',
  'stroke-width': '1', 'stroke-opacity': '1', 'stroke-linejoin': 'miter',
  'stroke-linecap': 'butt', 'stroke-miterlimit': '4', 'stroke-dasharray': 'none',
  'clip-rule': 'nonzero', 'font-family': 'sans-serif', 'font-size': '16',
  'font-weight': '400', color: 'black', visibility: 'visible', 'text-anchor': 'start',
}

export interface SceneResult { scene: Scene; warnings: Warning[] }

export function svgToScene(doc: SvgDoc, opts: { outlineText?: TextOutliner } = {}): SceneResult {
  const items: SceneItem[] = []
  const warnings: Warning[] = []
  const warned = new Set<string>()
  const warn = (code: string, message: string) => {
    if (warned.has(code)) return
    warned.add(code)
    warnings.push({ code, message })
  }

  const ownProps = (e: El): Props => {
    const p: Props = {}
    // presentation attributes < CSS rules < inline style
    for (const k of [...INHERITED, 'opacity', 'display', 'clip-path', 'mask', 'filter']) {
      const v = e.getAttribute(k)
      if (v != null && v !== '') p[k] = v
    }
    if (doc.css.length) {
      const cls = (e.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
      const id = e.getAttribute('id')
      const tag = localName(e)
      for (const r of doc.css) {
        const s = r.sel
        if (
          s === tag || s === '*' ||
          (s.startsWith('.') && cls.includes(s.slice(1))) ||
          (s.startsWith('#') && s.slice(1) === id) ||
          (s.startsWith(tag + '.') && cls.includes(s.slice(tag.length + 1)))
        ) Object.assign(p, r.decls)
      }
    }
    const st = e.getAttribute('style')
    if (st) Object.assign(p, parseDecls(st))
    return p
  }

  const resolve = (e: El, parent: Props): Props => {
    const own = ownProps(e)
    const out: Props = {}
    for (const k of INHERITED) {
      const v = own[k]
      out[k] = v === undefined || v === 'inherit' ? parent[k] : v
    }
    out.opacity = own.opacity ?? '1'
    out.display = own.display ?? 'inline'
    if (own['clip-path']) out['clip-path'] = own['clip-path']
    if (own.mask && own.mask !== 'none') warn('mask', 'SVG masks are not supported and were ignored.')
    if (own.filter && own.filter !== 'none') warn('filter', 'SVG filters (blur, shadow) are not supported and were ignored.')
    return out
  }

  const paint = (v: string, props: Props): { rgb: RGB; alpha: number } | null => {
    const s = v.trim()
    if (s.startsWith('url(')) {
      const id = /url\(\s*['"]?#([^'")\s]+)/.exec(s)?.[1]
      const g = id ? doc.byId.get(id) : undefined
      warn('gradient', 'Gradients and patterns are drawn as a flat color (their first stop).')
      if (g) {
        let stop: El | null = null
        walk(g, (e) => { if (!stop && localName(e) === 'stop') stop = e })
        if (stop) {
          const sp = ownProps(stop)
          const c = parseColor(sp['stop-color'] ?? (stop as El).getAttribute('stop-color') ?? 'black')
          if (c) return { rgb: c.rgb, alpha: c.alpha * num(sp['stop-opacity'], 1) }
        }
      }
      const fallback = /\)\s+(.+)$/.exec(s)?.[1]
      return fallback ? paint(fallback, props) : null
    }
    if (s === 'currentColor') return paint(props.color, props)
    const c = parseColor(s)
    if (c === undefined) {
      warn('color', `Unrecognized color "${s}" drawn as black.`)
      return { rgb: [0, 0, 0], alpha: 1 }
    }
    return c
  }

  const clipFor = (ref: string, ctm: Matrix): { path: Path; rule: FillRule } | null => {
    const id = /url\(\s*['"]?#([^'")\s]+)/.exec(ref)?.[1]
    const cp = id ? doc.byId.get(id) : undefined
    if (!cp || localName(cp) !== 'clipPath') return null
    if (cp.getAttribute('clipPathUnits') === 'objectBoundingBox') {
      warn('clip-bbox', 'clipPathUnits="objectBoundingBox" is not supported; clip ignored.')
      return null
    }
    const base = multiply(ctm, parseTransform(cp.getAttribute('transform')))
    const path: Path = []
    let rule: FillRule = 'nonzero'
    for (let c = cp.firstChild; c; c = c.nextSibling) {
      if (c.nodeType !== 1) continue
      const e = c as El
      const props = resolve(e, DEFAULTS)
      let m = multiply(base, parseTransform(e.getAttribute('transform')))
      let target = e
      if (localName(e) === 'use') {
        const href = e.getAttribute('href') ?? e.getAttribute('xlink:href')
        const t = href ? doc.byId.get(href.replace(/^#/, '')) : undefined
        if (!t) continue
        m = multiply(m, translate(num(e.getAttribute('x')), num(e.getAttribute('y'))))
        target = t
      }
      const g = shapePath(target)
      if (g) path.push(...transformPath(g, m))
      if (props['clip-rule'] === 'evenodd') rule = 'evenodd'
    }
    return { path, rule }
  }

  const shapePath = (e: El): Path | null => {
    const a = (k: string) => e.getAttribute(k)
    switch (localName(e)) {
      case 'path':
        return parsePathData(a('d') ?? '')
      case 'rect': {
        const rxA = a('rx')
        const ryA = a('ry')
        const rx = num(rxA ?? ryA)
        const ry = num(ryA ?? rxA)
        return rectPath(num(a('x')), num(a('y')), num(a('width')), num(a('height')), rx, ry)
      }
      case 'circle':
        return ellipsePath(num(a('cx')), num(a('cy')), num(a('r')), num(a('r')))
      case 'ellipse':
        return ellipsePath(num(a('cx')), num(a('cy')), num(a('rx')), num(a('ry')))
      case 'line':
        return [
          { op: 'M', p: [num(a('x1')), num(a('y1'))] },
          { op: 'L', p: [num(a('x2')), num(a('y2'))] },
        ]
      case 'polyline':
        return polyPath(a('points') ?? '', false)
      case 'polygon':
        return polyPath(a('points') ?? '', true)
      default:
        return null
    }
  }

  const emitShape = (geom: Path, props: Props, ctm: Matrix, opacity: number, isLine = false) => {
    if (!geom.length || props.visibility === 'hidden') return
    if (!isLine) {
      const f = paint(props.fill, props)
      if (f) {
        const op = f.alpha * num(props['fill-opacity'], 1) * opacity
        if (op > 0) {
          items.push({
            kind: 'fill',
            path: transformPath(geom, ctm),
            rule: props['fill-rule'] === 'evenodd' ? 'evenodd' : 'nonzero',
            color: f.rgb,
            opacity: op,
          })
        }
      }
    }
    const s = paint(props.stroke, props)
    const width = num(props['stroke-width'], 1)
    if (s && width > 0) {
      const op = s.alpha * num(props['stroke-opacity'], 1) * opacity
      const dashSrc = props['stroke-dasharray']
      const dash = dashSrc && dashSrc !== 'none'
        ? dashSrc.split(/[\s,]+/).map(Number).filter((n) => n >= 0)
        : []
      if (op > 0) {
        items.push({
          kind: 'stroke',
          path: geom,
          ctm,
          color: s.rgb,
          opacity: op,
          width,
          join: (['round', 'bevel'].includes(props['stroke-linejoin']) ? props['stroke-linejoin'] : 'miter') as 'miter',
          cap: (['round', 'square'].includes(props['stroke-linecap']) ? props['stroke-linecap'] : 'butt') as 'butt',
          miterLimit: num(props['stroke-miterlimit'], 4),
          dash: dash.length % 2 ? [...dash, ...dash] : dash,
        })
      }
    }
  }

  const emitText = (e: El, props: Props, ctm: Matrix, opacity: number) => {
    if (!opts.outlineText) {
      warn('text', 'Live text in the SVG could not be outlined (no font available) and was skipped.')
      return
    }
    // Collect chunks: each text node with the x/y in effect.
    let x = lengthToPx(e.getAttribute('x')) || num(e.getAttribute('x'))
    let y = lengthToPx(e.getAttribute('y')) || num(e.getAttribute('y'))
    const visit = (node: El, p: Props) => {
      for (let c = node.firstChild; c; c = c.nextSibling) {
        if (c.nodeType === 3) {
          const raw = (c.nodeValue ?? '').replace(/\s+/g, ' ')
          if (!raw.trim() && !raw) continue
          const size = num(p['font-size'], 16)
          const weight = p['font-weight'] === 'bold' ? 700 : num(p['font-weight'], 400)
          const res = opts.outlineText!(raw, { family: p['font-family'], weight, size })
          if (!res) {
            warn('font:' + p['font-family'], `Font ${p['font-family']} is not available; that text was skipped. Outline text before uploading.`)
            continue
          }
          let dx = 0
          if (p['text-anchor'] === 'middle') dx = -res.width / 2
          else if (p['text-anchor'] === 'end') dx = -res.width
          emitShape(transformPath(res.path, translate(x + dx, y)), { ...p, stroke: 'none' }, ctm, opacity)
          x += res.width
        } else if (c.nodeType === 1 && localName(c as El) === 'tspan') {
          const t = c as El
          const tp = resolve(t, p)
          if (t.getAttribute('x')) x = num(t.getAttribute('x'))
          if (t.getAttribute('y')) y = num(t.getAttribute('y'))
          x += num(t.getAttribute('dx'))
          y += num(t.getAttribute('dy'))
          visit(t, tp)
        }
      }
    }
    visit(e, props)
  }

  const render = (e: El, parent: Props, parentCtm: Matrix, parentOpacity: number, depth: number) => {
    if (depth > 64) return
    const tag = localName(e)
    if (['defs', 'clipPath', 'mask', 'symbol', 'linearGradient', 'radialGradient', 'pattern',
      'style', 'title', 'desc', 'metadata', 'filter', 'marker', 'script', 'foreignObject'].includes(tag)) {
      if (tag === 'foreignObject') warn('foreignObject', 'foreignObject content was skipped.')
      return
    }
    const props = resolve(e, parent)
    if (props.display === 'none') return
    let ctm = multiply(parentCtm, parseTransform(e.getAttribute('transform')))
    const opacity = parentOpacity * num(props.opacity, 1)
    if (num(props.opacity, 1) < 1 && tag === 'g') {
      warn('group-opacity', 'Group opacity is applied to each shape separately (overlaps inside the group may look slightly different).')
    }
    if (opacity <= 0) return

    let clipped = false
    if (props['clip-path'] && props['clip-path'] !== 'none') {
      const clip = clipFor(props['clip-path'], ctm)
      if (clip) {
        items.push({ kind: 'clipPush', path: clip.path, rule: clip.rule })
        clipped = true
      }
    }

    if (tag === 'svg' && e !== doc.root) {
      ctm = multiply(ctm, translate(num(e.getAttribute('x')), num(e.getAttribute('y'))))
    }
    switch (tag) {
      case 'svg':
      case 'g':
      case 'a':
      case 'switch':
        for (let c = e.firstChild; c; c = c.nextSibling) {
          if (c.nodeType === 1) render(c as El, props, ctm, opacity, depth + 1)
        }
        break
      case 'use': {
        const href = e.getAttribute('href') ?? e.getAttribute('xlink:href')
        const t = href ? doc.byId.get(href.replace(/^#/, '')) : undefined
        if (t) {
          const m = multiply(ctm, translate(num(e.getAttribute('x')), num(e.getAttribute('y'))))
          if (localName(t) === 'symbol') {
            for (let c = t.firstChild; c; c = c.nextSibling) {
              if (c.nodeType === 1) render(c as El, props, m, opacity, depth + 1)
            }
          } else render(t, props, m, opacity, depth + 1)
        }
        break
      }
      case 'text':
        emitText(e, props, ctm, opacity)
        break
      case 'image':
        warn('image', 'Embedded raster images in the SVG were skipped (output must stay vector).')
        break
      default: {
        const g = shapePath(e)
        if (g) emitShape(g, props, ctm, opacity, tag === 'line' || tag === 'polyline' && props.fill === 'none')
      }
    }
    if (clipped) items.push({ kind: 'clipPop' })
  }

  const vb = doc.viewBox
  render(doc.root, DEFAULTS, translate(-vb.x, -vb.y), 1, 0)
  return { scene: { width: vb.w, height: vb.h, items }, warnings }
}

/** Map every item of a scene through a matrix (used to place a scene on a page). */
export function transformItems(items: SceneItem[], m: Matrix): SceneItem[] {
  return items.map((it): SceneItem => {
    switch (it.kind) {
      case 'fill':
      case 'clipPush':
        return { ...it, path: transformPath(it.path, m) }
      case 'stroke':
        return { ...it, ctm: multiply(m, it.ctm) }
      case 'group':
        return { ...it, key: `${it.key}@${m.map((v) => v.toFixed(4)).join(',')}`, items: transformItems(it.items, m) }
      default:
        return it
    }
  })
}

export { IDENTITY }
