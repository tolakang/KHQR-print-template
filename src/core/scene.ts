/**
 * A Scene is a flat list of vector drawing operations in a y-down,
 * point-based coordinate space. Both the PDF writer and the on-screen
 * preview render from the same Scene, so the preview matches the PDF.
 */
import type { Matrix } from './geom/matrix'
import type { Path } from './geom/path'

export type RGB = [number, number, number] // 0..1

export type FillRule = 'nonzero' | 'evenodd'

export type SceneItem =
  | { kind: 'fill'; path: Path; rule: FillRule; color: RGB; opacity: number }
  | {
      kind: 'stroke'
      /** Path in local coordinates; `ctm` maps it into scene space. */
      path: Path
      ctm: Matrix
      color: RGB
      opacity: number
      width: number
      join: 'miter' | 'round' | 'bevel'
      cap: 'butt' | 'round' | 'square'
      miterLimit: number
      dash: number[]
    }
  | { kind: 'clipPush'; path: Path; rule: FillRule }
  | { kind: 'clipPop' }
  /**
   * Reusable group (PDF Form XObject). Items with the same `key` are written
   * once per document and referenced from every page that uses them.
   */
  | { kind: 'group'; key: string; items: SceneItem[] }

export interface Scene {
  width: number
  height: number
  items: SceneItem[]
}

export interface Warning {
  code: string
  message: string
}
