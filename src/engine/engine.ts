/**
 * The generator engine. Runs inside a Web Worker in the app (and directly in
 * Node for tests). Holds fonts, assets and parsed QR files; renders previews
 * and exports.
 */
import { zipSync } from 'fflate'
import { layout, mmToPt, NAME_CHARS_MAX } from '../config'
import { parseSvg, svgToScene } from '../core/svg/toScene'
import { loadBundle, bundleOutliner, type FontBundle } from '../core/text/fonts'
import { loadFont, type LoadedFont } from '../core/text/outline'
import { DEFAULT_NAME_FONT, SCRIPT_PROBE, fontChoice, type FontScript } from '../config/fonts'
import { composeSticker, type StickerOptions, type StickerFonts } from '../core/layout/sticker'
import { buildPage, prepareBackground, pageGeometry, type ExportOptions, type PreparedBackground } from '../core/layout/page'
import { PdfBuilder } from '../core/pdf/writer'
import { redrawRasterQr, WARN_MODULE_PX, type RGBAImage } from '../core/qr/raster'
import { qrPrintSize } from '../core/qr/printSize'
import { parseColor } from '../core/svg/color'
import type { Scene, Warning } from '../core/scene'
import { pageToSvg } from './svgOut'
import { cornerFrameScene, recolorScene } from '../core/layout/corner'
import { inkBBox } from '../core/layout/place'
import type { AssetKind, ExportResult, PreviewResult, QrFileStatus, RowInput, Settings } from './types'

export type RasterDecoder = (bytes: Uint8Array, mime: string) => Promise<RGBAImage>
/** Loads a bundled font file (path relative to the site root, e.g. 'fonts/Inter_800ExtraBold.ttf'). */
export type FontFileLoader = (file: string) => Promise<Uint8Array>

export interface FontBytes { extraBold: ArrayBuffer | Uint8Array; regular: ArrayBuffer | Uint8Array; khmer: ArrayBuffer | Uint8Array }

interface QrEntry { status: QrFileStatus; scene?: Scene; bytes: Uint8Array; mime: string }

export class Engine {
  private fonts: FontBundle
  private assets: Record<AssetKind, { scene: Scene | null; warnings: Warning[]; isDefault: boolean }> = {
    background: { scene: null, warnings: [], isDefault: false },
    logo: { scene: null, warnings: [], isDefault: false },
    corner: { scene: null, warnings: [], isDefault: false },
  }
  private bg: PreparedBackground | null = null
  private qrs = new Map<string, QrEntry>()
  private decodeRaster: RasterDecoder
  private loadFontFile: FontFileLoader | null
  /** Merchant-name fonts by id (bundled ones load on first use; custom ones are registered). */
  private nameFonts = new Map<string, LoadedFont>()

  constructor(fonts: FontBytes, decodeRaster: RasterDecoder, loadFontFile: FontFileLoader | null = null) {
    this.fonts = loadBundle(fonts)
    this.decodeRaster = decodeRaster
    this.loadFontFile = loadFontFile
    this.nameFonts.set(DEFAULT_NAME_FONT.latin, this.fonts.extraBold)
    this.nameFonts.set(DEFAULT_NAME_FONT.khmer, this.fonts.khmer)
  }

  /** Add a user font for the merchant name. Rejects files without the script's letters. */
  registerFont(id: string, script: FontScript, bytes: Uint8Array): { ok: boolean; error?: string } {
    let f: LoadedFont
    try {
      f = loadFont(bytes)
    } catch {
      return { ok: false, error: 'Not a readable font file. Use .ttf or .otf.' }
    }
    if (f.font.glyph(SCRIPT_PROBE[script]) === undefined) {
      return { ok: false, error: script === 'khmer' ? 'This font has no Khmer letters.' : 'This font has no Latin letters.' }
    }
    this.nameFonts.set(id, f)
    return { ok: true }
  }

  /** Load the bundled name fonts the settings ask for (no-op once loaded). */
  async ensureFonts(s: Settings): Promise<void> {
    for (const script of ['latin', 'khmer'] as const) {
      const id = script === 'latin' ? s.nameFontLatin : s.nameFontKhmer
      const c = fontChoice(script, id)
      if (this.nameFonts.has(id) || !c || !this.loadFontFile) continue
      this.nameFonts.set(id, loadFont(await this.loadFontFile(c.file)))
    }
  }

  private stickerFonts(s: Settings, warnings: Warning[]): StickerFonts {
    const pick = (script: FontScript, id: string) => {
      const f = this.nameFonts.get(id)
      if (!f) warnings.push({ code: 'font-missing', message: `The chosen ${script === 'latin' ? 'English' : 'Khmer'} name font is not loaded; using the guide font.` })
      return f ?? this.nameFonts.get(DEFAULT_NAME_FONT[script])!
    }
    return { nameLatin: pick('latin', s.nameFontLatin), nameKhmer: pick('khmer', s.nameFontKhmer), midLatin: this.fonts.regular }
  }

  /**
   * Set an asset from SVG text (null clears it). Returns warnings. `isDefault`
   * marks the bundled corner frame, which is then drawn from numbers so its
   * radius can change.
   */
  setAsset(kind: AssetKind, svg: string | null, isDefault = false): Warning[] {
    if (svg === null) {
      this.assets[kind] = { scene: null, warnings: [], isDefault: false }
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
    this.assets[kind] = { scene, warnings, isDefault }
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
          if (r.bakedLogo) warnings.push({ code: 'qr-baked-logo', message: `The image already has a logo in the QR; the modules under it are lost${r.method === 'rebuilt' ? ', so the QR was rebuilt from its decoded payload' : ''}. Prefer the QR without a logo.` })
          else if (r.method === 'rebuilt') warnings.push({ code: 'qr-rebuilt', message: 'Image was not clean enough to trace; QR was rebuilt from its decoded payload (same version and EC level).' })
          if (r.lowResolution) warnings.push({ code: 'qr-low-res', message: `Low resolution: ${r.modulePx.toFixed(1)} px per QR module (${WARN_MODULE_PX} or more recommended). Check the redraw or upload an SVG.` })
          status = { name, ok: true, kind: 'raster', method: r.method, payload: r.payload, modules: r.matrix.length, warnings }
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
        nameChars: Math.round(clamp(s.limits.nameChars, 1, NAME_CHARS_MAX)),
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

  /** The bundled frame is generated (radius + color); an uploaded one is only recolored. */
  private cornerScene(s: Settings): Scene | null {
    const a = this.assets.corner
    if (!a.scene) return null
    const color = parseColor(s.cornerColor)?.rgb
    if (a.isDefault) {
      return cornerFrameScene({ radius: clamp(s.cornerRadiusPt, 0, layout.corner.arm), color: color ?? parseColor(layout.corner.color)!.rgb })
    }
    return color ? recolorScene(a.scene, color) : a.scene
  }

  private compose(row: RowInput, s: Settings) {
    const entry = row.qrFile ? this.qrs.get(row.qrFile) : undefined
    const warnings: Warning[] = []
    if (!row.qrFile) warnings.push({ code: 'qr-missing', message: 'No QR file matched this row.' })
    else if (!entry) warnings.push({ code: 'qr-missing', message: `QR file “${row.qrFile}” is not loaded.` })
    else if (!entry.scene) warnings.push({ code: 'qr-invalid', message: entry.status.error ?? 'QR file could not be used.' })
    if (entry?.status.warnings.length) warnings.push(...entry.status.warnings)
    if (entry?.scene) {
      const size = qrPrintSize(pageGeometry(this.exportOptions(s)).stickerScale, entry.status.modules)
      if (size.tooSmall && size.message) warnings.push({ code: 'qr-small', message: size.message })
    }
    if (row.midImprecise) warnings.push({ code: 'mid-precision', message: 'MID was stored as a number in Excel and may have lost digits. Format the MID column as Text.' })
    const qr = entry?.scene ?? null
    const st = composeSticker(
      { name: row.name, mid: row.mid, qr: qr ?? { width: 1, height: 1, items: [] }, logo: s.showLogo ? this.assets.logo.scene : null, corner: this.cornerScene(s) },
      this.stickerFonts(s, warnings),
      this.stickerOptions(s),
    )
    const all = [...warnings, ...st.warnings.filter((w) => !(w.code === 'qr-empty' && !qr))]
    return { st, warnings: all, hasQr: !!qr }
  }

  preview(row: RowInput, s: Settings): PreviewResult {
    const { st, warnings } = this.compose(row, s)
    const opts = this.exportOptions(s)
    const page = buildPage(st.items, s.background ? this.bg : null, opts)
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
    await this.ensureFonts(s)
    const opts = this.exportOptions(s)
    const skipped: ExportResult['skipped'] = []
    const warningsByRow: ExportResult['warningsByRow'] = []
    const files: ExportResult['files'] = []
    const stamp = new Date().toISOString().slice(0, 10)
    const size = s.pageSize === 'original' ? 'Original' : s.pageSize === 'custom' ? `${s.customMm.w}x${s.customMm.h}mm` : s.pageSize
    const suffix = `${size}${s.bleed ? '_bleed' : ''}${s.background ? '' : '_no-bg'}`
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
      const page = buildPage(st.items, s.background ? this.bg : null, opts)
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
