import { create } from 'zustand'
import { get as idbGet, set as idbSet, del as idbDel } from 'idb-keyval'
import QRCode from 'qrcode'
import { engine } from '../engine/client'
import type { AssetKind, QrFileStatus, RowInput } from '../engine/types'
import type { Warning } from '../core/scene'
import { readWorkbook, guessColumns, matchQrFiles, type SheetData, type ColumnMap, type RowRange } from '../core/excel/read'
import { useSettings } from './settings'
import { CUSTOM_FONT, DEFAULT_NAME_FONT, type FontScript } from '../config/fonts'

export interface AssetState {
  name: string
  svg: string
  isDefault: boolean
  warnings: Warning[]
}

export const DEFAULT_ASSETS: Record<AssetKind, { file: string; name: string }> = {
  background: { file: 'artwork/a5.svg', name: 'a5.svg (default)' },
  logo: { file: 'artwork/bkb.svg', name: 'bkb.svg (default, black)' },
  corner: { file: 'artwork/corner.svg', name: 'corner.svg (default)' },
}
export const RED_LOGO = { file: 'artwork/bkc.svg', name: 'bkc.svg (red)' }
export const WHITE_LOGO = { file: 'artwork/bkw.svg', name: 'bkw.svg (blank, white)' }
const BUILTIN_BY_NAME = new Map([RED_LOGO, WHITE_LOGO].map((a) => [a.name, a.file]))

export const SAMPLE_QR = '__sample__.svg'
const SAMPLE_ROW: RowInput = {
  index: -1, excelRow: 0, name: 'The Pizza Company Sihanou', mid: '124092620291906', midImprecise: false, qrFile: SAMPLE_QR,
}

interface AppState {
  ready: boolean
  error: string | null
  assets: Partial<Record<AssetKind, AssetState>>
  workbookName: string | null
  /** Where rows come from: an Excel file + QR files, or a generated KHQR PDF. */
  source: 'excel' | 'pdf'
  /** PDF import progress / summary. */
  pdfBusy: [number, number] | null
  pdfSummary: { pages: number; codes: number; pagesWithout: number } | null
  sheets: SheetData[]
  sheetIndex: number
  cols: ColumnMap
  /** Export range by Excel row number (not persisted). */
  range: RowRange
  qrFiles: QrFileStatus[]
  qrBusy: [number, number] | null
  selected: number
  /** User fonts for the merchant name (file name per script). */
  customFonts: Partial<Record<FontScript, string>>
  init: () => Promise<void>
  setAssetFile: (kind: AssetKind, file: File) => Promise<void>
  setAssetUrl: (kind: AssetKind, url: string, name: string) => Promise<void>
  resetAsset: (kind: AssetKind) => Promise<void>
  loadWorkbook: (file: File) => Promise<void>
  setSource: (s: 'excel' | 'pdf') => void
  loadPdf: (file: File) => Promise<void>
  setSheet: (i: number) => void
  setCols: (c: Partial<ColumnMap>) => void
  setRange: (r: Partial<RowRange>) => void
  addQrFiles: (files: File[]) => Promise<void>
  clearQrFiles: () => Promise<void>
  reprocessRaster: (redraw: boolean) => Promise<void>
  select: (i: number) => void
  setCustomFont: (script: FontScript, file: File) => Promise<void>
  removeCustomFont: (script: FontScript) => Promise<void>
}

async function fetchText(url: string) {
  const r = await fetch(url)
  if (!r.ok) throw new Error(`Could not load ${url}`)
  return r.text()
}

export const useApp = create<AppState>()((set, get) => ({
  ready: false,
  error: null,
  assets: {},
  workbookName: null,
  source: 'excel',
  pdfBusy: null,
  pdfSummary: null,
  sheets: [],
  sheetIndex: 0,
  cols: { name: -1, mid: -1, qr: -1 },
  range: { from: null, to: null },
  qrFiles: [],
  qrBusy: null,
  selected: -1,
  customFonts: {},

  init: async () => {
    try {
      await engine().ready()
      for (const kind of ['background', 'logo', 'corner'] as AssetKind[]) {
        const saved = await idbGet<{ name: string; svg?: string; url?: string }>(`asset:${kind}`).catch(() => undefined)
        // Built-in choices (red / blank logo) are stored by URL and always fetched fresh;
        // older versions stored their SVG text, so map those names back to the file too.
        const url = saved?.url ?? BUILTIN_BY_NAME.get(saved?.name ?? '')
        const svg = url ? await fetchText(url) : saved?.svg ?? (await fetchText(DEFAULT_ASSETS[kind].file))
        const name = saved?.name ?? DEFAULT_ASSETS[kind].name
        const warnings = await engine().setAsset(kind, svg, !saved)
        set((st) => ({ assets: { ...st.assets, [kind]: { name, svg, isDefault: !saved, warnings } } }))
      }
      const sample = await QRCode.toString('KHQR SAMPLE - replace with your QR files', { type: 'svg', margin: 4, errorCorrectionLevel: 'M' })
      await engine().addQrFiles([{ name: SAMPLE_QR, bytes: new TextEncoder().encode(sample), mime: 'image/svg+xml' }], true)
      for (const script of ['latin', 'khmer'] as FontScript[]) {
        const saved = await idbGet<{ name: string; bytes: Uint8Array }>(`font:${script}`).catch(() => undefined)
        if (saved && (await engine().registerFont(CUSTOM_FONT[script], script, saved.bytes)).ok) {
          set((st) => ({ customFonts: { ...st.customFonts, [script]: saved.name } }))
        }
      }
      // A custom font chosen earlier but no longer stored falls back to the guide font.
      const s = useSettings.getState()
      const missing = (script: FontScript, id: string) => id === CUSTOM_FONT[script] && !get().customFonts[script]
      if (missing('latin', s.s.nameFontLatin)) s.set({ nameFontLatin: DEFAULT_NAME_FONT.latin })
      if (missing('khmer', s.s.nameFontKhmer)) s.set({ nameFontKhmer: DEFAULT_NAME_FONT.khmer })
      set({ ready: true })
    } catch (e) {
      set({ error: (e as Error).message })
    }
  },

  setAssetFile: async (kind, file) => {
    if (!/\.svg$/i.test(file.name) && file.type !== 'image/svg+xml') {
      set({ error: `${file.name}: ${kind} must be an SVG file (vector only).` })
      return
    }
    const svg = await file.text()
    try {
      const warnings = await engine().setAsset(kind, svg)
      await idbSet(`asset:${kind}`, { name: file.name, svg }).catch(() => undefined)
      set((st) => ({ error: null, assets: { ...st.assets, [kind]: { name: file.name, svg, isDefault: false, warnings } } }))
    } catch (e) {
      set({ error: `${file.name}: ${(e as Error).message}` })
    }
  },

  setAssetUrl: async (kind, url, name) => {
    const svg = await fetchText(url)
    const warnings = await engine().setAsset(kind, svg)
    await idbSet(`asset:${kind}`, { name, url }).catch(() => undefined)
    set((st) => ({ assets: { ...st.assets, [kind]: { name, svg, isDefault: false, warnings } } }))
  },

  resetAsset: async (kind) => {
    await idbDel(`asset:${kind}`).catch(() => undefined)
    const svg = await fetchText(DEFAULT_ASSETS[kind].file)
    const warnings = await engine().setAsset(kind, svg, true)
    set((st) => ({ assets: { ...st.assets, [kind]: { name: DEFAULT_ASSETS[kind].name, svg, isDefault: true, warnings } } }))
  },

  loadWorkbook: async (file) => {
    try {
      const sheets = readWorkbook(new Uint8Array(await file.arrayBuffer()))
      const idx = Math.max(0, sheets.findIndex((s) => s.rows.length > 0))
      if (!sheets.length || !sheets[idx]?.rows.length) throw new Error('No data rows found.')
      set({ workbookName: file.name, sheets, sheetIndex: idx, cols: guessColumns(sheets[idx].headers), range: { from: null, to: null }, selected: 0, error: null })
    } catch (e) {
      set({ error: `${file.name}: ${(e as Error).message}` })
    }
  },

  setSource: (source) => set({ source }),

  loadPdf: async (file) => {
    set({ pdfBusy: [0, 0], error: null })
    try {
      const { readKhqrPdf } = await import('../core/import/pdfRead')
      const { pdfToSheet, PDF_COLS } = await import('../core/import/pdfText')
      const { pages, images } = await readKhqrPdf(new Uint8Array(await file.arrayBuffer()), (p, t) => set({ pdfBusy: [p, t] }))
      if (!images.length) throw new Error('No QR code found in this PDF.')
      // Replace the loaded QR files with the codes cut from the PDF.
      await get().clearQrFiles()
      const results = await engine().addQrFiles(images.map((i) => ({ name: i.name, bytes: i.png, mime: 'image/png' })), true)
      const sheet = pdfToSheet(file.name, pages)
      const hasPayloadNames = sheet.rows.some((r) => r[PDF_COLS.name].text)
      set({
        workbookName: file.name,
        sheets: [sheet],
        sheetIndex: 0,
        cols: { name: hasPayloadNames ? PDF_COLS.name : PDF_COLS.textName, mid: PDF_COLS.mid, qr: PDF_COLS.qr },
        range: { from: null, to: null },
        selected: 0,
        qrFiles: results,
        pdfSummary: { pages: pages.length, codes: images.length, pagesWithout: pages.filter((p) => !p.qrs.length).length },
      })
    } catch (e) {
      set({ error: `${file.name}: ${(e as Error).message}` })
    } finally {
      set({ pdfBusy: null })
    }
  },

  setSheet: (i) => {
    const sh = get().sheets[i]
    if (sh) set({ sheetIndex: i, cols: guessColumns(sh.headers), range: { from: null, to: null }, selected: 0 })
  },

  setCols: (c) => set((st) => ({ cols: { ...st.cols, ...c } })),

  setRange: (r) => set((st) => ({ range: { ...st.range, ...r } })),

  addQrFiles: async (files) => {
    const accepted = files.filter((f) => /\.(svg|png|jpe?g|webp)$/i.test(f.name))
    if (!accepted.length) return
    set({ qrBusy: [0, accepted.length] })
    const payload = await Promise.all(accepted.map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), mime: f.type })))
    const redraw = useSettings.getState().s.redrawRaster
    const BATCH = 50
    const results: QrFileStatus[] = []
    for (let i = 0; i < payload.length; i += BATCH) {
      const chunk = payload.slice(i, i + BATCH)
      results.push(...(await engine().addQrFiles(chunk, redraw)))
      set({ qrBusy: [Math.min(i + BATCH, payload.length), payload.length] })
    }
    set((st) => {
      const map = new Map(st.qrFiles.map((q) => [q.name, q]))
      for (const r of results) map.set(r.name, r)
      return { qrFiles: [...map.values()], qrBusy: null }
    })
  },

  clearQrFiles: async () => {
    await engine().clearQrs()
    set({ qrFiles: [] })
    const sample = await QRCode.toString('KHQR SAMPLE - replace with your QR files', { type: 'svg', margin: 4 })
    await engine().addQrFiles([{ name: SAMPLE_QR, bytes: new TextEncoder().encode(sample), mime: 'image/svg+xml' }], true)
  },

  reprocessRaster: async (redraw) => {
    const results = await engine().reprocessRaster(redraw)
    set((st) => {
      const map = new Map(st.qrFiles.map((q) => [q.name, q]))
      for (const r of results) if (map.has(r.name)) map.set(r.name, r)
      return { qrFiles: [...map.values()] }
    })
  },

  select: (i) => set({ selected: i }),

  setCustomFont: async (script, file) => {
    if (!/\.(ttf|otf)$/i.test(file.name)) {
      set({ error: `${file.name}: use a .ttf or .otf font file.` })
      return
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const r = await engine().registerFont(CUSTOM_FONT[script], script, bytes)
    if (!r.ok) {
      set({ error: `${file.name}: ${r.error}` })
      return
    }
    await idbSet(`font:${script}`, { name: file.name, bytes }).catch(() => undefined)
    set((st) => ({ error: null, customFonts: { ...st.customFonts, [script]: file.name } }))
    useSettings.getState().set(script === 'latin' ? { nameFontLatin: CUSTOM_FONT.latin } : { nameFontKhmer: CUSTOM_FONT.khmer })
  },

  removeCustomFont: async (script) => {
    await idbDel(`font:${script}`).catch(() => undefined)
    set((st) => {
      const next = { ...st.customFonts }
      delete next[script]
      return { customFonts: next }
    })
    const s = useSettings.getState()
    if (script === 'latin' && s.s.nameFontLatin === CUSTOM_FONT.latin) s.set({ nameFontLatin: DEFAULT_NAME_FONT.latin })
    if (script === 'khmer' && s.s.nameFontKhmer === CUSTOM_FONT.khmer) s.set({ nameFontKhmer: DEFAULT_NAME_FONT.khmer })
  },
}))

/** Rows derived from the current sheet, column map and matched QR files. */
export function deriveRows(st: Pick<AppState, 'sheets' | 'sheetIndex' | 'cols' | 'qrFiles'>): {
  rows: RowInput[]
  unmatchedFiles: string[]
  ambiguousRows: number[]
} {
  const sheet = st.sheets[st.sheetIndex]
  if (!sheet) return { rows: [SAMPLE_ROW], unmatchedFiles: [], ambiguousRows: [] }
  const names = st.qrFiles.map((q) => q.name)
  const m = matchQrFiles(sheet, st.cols, names)
  const rows = sheet.rows.map((cells, i): RowInput => {
    const mid = st.cols.mid >= 0 ? cells[st.cols.mid] : undefined
    return {
      index: i,
      excelRow: sheet.rowNumbers[i],
      name: st.cols.name >= 0 ? cells[st.cols.name]?.text ?? '' : '',
      mid: mid?.text ?? '',
      midImprecise: mid?.imprecise ?? false,
      qrFile: m.byRow[i],
    }
  })
  return { rows, unmatchedFiles: m.unmatchedFiles, ambiguousRows: m.ambiguousRows }
}

export { SAMPLE_ROW }
