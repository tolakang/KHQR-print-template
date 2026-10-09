/**
 * The generator engine. Runs inside a Web Worker in the app (and directly in
 * Node for tests). Holds fonts, assets and parsed QR files; renders previews
 * and exports.
 */
import { zipSync } from 'fflate'
import { layout, mmToPt } from '../config'
import { parseSvg, svgToScene } from '../core/svg/toScene'
import { loadBundle, bundleOutliner, type FontBundle } from '../core/text/fonts'
import { composeSticker, type StickerOptions, type StickerFonts } from '../core/layout/sticker'
import { buildPage, prepareBackground, pageGeometry, type ExportOptions, type PreparedBackground } from '../core/layout/page'
import { PdfBuilder } from '../core/pdf/writer'
import { redrawRasterQr, type RGBAImage } from '../core/qr/raster'
import { parseColor } from '../core/svg/color'
import type { Scene, Warning } from '../core/scene'
import { pageToSvg } from './svgOut'
import { inkBBox } from '../core/layout/place'
import type { AssetKind, ExportResult, PreviewResult, QrFileStatus, RowInput, Settings } from './types'

export type RasterDecoder = (bytes: Uint8Array, mime: string) => Promise<RGBAImage>

export interface FontBytes { extraBold: ArrayBuffer | Uint8Array; regular: ArrayBuffer | Uint8Array; khmer: ArrayBuffer | Uint8Array }

interface QrEntry { status: QrFileStatus; scene?: Scene; bytes: Uint8Array; mime: string }

export class Engine {
  private fonts: FontBundle
  private assets: Record<AssetKind, { scene: Scene | null; warnings: Warning[] }> = {
    background: { scene: null, warnings: [] },
    logo: { scene: null, warnings: [] },
    corner: { scene: null, warnings: [] },
  }
  private bg: PreparedBackground | null = null
  private qrs = new Map<string, QrEntry>()
  private decodeRaster: RasterDecoder

  constructor(fonts: FontBytes, decodeRaster: RasterDecoder) {
    this.fonts = loadBundle(fonts)
    this.decodeRaster = decodeRaster
  }

  private get stickerFonts(): StickerFonts {
    return { nameLatin: this.fonts.extraBold, nameKhmer: this.fonts.khmer, midLatin: this.fonts.regular }
  }

  /** Set an asset from SVG text (null clears it). Returns warnings. */
  setAsset(kind: AssetKind, svg: string | null): Warning[] {
    if (svg === null) {
      this.assets[kind] = { scene: null, warnings: [] }
      if (kind === 'background') this.bg = null
      return []
    }
    const { scene, warnings } = svgToScene(parseSvg(svg), { outlineText: bundleOutliner(this.fonts) })
    // Affinity exports can carry a red debug frame around the artboard: drop a red
    // hairline stroke that spans (almost) the whole artboard.
    scene.items = scene.items.filter((it) => {
      if (it.kind !== 'stroke' || !(it.color[0] > 0.9 && it.color[1] < 0.2 && it.color[2] < 0.2)) return true
      const b = inkBBox([it])
      return !(b && b.x2 - b.x1 > scene.width * 0.95 && b.y2 - b.y1 > scene.height * 0.95)
    })
    this.assets[kind] = { scene, warnings }
    if (kind === 'background') this.bg = prepareBackground(scene)
    return warnings
  }

  clearQrs() {
    this.qrs.clear()
  }

  async addQrFile(name: string, bytes: Uint8Array, mime: string, redrawRaster: boolean): Promise<QrFileStatus> {
    const isSvg = /svg/i.test(mime) || /\.svg$/i.test(name)
    let status: QrFileStatus
    let scene: Scene | undefined
    try {
      if (isSvg) {
        const r = svgToScene(parseSvg(new TextDecoder().decode(bytes)), { outlineText: bundleOutliner(this.fonts) })
        scene = r.scene
        const hasInk = scene.items.some((i) => i.kind === 'fill' || i.kind === 'stroke')
        status = hasInk
          ? { name, ok: true, kind: 'svg', method: 'svg', warnings: r.warnings }
          : { name, ok: false, kind: 'svg', error: 'SVG has no vector shapes (is it an embedded image?).', warnings: r.warnings }
      } else if (!redrawRaster) {
        status = { name, ok: false, kind: 'raster', error: 'Raster QR files are off. Turn on “Redraw raster QR as vector” or upload SVG.', warnings: [] }
      } else {
        const img = await this.decodeRaster(bytes, mime)
        const r = redrawRasterQr(img)
        if (r.ok) {
          scene = r.scene
          const warnings: Warning[] = []
          if (r.method === 'rebuilt') warnings.push({ code: 'qr-rebuilt', message: 'Image was not clean enough to trace; QR was rebuilt from its decoded payload (same version and EC level).' })
          status = { name, ok: true, kind: 'raster', method: r.method, payload: r.payload, warnings }
        } else {
          status = { name, ok: false, kind: 'raster', error: r.reason, warnings: [] }
        }
      }
    } catch (e) {
      status = { name, ok: false, kind: isSvg ? 'svg' : 'raster', error: (e as Error).message, warnings: [] }
    }
    this.qrs.set(name, { status, scene, bytes, mime })
    return status
  }

  /** Re-run raster files after the redraw setting changes. */
  async reprocessRaster(redrawRaster: boolean): Promise<QrFileStatus[]> {
    const out: QrFileStatus[] = []
    for (const [name, e] of this.qrs) {
      if (e.status.kind === 'raster') out.push(await this.addQrFile(name, e.bytes, e.mime, redrawRaster))
    }
    return out
  }

  private stickerOptions(s: Settings): StickerOptions {
    return {
      nameSizePt: clamp(s.nameSizePt, 6, 60),
      midSizePt: clamp(s.midSizePt, 4, 30),
      limits: {
        nameChars: Math.round(clamp(s.limits.nameChars, 1, 200)),
        nameLines: Math.round(clamp(s.limits.nameLines, 1, 4)),
        mid: Math.round(clamp(s.limits.mid, 1, 64)),
      },
      safeMarginPt: clamp(s.safeMarginPt, 0, 100),
      midPosition: s.midPosition,
      textColor: [0, 0, 0],
      showCorner: s.showCorner,
    }
  }

  exportOptions(s: Settings): ExportOptions {
    const c = parseColor(s.edgeColor)
    return {
      pageSize: s.pageSize,
      customMm: s.customMm,
      bleed: s.bleed,
      bleedMm: s.bleedPerSide ? s.bleedSidesMm : s.bleedMm,
      cropMarks: s.cropMarks,
      edgeFill: s.edgeFill === 'color' && c ? c.rgb : 'auto',
    }
  }

  private compose(row: RowInput, s: Settings) {
    const entry = row.qrFile ? this.qrs.get(row.qrFile) : undefined
    const warnings: Warning[] = []
    if (!row.qrFile) warnings.push({ code: 'qr-missing', message: 'No QR file matched this row.' })
    else if (!entry) warnings.push({ code: 'qr-missing', message: `QR file “${row.qrFile}” is not loaded.` })
    else if (!entry.scene) warnings.push({ code: 'qr-invalid', message: entry.status.error ?? 'QR file could not be used.' })
    if (entry?.status.warnings.length) warnings.push(...entry.status.warnings)
    if (row.midImprecise) warnings.push({ code: 'mid-precision', message: 'MID was stored as a number in Excel and may have lost digits. Format the MID column as Text.' })
    const qr = entry?.scene ?? null
    const st = composeSticker(
      { name: row.name, mid: row.mid, qr: qr ?? { width: 1, height: 1, items: [] }, logo: this.assets.logo.scene, corner: this.assets.corner.scene },
      this.stickerFonts,
      this.stickerOptions(s),
    )
    const all = [...warnings, ...st.warnings.filter((w) => !(w.code === 'qr-empty' && !qr))]
    return { st, warnings: all, hasQr: !!qr }
  }

  preview(row: RowInput, s: Settings): PreviewResult {
    const { st, warnings } = this.compose(row, s)
    const opts = this.exportOptions(s)
    const page = buildPage(st.items, this.bg, opts)
    const g = pageGeometry(opts)
    const sc = g.stickerScale
    const ox = g.trim.x + (g.trim.w - layout.artboard.w * sc) / 2
    const oy = g.trim.y + (g.trim.h - layout.artboard.h * sc) / 2
    const safe = { x: ox + s.safeMarginPt * sc, y: oy, w: (layout.artboard.w - 2 * s.safeMarginPt) * sc, h: layout.artboard.h * sc }
    return {
      svg: pageToSvg(page, { trim: true, bleed: true, safe }),
      width: page.width,
      height: page.height,
      warnings,
      nameLines: st.nameLines,
      midText: st.midText,
    }
  }

  assetWarnings(kind: AssetKind) {
    return this.assets[kind].warnings
  }

  async export(rows: RowInput[], s: Settings, onProgress: (done: number, total: number) => void, isCancelled: () => boolean): Promise<ExportResult> {
    const t0 = Date.now()
    const opts = this.exportOptions(s)
    const skipped: ExportResult['skipped'] = []
    const warningsByRow: ExportResult['warningsByRow'] = []
    const files: ExportResult['files'] = []
    const stamp = new Date().toISOString().slice(0, 10)
    const size = s.pageSize === 'original' ? 'Original' : s.pageSize === 'custom' ? `${s.customMm.w}x${s.customMm.h}mm` : s.pageSize
    const suffix = `${size}${s.bleed ? '_bleed' : ''}`
    const meta = { title: `KHQR Roll Sticker ${size}`, subject: 'KHQR Roll Sticker Single' }

    let builder: PdfBuilder | null = null
    let partPages = 0
    let part = 0
    const zipEntries: Record<string, Uint8Array> = {}
    const usedNames = new Set<string>()
    const uniqueName = (base: string) => {
      let n = base.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'sticker'
      let k = 2
      while (usedNames.has(n.toLowerCase())) n = `${base}_${k++}`
      usedNames.add(n.toLowerCase())
      return n
    }
    let pages = 0
    const splitEvery = Math.max(1, Math.round(s.splitEvery || 100))

    for (let i = 0; i < rows.length; i++) {
      if (isCancelled()) throw new Error('cancelled')
      const row = rows[i]
      const { st, warnings, hasQr } = this.compose(row, s)
      if (!hasQr) {
        skipped.push({ row, reason: warnings.find((w) => w.code.startsWith('qr'))?.message ?? 'No QR' })
        onProgress(i + 1, rows.length)
        continue
      }
      if (warnings.length) warningsByRow.push({ row, warnings })
      const page = buildPage(st.items, this.bg, opts)
      if (s.output === 'zip') {
        const b = await PdfBuilder.create({ ...meta, title: `KHQR ${row.mid}` })
        b.addPage(page)
        zipEntries[`${uniqueName(row.mid || `row-${row.excelRow}`)}.pdf`] = await b.save()
      } else {
        if (!builder) builder = await PdfBuilder.create(meta)
        builder.addPage(page)
        partPages++
        if (s.output === 'split' && partPages >= splitEvery) {
          part++
          zipEntries[`KHQR_${stamp}_${suffix}_part-${String(part).padStart(2, '0')}.pdf`] = await builder.save()
          builder = null
          partPages = 0
        }
      }
      pages++
      onProgress(i + 1, rows.length)
      if (i % 20 === 19) await new Promise((r) => setTimeout(r, 0))
    }

    if (s.output === 'combined') {
      if (builder) files.push({ name: `KHQR_${stamp}_${suffix}_${pages}p.pdf`, bytes: await builder.save(), mime: 'application/pdf' })
    } else {
      if (builder && partPages) {
        part++
        zipEntries[`KHQR_${stamp}_${suffix}_part-${String(part).padStart(2, '0')}.pdf`] = await builder.save()
      }
      if (Object.keys(zipEntries).length) {
        // PDFs are already compressed; store them.
        const zip = zipSync(Object.fromEntries(Object.entries(zipEntries).map(([k, v]) => [k, [v, { level: 0 }]])))
        files.push({ name: `KHQR_${stamp}_${suffix}_${pages}${s.output === 'zip' ? '-files' : '-pages'}.zip`, bytes: zip, mime: 'application/zip' })
      }
    }
    return { files, pages, skipped, warningsByRow, ms: Date.now() - t0 }
  }
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Number.isFinite(v) ? v : lo))

export { mmToPt }
