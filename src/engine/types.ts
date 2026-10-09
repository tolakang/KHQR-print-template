import type { Limits } from '../config'
import type { PageSizeName } from '../core/layout/page'
import type { Warning } from '../core/scene'

export type AssetKind = 'background' | 'logo' | 'corner'

export interface Settings {
  nameSizePt: number
  midSizePt: number
  limits: Limits
  safeMarginPt: number
  midPosition: 'follow' | 'fixed'
  showCorner: boolean
  redrawRaster: boolean
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
