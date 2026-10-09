import type { RGB } from '../scene'

const NAMED: Record<string, string> = {
  black: '#000000', white: '#ffffff', red: '#ff0000', green: '#008000', blue: '#0000ff',
  gray: '#808080', grey: '#808080', silver: '#c0c0c0', maroon: '#800000', yellow: '#ffff00',
  orange: '#ffa500', navy: '#000080', purple: '#800080', teal: '#008080', lime: '#00ff00',
  aqua: '#00ffff', cyan: '#00ffff', fuchsia: '#ff00ff', magenta: '#ff00ff', olive: '#808000',
  darkgray: '#a9a9a9', darkgrey: '#a9a9a9', lightgray: '#d3d3d3', lightgrey: '#d3d3d3',
  gold: '#ffd700', pink: '#ffc0cb', brown: '#a52a2a', darkred: '#8b0000', crimson: '#dc143c',
  whitesmoke: '#f5f5f5', gainsboro: '#dcdcdc', dimgray: '#696969', dimgrey: '#696969',
}

export interface ParsedColor {
  rgb: RGB
  /** Alpha from rgba()/#rrggbbaa, 1 otherwise. */
  alpha: number
}

/** Returns null for "none"/"transparent"; undefined if unparseable. */
export function parseColor(src: string | undefined): ParsedColor | null | undefined {
  if (src === undefined) return undefined
  let s = src.trim().toLowerCase()
  if (!s) return undefined
  if (s === 'none' || s === 'transparent') return null
  if (NAMED[s]) s = NAMED[s]
  let m = /^#([0-9a-f]{3,8})$/.exec(s)
  if (m) {
    let h = m[1]
    if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
    if (h.length !== 6 && h.length !== 8) return undefined
    const n = (i: number) => parseInt(h.slice(i, i + 2), 16) / 255
    return { rgb: [n(0), n(2), n(4)], alpha: h.length === 8 ? n(6) : 1 }
  }
  m = /^rgba?\(([^)]*)\)$/.exec(s)
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean)
    const ch = (v: string) => (v.endsWith('%') ? parseFloat(v) / 100 : parseFloat(v) / 255)
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3])
    const rgb = [ch(parts[0]), ch(parts[1]), ch(parts[2])].map((v) => Math.min(1, Math.max(0, v))) as RGB
    if (rgb.some(Number.isNaN)) return undefined
    return { rgb, alpha: Number.isNaN(a) ? 1 : a }
  }
  return undefined
}

export const rgbToHex = (c: RGB) =>
  '#' + c.map((v) => Math.round(v * 255).toString(16).padStart(2, '0')).join('')
