import layoutJson from './layout.json'
import limitsJson from './limits.json'

export interface Layout {
  artboard: { w: number; h: number }
  /** Frame square; stroke, arm length and outer (circular) radius in pt match corner.svg (scaled to `size`). */
  corner: { size: number; x: number; y: number; stroke: number; arm: number; radius: number; color: string }
  qr: { size: number; x: number; y: number }
  logo: { size: number; x: number; y: number }
  /** gapFromQr: QR bottom → cap top of the first name line (pt). */
  name: { gapFromQr: number; lineGap: number; sizePt: number }
  mid: { gapFromName: number; sizePt: number; prefix: string; position: 'follow' | 'fixed' }
  safeMarginPt: number
  pageSizesPt: Record<string, [number, number]>
  bleedMm: number
  /** Below these printed sizes the QR may not scan reliably. */
  scan: { minQrMm: number; minModuleMm: number }
}
export interface Limits { nameChars: number; nameLines: number; mid: number }

export const layout = layoutJson as unknown as Layout
export const limits = limitsJson as Limits
/** KHQR merchant names are at most 25 characters; the setting cannot go higher. */
export const NAME_CHARS_MAX = 25
export const MM_TO_PT = 72 / 25.4
export const mmToPt = (mm: number) => mm * MM_TO_PT

/** Uniform fit scale of the artboard into a trim box. */
export function fitScale(trimW: number, trimH: number): number {
  return Math.min(trimW / layout.artboard.w, trimH / layout.artboard.h)
}
/** Uniform scale so a w×h asset fits a target square. */
export function scaleToTarget(w: number, h: number, target: number): number {
  return target / Math.max(w, h)
}
