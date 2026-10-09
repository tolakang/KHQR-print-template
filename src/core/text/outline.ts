/**
 * Shapes text with HarfBuzz and turns every glyph into vector outlines,
 * so the PDF never embeds a font.
 *
 * Khmer runs use Nokora; everything else uses Nunito Sans.
 */
import * as hb from 'harfbuzzjs'

export interface FontSet {
  latin: hb.Font
  khmer: hb.Font
  latinUpem: number
  khmerUpem: number
}

export interface LoadedFont {
  font: hb.Font
  upem: number
  /** Cap height in font units (OS/2 sCapHeight, falls back to H extents). */
  capHeight: number
}

export function loadFont(data: ArrayBuffer | Uint8Array): LoadedFont {
  const blob = new hb.Blob(data instanceof Uint8Array ? data : new Uint8Array(data))
  const face = new hb.Face(blob, 0)
  const font = new hb.Font(face)
  const upem = face.upem
  let capHeight = font.getMetricPositionWithFallback(hb.MetricsTag.CAP_HEIGHT)
  if (!capHeight) {
    const gid = font.glyph(0x48)
    capHeight = gid !== undefined ? font.glyphExtents(gid)?.yBearing ?? upem * 0.7 : upem * 0.7
  }
  return { font, upem, capHeight }
}

const KHMER = /[ក-៿᧠-᧿]/
const NEUTRAL = /[\s​-‍⁠﻿]/

export type Script = 'khmer' | 'latin'
export interface Run {
  text: string
  script: Script
}

/** Split a line into Khmer / non-Khmer runs. Spaces join the run before them. */
export function splitRuns(text: string): Run[] {
  const runs: Run[] = []
  for (const ch of text) {
    const script: Script | null = KHMER.test(ch) ? 'khmer' : NEUTRAL.test(ch) ? null : 'latin'
    const last = runs[runs.length - 1]
    if (!last) runs.push({ text: ch, script: script ?? 'latin' })
    else if (script === null || script === last.script) last.text += ch
    else runs.push({ text: ch, script })
  }
  // A leading neutral run takes the script of what follows.
  if (runs.length > 1 && !/\S/.test(runs[0].text)) {
    runs[1].text = runs[0].text + runs[1].text
    runs.shift()
  }
  return runs
}

export interface OutlinedLine {
  /** SVG path data in points, origin at the left end of the baseline, y down. */
  d: string
  /** Advance width in points. */
  width: number
  /** Tight ink bounds in points (y down, relative to baseline). */
  bbox: { x1: number; y1: number; x2: number; y2: number }
  /** True if any character had no glyph (.notdef) in its font. */
  missingGlyphs: boolean
}

const fmt = (n: number) => {
  const r = Math.round(n * 1000) / 1000
  return Object.is(r, -0) ? '0' : String(r)
}

/**
 * Shape and outline one line of text.
 * @param fonts fonts for each script
 * @param sizePt font size in points (same size for Latin and Khmer)
 */
export function outlineLine(
  text: string,
  fonts: { latin: LoadedFont; khmer: LoadedFont },
  sizePt: number,
): OutlinedLine {
  let penX = 0
  const parts: string[] = []
  let missing = false
  let x1 = Infinity
  let y1 = Infinity
  let x2 = -Infinity
  let y2 = -Infinity

  for (const run of splitRuns(text)) {
    const lf = run.script === 'khmer' ? fonts.khmer : fonts.latin
    const scale = sizePt / lf.upem
    const buf = new hb.Buffer()
    buf.addText(run.text)
    buf.guessSegmentProperties()
    if (run.script === 'khmer') {
      buf.setScript('Khmr')
      buf.setLanguage('km')
    }
    buf.setDirection(hb.Direction.LTR)
    hb.shape(lf.font, buf)
    const glyphs = buf.getGlyphInfosAndPositions()
    for (const g of glyphs) {
      if (g.codepoint === 0) {
        // .notdef — only a problem if the source char is visible.
        const ch = run.text.slice(g.cluster, g.cluster + 1)
        if (!NEUTRAL.test(ch)) missing = true
      }
      const ox = penX + (g.xOffset ?? 0) * scale
      const oy = -(g.yOffset ?? 0) * scale
      const cmds = lf.font.glyphToJson(g.codepoint)
      for (const c of cmds) {
        const v = c.values
        const pts: number[] = []
        for (let k = 0; k < v.length; k += 2) {
          const px = ox + v[k] * scale
          const py = oy - v[k + 1] * scale
          pts.push(px, py)
          if (px < x1) x1 = px
          if (px > x2) x2 = px
          if (py < y1) y1 = py
          if (py > y2) y2 = py
        }
        parts.push(c.type + pts.map(fmt).join(' '))
      }
      penX += (g.xAdvance ?? 0) * scale
    }
  }
  if (!isFinite(x1)) x1 = y1 = x2 = y2 = 0
  return { d: parts.join(''), width: penX, bbox: { x1, y1, x2, y2 }, missingGlyphs: missing }
}

/** Translate path data produced by outlineLine. */
export function translatePath(d: string, dx: number, dy: number): string {
  // outlineLine only emits absolute M/L/Q/C/Z with x,y pairs.
  return d.replace(/([MLQCZ])([^MLQCZ]*)/g, (_, cmd: string, args: string) => {
    if (cmd === 'Z') return 'Z'
    const nums = args.trim().split(/[ ,]+/).map(Number)
    for (let k = 0; k < nums.length; k += 2) {
      nums[k] += dx
      nums[k + 1] += dy
    }
    return cmd + nums.map(fmt).join(' ')
  })
}
