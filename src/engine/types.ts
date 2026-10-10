import type { Limits } from '../config'
import type { PageSizeName } from '../core/layout/page'
import type { Warning } from '../core/scene'

export type AssetKind = 'background' | 'logo' | 'corner'

/** Movable sticker elements. The Bakong logo stays centred on the QR and moves with it. */
export type OffsetRole = 'corner' | 'qr' | 'name' | 'mid'
/** Shift from the guide position in pt (x right, y down). */
export interface Offset { x: number; y: number }
export type Offsets = Record<OffsetRole, Offset>

export interface Settings {
  nameSizePt: number
  midSizePt: number
  limits: Limits
  safeMarginPt: number
  midPosition: 'follow' | 'fixed'
  showCorner: boolean
  showLogo: boolean
  /** Corner frame: outer corner radius (pt) and color ('' = the artwork's own colors). */
  cornerRadiusPt: number
  cornerColor: string
  /** Position adjustments from the guide layout (pt). */
  offsets: Offsets
  /** Unit the position fields are shown in (stored values are always pt). */
  positionUnit: 'mm' | 'pt'
  /** Merchant-name font ids (see config/fonts.ts). */
  nameFontLatin: string
  nameFontKhmer: string
  redrawRaster: boolean
  /** Draw the background artwork (and its edge fill); off for pre-printed stock. */
  background: boolean
  pageSize: PageSizeName
  customMm: { w: number; h: number }
  bleed: boolean
  bleedMm: number
  bleedPerSide: boolean
  bleedSidesMm: { top: number; right: number; bottom: number; left: number }
  cropMarks: boolean
  edgeFill: 'auto' | 'color'
  edgeColor: string
  output: 'combined' | 'zip' | 'split'
  splitEvery: number
}

export interface RowInput {
  index: number
  excelRow: number
  name: string
  mid: string
  midImprecise: boolean
  qrFile?: string
}

export interface QrFileStatus {
  name: string
  ok: boolean
  kind: 'svg' | 'raster'
  method?: 'svg' | 'traced' | 'rebuilt'
  payload?: string
  /** QR modules per side, when known (redrawn raster QRs). */
  modules?: number
  error?: string
  warnings: Warning[]
}

export interface PreviewResult {
  svg: string
  width: number
  height: number
  warnings: Warning[]
  nameLines: string[]
  midText: string
}

export interface ExportResult {
  files: { name: string; bytes: Uint8Array; mime: string }[]
  pages: number
  skipped: { row: RowInput; reason: string }[]
  warningsByRow: { row: RowInput; warnings: Warning[] }[]
  ms: number
}
