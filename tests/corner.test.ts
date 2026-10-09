import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parseSvg, svgToScene } from '../src/core/svg/toScene'
import { cornerFrameScene, recolorScene } from '../src/core/layout/corner'
import { inkBBox, bboxToRect, placeScene } from '../src/core/layout/place'
import { pointInPath } from '../src/core/layout/sample'
import { layout } from '../src/config'
import type { Scene } from '../src/core/scene'

const S = layout.corner.size
const grey: [number, number, number] = [147 / 255, 149 / 255, 152 / 255]

/** Ink coverage of a scene on an n × n grid over the corner square. */
function coverage(scene: Scene, n = 500): boolean[] {
  const fills = scene.items.filter((i) => i.kind === 'fill')
  const out: boolean[] = []
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const px = ((x + 0.5) / n) * S
      const py = ((y + 0.5) / n) * S
      out.push(fills.some((f) => f.kind === 'fill' && pointInPath(f.path, f.rule, px, py)))
    }
  }
  return out
}

describe('generated corner frame', () => {
  const svg = svgToScene(parseSvg(readFileSync('public/artwork/corner.svg', 'utf8'))).scene
  const placed: Scene = { width: S, height: S, items: placeScene(svg, bboxToRect(inkBBox(svg.items)!), { x: 0, y: 0, w: S, h: S }).items }

  it('matches corner.svg at the guide radius', () => {
    const a = coverage(placed)
    const b = coverage(cornerFrameScene({ radius: layout.corner.radius, color: grey }))
    const ink = a.filter(Boolean).length
    const diff = a.filter((v, i) => v !== b[i]).length
    expect(ink).toBeGreaterThan(0)
    expect(diff / ink).toBeLessThan(0.06)
  })
  it('fills the whole square edge to edge and keeps the arms at any radius', () => {
    for (const radius of [0, 8, layout.corner.radius, 30, 999]) {
      const sc = cornerFrameScene({ radius, color: grey })
      const b = inkBBox(sc.items)!
      expect([b.x1, b.y1, b.x2, b.y2].map((v) => +v.toFixed(3))).toEqual([0, 0, S, S])
      // Middle of each side stays empty (arms are 37 pt).
      expect(pointInPath((sc.items[0] as { path: never }).path, 'nonzero', S / 2, 1)).toBe(false)
    }
  })
  it('square corners at radius 0, rounder corners with a larger radius', () => {
    const at = (radius: number) => pointInPath((cornerFrameScene({ radius, color: grey }).items[0] as { path: never }).path, 'nonzero', 0.6, 0.6)
    expect(at(0)).toBe(true)
    expect(at(layout.corner.radius)).toBe(false)
  })
  it('recolors an uploaded frame', () => {
    const red = recolorScene(svg, [1, 0, 0])
    expect(red.items.filter((i) => i.kind === 'fill').every((i) => i.kind === 'fill' && i.color.join() === '1,0,0')).toBe(true)
  })
})
